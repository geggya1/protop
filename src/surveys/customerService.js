/**
 * Kundeundersøkelsen på serveren: callable `customerSurvey` (functions/customerSurveyCallable.js).
 * Ren logikk med avhengighetene utenfra, så den testes i node med en database i minnet og kan
 * kjøres i den lokale demoen.
 *
 * Lagring (toppnivå, ingen klienttilgang i firestore.rules, bare Admin SDK):
 *   customerSurveys/{surveyId}                      undersøkelsen, med familyId, stats og summary
 *   customerSurveys/{surveyId}/recipients/{id}      mottakere (navn, e-post, kunde, sendt, svart)
 *   customerSurveys/{surveyId}/answers/{id}         svarene. Anonym: bare verdiene, uten kunde og tid.
 *   customerSurveyLinks/{sha256(lenke)}             personlig lenke → undersøkelse og mottaker
 *
 * Lenken i e-posten lagres bare som hash. Den som har lenken, kan svare én gang.
 *
 * deps: {
 *   db, now(), sendMail({ to, name, subject, text, html, fromName, replyTo }),
 *   rateLimit(key, limit, windowMs), assertAccess(familyId, uid, 'read' | 'write'),
 *   companyName(familyId), newToken(), hashToken(token) → Promise<string>, clientKey, log,
 *   notify(uids, { eventType, title, body, familyId }) — varsel i appen (valgfri)
 * }
 */
import {
  FOLLOW_UP_DAYS, NPS_SCALE, cleanCustomerAnswer, customerResults, customerSummary, isUnhappy, normalizeCustomerSurvey,
  newCustomerSurveyId, questionText,
} from './customerSurvey.js';
import { answerUrl, customerReplyMail, customerSurveyMail } from './customerMail.js';

export class SurveyError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const SURVEYS = 'customerSurveys';
const LINKS = 'customerSurveyLinks';
const MAX_RECIPIENTS = 500;
const MAX_SEND = 200;
const MAX_REMINDERS = 3;
const REMIND_GAP_MS = 20 * 60 * 60 * 1000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ID = /^[A-Za-z0-9_-]{3,80}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function fail(code, message) {
  throw new SurveyError(code, message);
}

function idOf(value, what) {
  const id = text(value, 100);
  if (!ID.test(id)) fail('invalid-argument', `Mangler ${what}.`);
  return id;
}

function strip(value) {
  // Firestore tåler ikke undefined.
  return JSON.parse(JSON.stringify(value));
}

/** Fisher–Yates. random kan byttes i tester. */
export function shuffle(list, random = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function ctxOf(deps = {}) {
  if (!deps.db) throw new Error('db mangler');
  return {
    db: deps.db,
    now: deps.now || (() => new Date()),
    sendMail: deps.sendMail || (async () => { throw new Error('E-post er ikke satt opp.'); }),
    rateLimit: deps.rateLimit || (async () => {}),
    assertAccess: deps.assertAccess || (async () => { fail('permission-denied', 'Ingen tilgang.'); }),
    companyName: deps.companyName || (async () => ''),
    newToken: deps.newToken,
    hashToken: deps.hashToken,
    clientKey: text(deps.clientKey, 120) || 'anon',
    random: deps.random || Math.random,
    notify: deps.notify || (async () => {}),
    log: deps.log || (() => {}),
  };
}

function surveyRef(ctx, id) {
  return ctx.db.collection(SURVEYS).doc(id);
}

async function loadSurvey(ctx, familyId, surveyId) {
  const snap = await surveyRef(ctx, surveyId).get();
  const data = snap.exists ? snap.data() || {} : null;
  if (!data || data.familyId !== familyId) fail('not-found', 'Fant ikke undersøkelsen.');
  return normalizeCustomerSurvey({ ...data, id: surveyId });
}

async function listRecipients(ctx, surveyId) {
  const snap = await surveyRef(ctx, surveyId).collection('recipients').get();
  return snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) }));
}

async function listAnswers(ctx, surveyId) {
  const snap = await surveyRef(ctx, surveyId).collection('answers').get();
  return snap.docs.map((row) => ({ id: row.id, ...(row.data() || {}) }));
}

async function writeStats(ctx, surveyId, recipients = null) {
  const rows = recipients || await listRecipients(ctx, surveyId);
  const stats = {
    recipients: rows.length,
    sent: rows.filter((r) => r.sentAt).length,
    answered: rows.filter((r) => r.answered === true || r.answeredAt).length,
  };
  await surveyRef(ctx, surveyId).update({ stats });
  return stats;
}

/** Mottakeren slik bedriften ser den. I en anonym undersøkelse vises ikke hvem som har svart. */
function recipientView(row, anonymous) {
  return {
    id: row.id,
    name: text(row.name, 120),
    email: text(row.email, 200),
    customerId: text(row.customerId, 120),
    customerName: text(row.customerName, 160),
    projectName: text(row.projectName, 160),
    status: row.sentAt ? 'sent' : row.error ? 'failed' : 'pending',
    error: text(row.error, 200),
    sentAt: text(row.sentAt, 40),
    remindedAt: text(row.remindedAt, 40),
    reminders: Number(row.reminders) || 0,
    answered: anonymous ? null : !!row.answeredAt,
    answeredAt: anonymous ? '' : text(row.answeredAt, 40),
  };
}

function publicSurvey(survey) {
  const s = normalizeCustomerSurvey(survey);
  return {
    id: s.id,
    title: s.title,
    intro: s.intro,
    status: s.status,
    anonymous: s.anonymous,
    closesOn: s.closesOn,
    companyName: s.companyName,
    questions: s.questions.map((q) => ({ ...q, text: questionText(q, s.companyName) })),
  };
}

async function newLink(ctx, survey, recipientId) {
  if (!ctx.newToken || !ctx.hashToken) throw new Error('Lenker er ikke satt opp.');
  const token = ctx.newToken();
  const hash = await ctx.hashToken(token);
  await ctx.db.collection(LINKS).doc(hash).set({ surveyId: survey.id, familyId: survey.familyId, recipientId });
  return { token, hash };
}

async function mailRecipient(ctx, survey, recipient, { reminder = false, replyTo = '' } = {}) {
  const { token, hash } = await newLink(ctx, survey, recipient.id);
  const mail = customerSurveyMail({ survey, recipient, url: answerUrl(token), reminder });
  try {
    await ctx.sendMail({
      to: recipient.email,
      name: recipient.name || '',
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      fromName: survey.companyName || 'ProTop',
      ...(replyTo ? { replyTo } : {}),
    });
    return { ok: true, hash };
  } catch (err) {
    // Lenken som ikke kom frem, skal ikke virke.
    await ctx.db.collection(LINKS).doc(hash).delete().catch(() => {});
    ctx.log('Kundeundersøkelse: e-post feilet', { surveyId: survey.id, message: err?.message });
    return { ok: false, error: text(err?.message || 'E-posten kunne ikke sendes.', 200) };
  }
}

// ---------------------------------------------------------------- bedriften

async function actList(ctx, familyId) {
  const snap = await ctx.db.collection(SURVEYS).where('familyId', '==', familyId).get();
  const surveys = snap.docs.map((row) => normalizeCustomerSurvey({ ...row.data(), id: row.id }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { surveys };
}

async function actSave(ctx, familyId, uid, input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const id = raw.id ? idOf(raw.id, 'undersøkelse') : newCustomerSurveyId(ctx.now());
  const snap = await surveyRef(ctx, id).get();
  const existing = snap.exists ? snap.data() || {} : null;
  if (existing && existing.familyId !== familyId) fail('not-found', 'Fant ikke undersøkelsen.');
  const current = existing ? normalizeCustomerSurvey({ ...existing, id }) : null;
  const next = normalizeCustomerSurvey({ ...raw, id });
  if (current && current.status !== 'draft') {
    // Etter utsending kan bare svarfristen endres. Spørsmålene er låst, så svarene kan sammenlignes.
    if (current.status === 'closed') fail('failed-precondition', 'En avsluttet undersøkelse kan ikke endres.');
    await surveyRef(ctx, id).update({ closesOn: next.closesOn });
    return { survey: { ...current, closesOn: next.closesOn } };
  }
  if (!next.questions.length) fail('invalid-argument', 'Undersøkelsen må ha minst ett spørsmål.');
  const doc = strip({
    ...next,
    familyId,
    status: 'draft',
    createdBy: current?.createdBy || uid,
    createdAt: current?.createdAt || ctx.now().toISOString(),
    updatedAt: ctx.now().toISOString(),
    stats: current?.stats || { recipients: 0, sent: 0, answered: 0 },
    summary: null,
  });
  await surveyRef(ctx, id).set(doc);
  return { survey: normalizeCustomerSurvey(doc) };
}

async function actDelete(ctx, familyId, surveyId) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.status !== 'draft') fail('failed-precondition', 'Bare utkast kan slettes. Sendte undersøkelser er en del av historikken.');
  const rows = await listRecipients(ctx, surveyId);
  for (const r of rows) await surveyRef(ctx, surveyId).collection('recipients').doc(r.id).delete();
  await surveyRef(ctx, surveyId).delete();
  return { ok: true };
}

async function actRecipients(ctx, familyId, surveyId) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  const rows = await listRecipients(ctx, surveyId);
  return {
    recipients: rows.map((r) => recipientView(r, survey.anonymous))
      .sort((a, b) => (a.customerName || a.name || a.email).localeCompare(b.customerName || b.name || b.email, 'nb')),
  };
}

async function actAddRecipients(ctx, familyId, surveyId, list) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.status === 'closed') fail('failed-precondition', 'Undersøkelsen er avsluttet.');
  const existing = await listRecipients(ctx, surveyId);
  const emails = new Set(existing.map((r) => text(r.email).toLowerCase()));
  let added = 0;
  const skipped = [];
  for (const row of Array.isArray(list) ? list.slice(0, MAX_RECIPIENTS) : []) {
    const email = text(row?.email, 200).toLowerCase();
    if (!EMAIL.test(email)) {
      skipped.push({ email, reason: 'Ugyldig e-post' });
      continue;
    }
    if (emails.has(email)) {
      skipped.push({ email, reason: 'Står allerede på listen' });
      continue;
    }
    if (existing.length + added >= MAX_RECIPIENTS) {
      skipped.push({ email, reason: `Høyst ${MAX_RECIPIENTS} mottakere` });
      continue;
    }
    emails.add(email);
    await surveyRef(ctx, surveyId).collection('recipients').doc().set(strip({
      name: text(row.name, 120),
      email,
      customerId: text(row.customerId, 120),
      customerName: text(row.customerName, 160),
      projectName: text(row.projectName, 160),
      addedAt: ctx.now().toISOString(),
      sentAt: '',
      links: [],
      reminders: 0,
    }));
    added += 1;
  }
  const stats = await writeStats(ctx, surveyId);
  return { added, skipped, stats };
}

async function actRemoveRecipient(ctx, familyId, surveyId, recipientId) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.status === 'closed') fail('failed-precondition', 'Undersøkelsen er avsluttet.');
  const ref = surveyRef(ctx, surveyId).collection('recipients').doc(idOf(recipientId, 'mottaker'));
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'Fant ikke mottakeren.');
  const data = snap.data() || {};
  // Anonym: feilmeldingen skal ikke avsløre om personen har svart. Sendte mottakere står.
  if (survey.anonymous && data.sentAt) fail('failed-precondition', 'I en anonym undersøkelse kan ikke mottakere som har fått den, fjernes.');
  if (data.answeredAt || data.answered === true) fail('failed-precondition', 'Mottakeren har svart og kan ikke fjernes.');
  for (const hash of Array.isArray(data.links) ? data.links : []) {
    await ctx.db.collection(LINKS).doc(String(hash)).delete().catch(() => {});
  }
  await ref.delete();
  const stats = await writeStats(ctx, surveyId);
  return { ok: true, stats };
}

async function actSend(ctx, familyId, surveyId, auth) {
  let survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.status === 'closed') fail('failed-precondition', 'Undersøkelsen er avsluttet.');
  if (!survey.questions.length) fail('failed-precondition', 'Undersøkelsen har ingen spørsmål.');
  const rows = await listRecipients(ctx, surveyId);
  if (!rows.length) fail('failed-precondition', 'Legg til minst én mottaker.');
  const nowIso = ctx.now().toISOString();
  let opened = false;
  if (survey.status === 'draft') {
    const companyName = text(await ctx.companyName(familyId), 120) || 'Bedriften';
    const senderName = text(auth?.token?.name, 120);
    await surveyRef(ctx, surveyId).update({ status: 'open', openedAt: nowIso, companyName, senderName, sentBy: text(auth?.uid, 128) });
    survey = { ...survey, status: 'open', openedAt: nowIso, companyName, senderName };
    opened = true;
  }
  const replyTo = auth?.token?.email_verified && EMAIL.test(text(auth?.token?.email)) ? text(auth.token.email) : '';
  let sent = 0;
  let failed = 0;
  for (const r of rows.filter((x) => !x.sentAt).slice(0, MAX_SEND)) {
    const res = await mailRecipient(ctx, survey, r, { replyTo });
    const ref = surveyRef(ctx, surveyId).collection('recipients').doc(r.id);
    if (res.ok) {
      sent += 1;
      await ref.update({ sentAt: ctx.now().toISOString(), error: '', links: [...(r.links || []), res.hash] });
    } else {
      failed += 1;
      await ref.update({ error: res.error });
    }
  }
  const stats = await writeStats(ctx, surveyId);
  const left = rows.filter((x) => !x.sentAt).length - sent - failed;
  return { ok: true, opened, sent, failed, left: Math.max(0, left), stats };
}

async function actRemind(ctx, familyId, surveyId, auth) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.status !== 'open') fail('failed-precondition', 'Bare en åpen undersøkelse kan purres.');
  const rows = await listRecipients(ctx, surveyId);
  const now = ctx.now();
  const due = rows.filter((r) => r.sentAt && !r.answeredAt && r.answered !== true
    && (Number(r.reminders) || 0) < MAX_REMINDERS
    && (!r.remindedAt || now.getTime() - new Date(r.remindedAt).getTime() >= REMIND_GAP_MS)
    && (!r.sentAt || now.getTime() - new Date(r.sentAt).getTime() >= REMIND_GAP_MS));
  const replyTo = auth?.token?.email_verified && EMAIL.test(text(auth?.token?.email)) ? text(auth.token.email) : '';
  let reminded = 0;
  let failed = 0;
  for (const r of due.slice(0, MAX_SEND)) {
    const res = await mailRecipient(ctx, survey, r, { reminder: true, replyTo });
    const ref = surveyRef(ctx, surveyId).collection('recipients').doc(r.id);
    if (res.ok) {
      reminded += 1;
      await ref.update({ remindedAt: ctx.now().toISOString(), reminders: (Number(r.reminders) || 0) + 1, links: [...(r.links || []), res.hash] });
    } else {
      failed += 1;
    }
  }
  const waiting = rows.filter((r) => r.sentAt && !r.answeredAt && r.answered !== true).length;
  return { ok: true, reminded, failed, waiting, skipped: Math.max(0, waiting - reminded - failed) };
}

async function actClose(ctx, familyId, surveyId) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.status !== 'open') fail('failed-precondition', 'Bare en sendt undersøkelse kan avsluttes.');
  const closedAt = ctx.now().toISOString();
  // Steng først, så ingen svar kommer inn mens resultatet regnes ut.
  await surveyRef(ctx, surveyId).update({ status: 'closed', closedAt });
  const closed = { ...survey, status: 'closed', closedAt };
  const answers = await listAnswers(ctx, surveyId);
  const summary = strip(customerSummary(customerResults(closed, answers)));
  await surveyRef(ctx, surveyId).update({ summary });
  const stats = await writeStats(ctx, surveyId);
  return { ok: true, summary, stats };
}

async function actResults(ctx, familyId, surveyId) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  const answers = await listAnswers(ctx, surveyId);
  if (survey.anonymous) {
    // Anonym: ingenting før den er avsluttet (ellers kan man se hvem som nettopp svarte),
    // og så bare verdiene i tilfeldig rekkefølge.
    if (survey.status !== 'closed') return { survey, count: answers.length, answers: [] };
    return {
      survey,
      count: answers.length,
      answers: shuffle(answers.map((a) => ({ answers: a.answers || {}, texts: a.texts || {} })), ctx.random),
    };
  }
  return {
    survey,
    count: answers.length,
    answers: answers
      .map((a) => ({
        id: a.id,
        answers: a.answers || {},
        texts: a.texts || {},
        customerName: text(a.customerName, 160),
        recipientName: text(a.recipientName, 120),
        projectName: text(a.projectName, 160),
        submittedAt: text(a.submittedAt, 40),
        followUp: a.followUp || null,
      }))
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
  };
}

async function actFollowUp(ctx, familyId, surveyId, answerId, input, auth) {
  const survey = await loadSurvey(ctx, familyId, surveyId);
  if (survey.anonymous) fail('failed-precondition', 'Anonyme svar kan ikke følges opp per kunde.');
  const ref = surveyRef(ctx, surveyId).collection('answers').doc(idOf(answerId, 'svar'));
  const snap = await ref.get();
  if (!snap.exists) fail('not-found', 'Fant ikke svaret.');
  const answer = snap.data() || {};
  const prev = answer.followUp || {};
  const followUp = {
    done: input?.done === true,
    note: text(input?.note, 1000),
    by: text(auth?.token?.name, 120) || text(auth?.uid, 60),
    at: ctx.now().toISOString(),
    reply: text(prev.reply, 2000),
    repliedAt: text(prev.repliedAt, 40),
  };
  // Svar til kunden: hva som er gjort. Sendes til mottakerens e-post, og lagres på svaret.
  const reply = text(input?.reply, 2000);
  if (reply) {
    const recipientId = text(answer.recipientId, 100);
    const rSnap = recipientId ? await surveyRef(ctx, surveyId).collection('recipients').doc(recipientId).get() : null;
    const recipient = rSnap?.exists ? rSnap.data() || {} : null;
    if (!recipient || !EMAIL.test(text(recipient.email))) fail('failed-precondition', 'Fant ikke e-posten til kunden.');
    const mail = customerReplyMail({ survey, recipient, reply });
    const replyTo = auth?.token?.email_verified && EMAIL.test(text(auth?.token?.email)) ? text(auth.token.email) : '';
    try {
      await ctx.sendMail({
        to: text(recipient.email), name: text(recipient.name), subject: mail.subject, text: mail.text, html: mail.html,
        fromName: survey.companyName || 'ProTop', ...(replyTo ? { replyTo } : {}),
      });
    } catch (err) {
      fail('unavailable', `E-posten til kunden kunne ikke sendes: ${text(err?.message, 160)}`);
    }
    followUp.reply = reply;
    followUp.repliedAt = ctx.now().toISOString();
  }
  await ref.update({ followUp });
  return { ok: true, followUp };
}

// ---------------------------------------------------------------- kunden (uten innlogging)

async function linkFor(ctx, token) {
  const t = text(token, 120);
  if (!TOKEN.test(t)) fail('not-found', 'Lenken er ikke gyldig.');
  const hash = await ctx.hashToken(t);
  const snap = await ctx.db.collection(LINKS).doc(hash).get();
  if (!snap.exists) fail('not-found', 'Lenken er ikke gyldig. Bruk lenken i den siste e-posten du fikk.');
  const link = snap.data() || {};
  const surveySnap = await surveyRef(ctx, text(link.surveyId, 100)).get();
  if (!surveySnap.exists) fail('not-found', 'Undersøkelsen finnes ikke lenger.');
  const survey = normalizeCustomerSurvey({ ...surveySnap.data(), id: surveySnap.id });
  const recipientRef = surveyRef(ctx, survey.id).collection('recipients').doc(text(link.recipientId, 100) || 'x');
  const recipientSnap = await recipientRef.get();
  if (!recipientSnap.exists) fail('not-found', 'Lenken er ikke gyldig lenger.');
  return { survey, recipientRef, recipient: recipientSnap.data() || {} };
}

async function actOpen(ctx, token) {
  await ctx.rateLimit(`open:${ctx.clientKey}`, 120, 60 * 60 * 1000);
  const { survey, recipient } = await linkFor(ctx, token);
  return {
    survey: publicSurvey(survey),
    answered: !!(recipient.answeredAt || recipient.answered === true),
    recipientName: survey.anonymous ? '' : text(recipient.name, 120).split(/\s+/)[0] || '',
  };
}

async function actSubmit(ctx, token, values, texts) {
  await ctx.rateLimit(`submit:${ctx.clientKey}`, 30, 60 * 60 * 1000);
  const { survey, recipientRef, recipient } = await linkFor(ctx, token);
  if (survey.status === 'closed') fail('failed-precondition', 'Undersøkelsen er avsluttet. Takk for interessen!');
  if (survey.status !== 'open') fail('failed-precondition', 'Undersøkelsen er ikke åpnet ennå.');
  const clean = cleanCustomerAnswer(survey, values, texts);
  if (!clean) fail('invalid-argument', 'Svar på minst ett spørsmål.');
  const answerRef = surveyRef(ctx, survey.id).collection('answers').doc();
  const doc = survey.anonymous
    // Anonym: ingen kunde, mottaker eller tidspunkt på svaret.
    ? { answers: clean.answers, texts: clean.texts }
    : {
      ...clean,
      recipientId: recipientRef.id,
      customerName: text(recipient.customerName || recipient.name, 160),
      recipientName: text(recipient.name, 120),
      projectName: text(recipient.projectName, 160),
      submittedAt: ctx.now().toISOString(),
    };
  await ctx.db.runTransaction(async (tx) => {
    const r = await tx.get(recipientRef);
    const data = r.exists ? r.data() || {} : {};
    if (data.answeredAt || data.answered === true) fail('already-exists', 'Du har allerede svart. Takk!');
    const s = await tx.get(surveyRef(ctx, survey.id));
    const sd = s.exists ? s.data() || {} : {};
    if (sd.status !== 'open') fail('failed-precondition', 'Undersøkelsen er avsluttet. Takk for interessen!');
    const stats = sd.stats || {};
    tx.set(answerRef, strip(doc));
    // Anonym: bare at personen har svart (for purring og mot dobbeltsvar), ikke når.
    tx.update(recipientRef, survey.anonymous ? { answered: true } : { answeredAt: ctx.now().toISOString() });
    tx.update(surveyRef(ctx, survey.id), { stats: { ...stats, answered: (Number(stats.answered) || 0) + 1 } });
  });
  // Misfornøyd kunde i en navngitt undersøkelse: varsel til den som laget og sendte den, med en gang.
  if (!survey.anonymous && isUnhappy(survey, doc)) {
    const raw = (await surveyRef(ctx, survey.id).get()).data() || {};
    const uids = [...new Set([text(raw.createdBy, 128), text(raw.sentBy, 128)].filter(Boolean))];
    const npsQ = survey.questions.find((q) => q.type === 'nps');
    const nps = npsQ && NPS_SCALE.includes(Number(doc.answers?.[npsQ.id])) ? Number(doc.answers[npsQ.id]) : null;
    try {
      await ctx.notify(uids, {
        eventType: 'customerSurveyAlert',
        title: `Misfornøyd kunde: ${doc.customerName || doc.recipientName || 'kunde'}`,
        body: [
          nps != null ? `Ga ${nps} av 10 på anbefaling i ${survey.title}.` : `Ga lav score i ${survey.title}.`,
          `Ta kontakt og følg opp innen ${FOLLOW_UP_DAYS} dager.`,
        ].join(' '),
        familyId: survey.familyId,
        surveyId: survey.id,
      });
    } catch (err) {
      ctx.log('Kundeundersøkelse: varsel feilet', { surveyId: survey.id, message: err?.message });
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------- inngang

const STAFF_READ = new Set(['list', 'recipients', 'results']);
const STAFF_WRITE = new Set(['save', 'delete', 'addRecipients', 'removeRecipient', 'send', 'remind', 'close', 'followUp']);

export async function handleCustomerSurvey(data = {}, auth = null, deps = {}) {
  const ctx = ctxOf(deps);
  const action = text(data?.action, 40);
  if (action === 'open') return actOpen(ctx, data.token);
  if (action === 'submit') return actSubmit(ctx, data.token, data.values, data.texts);
  if (!STAFF_READ.has(action) && !STAFF_WRITE.has(action)) fail('invalid-argument', 'Ukjent handling.');
  const uid = text(auth?.uid, 128);
  if (!uid) fail('unauthenticated', 'Du må være innlogget.');
  const familyId = idOf(data.familyId, 'bedrift');
  await ctx.rateLimit(`staff:${uid}`, 300, 60 * 60 * 1000);
  await ctx.assertAccess(familyId, uid, STAFF_WRITE.has(action) ? 'write' : 'read');
  switch (action) {
    case 'list': return actList(ctx, familyId);
    case 'save': return actSave(ctx, familyId, uid, data.survey);
    case 'delete': return actDelete(ctx, familyId, idOf(data.surveyId, 'undersøkelse'));
    case 'recipients': return actRecipients(ctx, familyId, idOf(data.surveyId, 'undersøkelse'));
    case 'addRecipients': return actAddRecipients(ctx, familyId, idOf(data.surveyId, 'undersøkelse'), data.recipients);
    case 'removeRecipient': return actRemoveRecipient(ctx, familyId, idOf(data.surveyId, 'undersøkelse'), data.recipientId);
    case 'send': return actSend(ctx, familyId, idOf(data.surveyId, 'undersøkelse'), auth);
    case 'remind': return actRemind(ctx, familyId, idOf(data.surveyId, 'undersøkelse'), auth);
    case 'close': return actClose(ctx, familyId, idOf(data.surveyId, 'undersøkelse'));
    case 'results': return actResults(ctx, familyId, idOf(data.surveyId, 'undersøkelse'));
    case 'followUp': return actFollowUp(ctx, familyId, idOf(data.surveyId, 'undersøkelse'), data.answerId, data, auth);
    default: return fail('invalid-argument', 'Ukjent handling.');
  }
}

