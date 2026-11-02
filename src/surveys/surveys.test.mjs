/**
 * Kundeundersøkelse og utvikling over tid: modell, CSV, og hele flyten på serveren
 * (utkast → mottakere → utsending → svar via lenke → purring → avslutning → resultat).
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createMemoryDb } from '../helpdesk/memoryDb.js';
import { surveyTrend, trendSentence, uniqueSurveyTitle } from './trend.js';
import { csvFileName, toCsv, trendCsvRows } from './csv.js';
import {
  CUSTOMER_MIN_ANONYMOUS, DEFAULT_CUSTOMER_QUESTIONS, cleanCustomerAnswer, customerAnalysis, customerCsvRows,
  customerResults, customerSummary, customerTrendPoints, isUnhappy, newCustomerSurvey, normalizeCustomerQuestions,
  followUpDue, npsOf, previousCustomerSurvey, questionText,
} from './customerSurvey.js';
import { answerUrl, customerReplyMail, customerSurveyMail } from './customerMail.js';
import { handleCustomerSurvey, shuffle } from './customerService.js';

// ------------------------------------------------------------ trend
{
  const t = surveyTrend([
    { id: 'b', label: '2025', date: '2025-10-01', index: 62, count: 9, areas: [{ area: 'Ledelse', score: 70 }, { area: 'HMS', score: 55 }] },
    { id: 'a', label: '2024', date: '2024-10-01', index: 58, count: 8, areas: [{ area: 'Ledelse', score: 60 }, { area: 'HMS', score: 65 }] },
    { id: 'c', label: '2026', date: '2026-10-01', index: 66, count: 11, areas: [{ area: 'Ledelse', score: 78 }, { area: 'HMS', score: 48 }, { area: 'Ny', score: 90 }] },
  ]);
  assert.deepEqual(t.points.map((p) => p.label), ['2024', '2025', '2026'], 'sortert på dato');
  assert.equal(t.indexDelta, 4);
  assert.deepEqual(t.areaNames, ['Ledelse', 'HMS', 'Ny']);
  const hms = t.matrix.find((m) => m.area === 'HMS');
  assert.deepEqual(hms.values, [65, 55, 48]);
  assert.equal(hms.delta, -7);
  assert.equal(hms.sinceFirst, -17);
  const ny = t.matrix.find((m) => m.area === 'Ny');
  assert.deepEqual(ny.values, [null, null, 90]);
  assert.equal(ny.delta, null);
  assert.deepEqual(t.declining.map((m) => m.area), ['HMS']);
  assert.deepEqual(t.improving.map((m) => m.area), ['Ledelse']);
  assert.equal(t.mustImprove[0].area, 'HMS');
  assert.equal(t.mustImprove[0].reason, 'under målet og ned fra forrige');
  assert.equal(trendSentence(t), 'Opp 4 poeng fra 2025');
  assert.equal(surveyTrend([]), null);
  assert.equal(uniqueSurveyTitle('Kundeundersøkelse 2026', ['kundeundersøkelse 2026', 'Kundeundersøkelse 2026 (2)']), 'Kundeundersøkelse 2026 (3)');
  assert.equal(uniqueSurveyTitle('Ny', ['Annen']), 'Ny');
  assert.equal(trendSentence(surveyTrend([{ id: 'x', date: '2026-01-01', index: 50 }])), '', 'ett punkt: ingen utvikling');

  const rows = trendCsvRows(t);
  assert.deepEqual(rows[0], ['Område', '2024', '2025', '2026', 'Endring fra forrige']);
  assert.deepEqual(rows.find((r) => r[0] === 'HMS'), ['HMS', 65, 55, 48, -7]);
}

// ------------------------------------------------------------ csv
{
  assert.equal(toCsv([['a;b', 'x"y', 1.25, 3, null], ['=SUM(A1)', -2]]), '"a;b";"x""y";1,3;3;\r\n\'=SUM(A1);-2');
  assert.equal(csvFileName('Kundeundersøkelse 2026 – Høst', 'resultat'), 'kundeundersokelse-2026-host-resultat.csv');
}

// ------------------------------------------------------------ modell
{
  const s = newCustomerSurvey({ year: 2026, uid: 'u', now: new Date(2026, 9, 1) });
  assert.equal(s.status, 'draft');
  assert.equal(s.anonymous, false);
  assert.equal(s.questions.length, DEFAULT_CUSTOMER_QUESTIONS.length);
  assert.equal(questionText(s.questions[0], 'Bygg AS'), 'Hvor sannsynlig er det at du vil anbefale Bygg AS til andre?');

  // Bare ett NPS-spørsmål, unike id-er, gyldige typer.
  const qs = normalizeCustomerQuestions([
    { id: 'a', type: 'nps', text: 'A?' }, { id: 'b', type: 'nps', text: 'B?' }, { id: 'a', text: 'dup' },
    { id: 'c', type: 'rar', text: 'C?' }, { id: 'd', text: '' },
  ]);
  assert.deepEqual(qs.map((q) => `${q.id}:${q.type}`), ['a:nps', 'c:scale']);

  // Ny undersøkelse bygger på forrige (samme spørsmål → sammenlignbart).
  const tmpl = { ...s, anonymous: true, questions: [{ id: 'kvalitet', type: 'scale', area: 'Kvalitet', text: 'K?' }] };
  const next = newCustomerSurvey({ year: 2027, template: tmpl });
  assert.equal(next.anonymous, true);
  assert.deepEqual(next.questions.map((q) => q.id), ['kvalitet']);
  assert.notEqual(next.id, s.id);

  // Rensing av svar.
  const open = { ...s, status: 'open' };
  assert.deepEqual(cleanCustomerAnswer(open, { nps: '10', kvalitet: 9, pris: 2 }, { bedre: '  Raskere svar ' }), { answers: { nps: 10, pris: 2 }, texts: { bedre: 'Raskere svar' } });
  assert.equal(cleanCustomerAnswer(open, { nps: 11 }, {}), null);
  assert.equal(cleanCustomerAnswer({ ...open, questions: [{ id: 'x', type: 'scale', text: 'X', required: true }] }, {}, {}), null);

  const nps = npsOf([10, 9, 8, 7, 6, 0]);
  assert.deepEqual([nps.promoters, nps.passives, nps.detractors, nps.score], [2, 2, 2, 0]);
  assert.equal(npsOf([]), null);

  // Navngitt: resultat fra første svar, misfornøyde kunder listes.
  const answers = [
    { id: 'a1', customerName: 'Sola kommune', answers: { nps: 10, kvalitet: 5, fremdrift: 4, pris: 3 }, texts: { bedre: 'Ingenting' } },
    { id: 'a2', customerName: 'Novaform AS', answers: { nps: 4, kvalitet: 2, fremdrift: 1, pris: 3 }, texts: { bedre: 'Holde frister' } },
    { id: 'a3', customerName: 'Ola', answers: { nps: 8, kvalitet: 4 }, texts: {} },
  ];
  const r = customerResults(open, answers);
  assert.equal(r.ready, true);
  assert.equal(r.nps.score, 0);
  assert.equal(r.questions.find((q) => q.id === 'kvalitet').score, Math.round(((11 / 3 - 1) / 4) * 100));
  assert.deepEqual(r.unhappy.map((u) => u.customerName), ['Novaform AS']);
  assert.deepEqual(r.unhappy[0].low.sort(), ['Fremdrift', 'Kvalitet']);
  assert.equal(r.texts[0].answers[0].customerName, 'Sola kommune');
  assert.ok(isUnhappy(open, answers[1]));
  assert.ok(!isUnhappy(open, answers[0]));
  const a = customerAnalysis(r, { nps: -20, index: 40, areas: [{ area: 'Kvalitet', score: 50 }] });
  assert.equal(a.npsDelta, 20);
  assert.equal(a.areas.find((x) => x.area === 'Kvalitet').delta, r.areas.find((x) => x.area === 'Kvalitet').score - 50);
  assert.ok(a.improve.some((x) => x.area === 'Fremdrift'));
  assert.equal(a.unhappyOpen, 1);
  const summary = customerSummary(r);
  assert.deepEqual(Object.keys(summary).sort(), ['areas', 'count', 'index', 'nps', 'ready']);
  const csv = customerCsvRows(open, r);
  assert.ok(csv.some((row) => row[0] === 'NPS' && row[1] === 0));
  assert.ok(csv.some((row) => row[0] === 'Holde frister' && row[1] === 'Novaform AS'));

  // Anonym: ingenting mens den er åpen, og ikke under minimum.
  const anon = { ...open, anonymous: true };
  assert.equal(customerResults(anon, answers).ready, false, 'anonym og åpen');
  assert.equal(customerResults({ ...anon, status: 'closed' }, answers.slice(0, CUSTOMER_MIN_ANONYMOUS - 1)).ready, false);
  const ar = customerResults({ ...anon, status: 'closed' }, answers);
  assert.equal(ar.ready, true);
  assert.deepEqual(ar.unhappy, [], 'anonym: ingen kundeliste');
  assert.equal(ar.texts[0].answers.every((x) => x.customerName === ''), true);
  assert.deepEqual(ar.texts[0].answers.map((x) => x.text), ['Holde frister', 'Ingenting'], 'alfabetisk');

  // Utvikling og forrige.
  const closed = [
    { ...s, id: 'k1', status: 'closed', title: 'Kundeundersøkelse 2025', closedAt: '2025-11-01', stats: { sent: 10 }, summary: { ready: true, count: 5, nps: 10, index: 60, areas: [{ area: 'Kvalitet', score: 60 }] } },
    { ...s, id: 'k2', status: 'closed', title: 'Kundeundersøkelse 2026', closedAt: '2026-11-01', stats: { sent: 8 }, summary: { ready: true, count: 6, nps: 30, index: 70, areas: [{ area: 'Kvalitet', score: 72 }] } },
    { ...s, id: 'k3', status: 'open' },
  ];
  const pts = customerTrendPoints(closed);
  assert.deepEqual(pts.map((p) => [p.label, p.pct]), [['2025', 50], ['2026', 75]]);
  assert.equal(surveyTrend(pts).npsDelta, 20);
  assert.equal(previousCustomerSurvey(closed, closed[1]).id, 'k1');
  assert.equal(previousCustomerSurvey(closed, closed[0]), null);

  const mail = customerSurveyMail({ survey: { ...open, companyName: 'Bygg <AS>', senderName: 'Kari', closesOn: '2026-11-20' }, recipient: { name: 'Per Hansen' }, url: answerUrl('tok') });
  assert.match(mail.subject, /Kundeundersøkelse 2026 – Bygg <AS>/);
  assert.match(mail.text, /Hei Per,/);
  assert.match(mail.text, /https:\/\/protop\.no\/svar\/tok/);
  assert.match(mail.html, /Bygg &lt;AS&gt;/);
  assert.ok(!mail.html.includes('<AS>'), 'HTML-escape');
  assert.match(customerSurveyMail({ survey: { ...open, anonymous: true, companyName: 'X' }, url: 'u', reminder: true }).subject, /^Påminnelse:/);

  assert.deepEqual(shuffle([1, 2, 3], () => 0).sort(), [1, 2, 3]);

  const due = followUpDue({ submittedAt: '2026-10-01T08:00:00Z' }, new Date('2026-10-20T08:00:00Z'));
  assert.deepEqual([due.due, due.overdue], ['2026-10-15', true]);
  assert.equal(followUpDue({ submittedAt: '2026-10-01T08:00:00Z', followUp: { done: true } }).due, '', 'fulgt opp');
  const reply = customerReplyMail({ survey: { companyName: 'Bygg AS', title: 'Kundeundersøkelse 2026', senderName: 'Kari' }, recipient: { name: 'Per Hansen' }, reply: 'Vi <fikser> det.' });
  assert.match(reply.text, /Hei Per/);
  assert.match(reply.html, /Vi &lt;fikser&gt; det\./);
}

// ------------------------------------------------------------ serveren
async function scenario({ anonymous }) {
  const db = createMemoryDb();
  const outbox = [];
  const alerts = [];
  let clock = new Date('2026-10-01T08:00:00Z');
  const access = { owner: 'write', reader: 'read' };
  const deps = {
    db,
    now: () => clock,
    sendMail: async (m) => {
      if (m.to === 'feil@kunde.no') throw new Error('Postkassen finnes ikke');
      outbox.push(m);
    },
    assertAccess: async (familyId, uid, action) => {
      const level = familyId === 'fam_1' ? access[uid] : null;
      if (!level || (action === 'write' && level !== 'write')) {
        const e = new Error('Ingen tilgang'); e.code = 'permission-denied'; throw e;
      }
    },
    companyName: async () => 'Bygg AS',
    newToken: () => randomBytes(24).toString('base64url'),
    hashToken: async (t) => createHash('sha256').update(t).digest('hex'),
    notify: async (uids, payload) => { alerts.push({ uids, ...payload }); },
  };
  const owner = { uid: 'owner', token: { name: 'Kari Leder', email: 'kari@bygg.no', email_verified: true } };
  const reader = { uid: 'reader', token: {} };
  const call = (data, auth = owner) => handleCustomerSurvey(data, auth, deps);
  const code = async (p) => { try { await p; return 'ok'; } catch (e) { return e.code; } };

  // Tilgang.
  assert.equal(await code(call({ action: 'list', familyId: 'fam_1' }, null)), 'unauthenticated');
  assert.equal(await code(call({ action: 'list', familyId: 'fam_2' })), 'permission-denied');
  assert.equal(await code(call({ action: 'save', familyId: 'fam_1', survey: {} }, reader)), 'permission-denied');
  assert.equal(await code(call({ action: 'hack', familyId: 'fam_1' })), 'invalid-argument');

  const draft = newCustomerSurvey({ year: 2026, now: clock });
  const { survey } = await call({ action: 'save', familyId: 'fam_1', survey: { ...draft, anonymous } });
  assert.equal(survey.status, 'draft');
  const sid = survey.id;
  // En annen bedrift ser den ikke.
  assert.equal(await code(call({ action: 'results', familyId: 'fam_1', surveyId: 'finnes_ikke' })), 'not-found');
  assert.equal((await call({ action: 'list', familyId: 'fam_1' }, reader)).surveys.length, 1);

  // Sending krever mottakere.
  assert.equal(await code(call({ action: 'send', familyId: 'fam_1', surveyId: sid })), 'failed-precondition');
  const add = await call({
    action: 'addRecipients',
    familyId: 'fam_1',
    surveyId: sid,
    recipients: [
      { name: 'Per Hansen', email: 'Per@Kunde.no', customerName: 'Novaform AS', customerId: 'c1' },
      { name: 'Per igjen', email: 'per@kunde.no' },
      { name: 'Lise', email: 'lise@sola.kommune.no', customerName: 'Sola kommune' },
      { name: 'Ola', email: 'ola@privat.no' },
      { name: 'Tom', email: 'ugyldig' },
      { name: 'Feil', email: 'feil@kunde.no' },
    ],
  });
  assert.equal(add.added, 4);
  assert.deepEqual(add.skipped.map((x) => x.reason), ['Står allerede på listen', 'Ugyldig e-post']);

  const sent = await call({ action: 'send', familyId: 'fam_1', surveyId: sid });
  assert.deepEqual([sent.opened, sent.sent, sent.failed], [true, 3, 1]);
  assert.equal(outbox.length, 3);
  assert.equal(outbox[0].fromName, 'Bygg AS');
  assert.equal(outbox[0].replyTo, 'kari@bygg.no');
  const linkOf = (mail) => mail.text.match(/svar\/([A-Za-z0-9_-]+)/)[1];
  const tokenFor = (email) => linkOf(outbox.filter((m) => m.to === email && /svar\//.test(m.text)).at(-1));
  // Lenken lagres bare som hash.
  assert.ok(!JSON.stringify(db.dump()).includes(tokenFor('per@kunde.no')));
  // Spørsmålene er låst etter utsending, men fristen kan endres.
  const locked = await call({ action: 'save', familyId: 'fam_1', survey: { ...survey, questions: [{ id: 'x', text: 'Nytt?' }], closesOn: '2026-11-15' } });
  assert.equal(locked.survey.closesOn, '2026-11-15');
  assert.equal(locked.survey.questions.length, DEFAULT_CUSTOMER_QUESTIONS.length);
  assert.equal(await code(call({ action: 'delete', familyId: 'fam_1', surveyId: sid })), 'failed-precondition');

  // Kunden åpner lenken uten innlogging.
  const opened = await call({ action: 'open', token: tokenFor('per@kunde.no') }, null);
  assert.equal(opened.survey.companyName, 'Bygg AS');
  assert.equal(opened.answered, false);
  assert.equal(opened.recipientName, anonymous ? '' : 'Per');
  assert.match(opened.survey.questions[0].text, /anbefale Bygg AS/);
  assert.ok(!('familyId' in opened.survey), 'ingen interne felter');
  assert.equal(await code(call({ action: 'open', token: 'x'.repeat(30) }, null)), 'not-found');
  assert.equal(await code(call({ action: 'open', token: '../../hack' }, null)), 'not-found');

  // Svar, og ikke to ganger.
  assert.equal(await code(call({ action: 'submit', token: tokenFor('per@kunde.no'), values: {} }, null)), 'invalid-argument');
  await call({ action: 'submit', token: tokenFor('per@kunde.no'), values: { nps: 3, kvalitet: 2, fremdrift: 1 }, texts: { bedre: 'Holde avtalte frister' } }, null);
  assert.equal(await code(call({ action: 'submit', token: tokenFor('per@kunde.no'), values: { nps: 10 } }, null)), 'already-exists');
  // Misfornøyd kunde: varsel med en gang til den som laget og sendte (navngitt), ingen i anonym.
  if (anonymous) assert.equal(alerts.length, 0);
  else {
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0].uids, ['owner']);
    assert.equal(alerts[0].eventType, 'customerSurveyAlert');
    assert.match(alerts[0].title, /Novaform AS/);
    assert.match(alerts[0].body, /3 av 10/);
    assert.match(alerts[0].body, /14 dager/);
  }
  assert.equal((await call({ action: 'open', token: tokenFor('per@kunde.no') }, null)).answered, true);
  clock = new Date('2026-10-02T09:00:00Z');
  await call({ action: 'submit', token: tokenFor('lise@sola.kommune.no'), values: { nps: 10, kvalitet: 5, fremdrift: 4, pris: 4 } }, null);

  // Mottakerlisten: i en anonym undersøkelse vises ikke hvem som har svart.
  const rec = (await call({ action: 'recipients', familyId: 'fam_1', surveyId: sid })).recipients;
  const per = rec.find((r) => r.email === 'per@kunde.no');
  assert.equal(per.answered, anonymous ? null : true);
  assert.equal(rec.find((r) => r.email === 'feil@kunde.no').status, 'failed');
  // Den som har svart, kan ikke fjernes. Anonym: samme svar for alle sendte, så ingen ser hvem som har svart.
  const ola = rec.find((r) => r.email === 'ola@privat.no');
  const removeErr = async (id) => { try { await call({ action: 'removeRecipient', familyId: 'fam_1', surveyId: sid, recipientId: id }); return 'ok'; } catch (e) { return `${e.code}:${e.message}`; } };
  const perErr = await removeErr(per.id);
  assert.match(perErr, /^failed-precondition/);
  if (anonymous) assert.equal(perErr, await removeErr(ola.id), 'samme melding for svart og ikke svart');

  // Resultater mens den er åpen.
  const live = await call({ action: 'results', familyId: 'fam_1', surveyId: sid });
  assert.equal(live.count, 2);
  if (anonymous) {
    assert.deepEqual(live.answers, [], 'anonym: ingen svar før avslutning');
  } else {
    assert.equal(live.answers[0].customerName, 'Sola kommune', 'nyeste først');
    assert.equal(live.answers[1].customerName, 'Novaform AS');
    assert.equal(alerts.length, 1, 'fornøyd kunde gir ikke varsel');
    const unhappy = customerResults(live.survey, live.answers, { now: clock }).unhappy[0];
    assert.equal(unhappy.due, '2026-10-15');
    assert.equal(unhappy.overdue, false);
    const before = outbox.length;
    const fu = await call({ action: 'followUp', familyId: 'fam_1', surveyId: sid, answerId: live.answers[1].id, done: true, note: 'Ringt, avtalt befaring', reply: 'Vi har snakket med prosjektlederen og satt opp ukentlige møter.' });
    assert.equal(fu.followUp.by, 'Kari Leder');
    assert.ok(fu.followUp.repliedAt);
    assert.equal(outbox.length, before + 1);
    assert.equal(outbox.at(-1).to, 'per@kunde.no');
    assert.match(outbox.at(-1).subject, /^Takk for tilbakemeldingen/);
    assert.match(outbox.at(-1).text, /ukentlige møter/);
    // Ny oppfølging uten svar beholder svaret som ble sendt.
    const fu2 = await call({ action: 'followUp', familyId: 'fam_1', surveyId: sid, answerId: live.answers[1].id, done: false, note: 'Åpnet igjen' });
    assert.match(fu2.followUp.reply, /ukentlige møter/);
    assert.equal(customerResults(live.survey, (await call({ action: 'results', familyId: 'fam_1', surveyId: sid })).answers).unhappy[0].followUp.done, false);
  }
  // Lagret anonymt svar har ingen kunde eller tid.
  const stored = Object.entries(db.dump()).filter(([k]) => k.includes(`/${sid}/answers/`)).map(([, v]) => v);
  assert.equal(stored.length, 2);
  for (const v of stored) {
    if (anonymous) assert.deepEqual(Object.keys(v).sort(), ['answers', 'texts']);
    else assert.ok(v.customerName && v.submittedAt);
  }

  // Purring: bare de som ikke har svart, og ikke rett etter utsending.
  const mark = outbox.length;
  clock = new Date('2026-10-01T10:00:00Z');
  assert.equal((await call({ action: 'remind', familyId: 'fam_1', surveyId: sid })).reminded, 0, 'for tidlig');
  clock = new Date('2026-10-04T10:00:00Z');
  const rem = await call({ action: 'remind', familyId: 'fam_1', surveyId: sid });
  assert.equal(rem.reminded, 1);
  assert.deepEqual(outbox.slice(mark).map((m) => m.to), ['ola@privat.no']);
  assert.match(outbox[mark].subject, /^Påminnelse/);
  // Både gammel og ny lenke virker.
  const olaLinks = outbox.filter((m) => m.to === 'ola@privat.no').map(linkOf);
  assert.equal(olaLinks.length, 2);
  for (const t of olaLinks) assert.equal((await call({ action: 'open', token: t }, null)).answered, false);
  assert.equal((await call({ action: 'remind', familyId: 'fam_1', surveyId: sid })).reminded, 0, 'ikke to ganger samme dag');
  await call({ action: 'submit', token: tokenFor('ola@privat.no'), values: { nps: 9, kvalitet: 4, pris: 2 } }, null);

  // Avslutt: sammendrag lagres, nye svar avvises.
  const closed = await call({ action: 'close', familyId: 'fam_1', surveyId: sid });
  assert.equal(closed.summary.ready, true);
  assert.equal(closed.summary.count, 3);
  assert.equal(closed.summary.nps, 33, 'NPS 3, 10 og 9: (2 − 1) / 3');
  assert.equal(await code(call({ action: 'close', familyId: 'fam_1', surveyId: sid })), 'failed-precondition');
  assert.equal(await code(call({ action: 'submit', token: tokenFor('per@kunde.no'), values: { nps: 1 } }, null)), 'failed-precondition');
  assert.equal(outbox.some((m) => m.to === 'feil@kunde.no'), false, 'feilet e-post gir ingen lenke');
  const list = (await call({ action: 'list', familyId: 'fam_1' })).surveys;
  assert.equal(list[0].status, 'closed');
  assert.equal(list[0].stats.answered, 3);
  assert.equal(list[0].summary.count, 3);
  const after = await call({ action: 'results', familyId: 'fam_1', surveyId: sid });
  assert.equal(after.answers.length, 3);
  if (anonymous) {
    for (const x of after.answers) assert.deepEqual(Object.keys(x).sort(), ['answers', 'texts']);
    assert.equal(await code(call({ action: 'followUp', familyId: 'fam_1', surveyId: sid, answerId: 'abc', done: true })), 'failed-precondition');
  }
  const res = customerResults(after.survey, after.answers);
  assert.equal(res.ready, true);
  assert.equal(res.count, 3);
}

await scenario({ anonymous: false });
await scenario({ anonymous: true });

// Utkast kan slettes, med mottakere.
{
  const db = createMemoryDb();
  const deps = { db, assertAccess: async () => {}, newToken: () => 'x', hashToken: async (t) => t };
  const auth = { uid: 'u' };
  const { survey } = await handleCustomerSurvey({ action: 'save', familyId: 'fam_1', survey: newCustomerSurvey() }, auth, deps);
  await handleCustomerSurvey({ action: 'addRecipients', familyId: 'fam_1', surveyId: survey.id, recipients: [{ email: 'a@b.no' }] }, auth, deps);
  await handleCustomerSurvey({ action: 'delete', familyId: 'fam_1', surveyId: survey.id }, auth, deps);
  assert.deepEqual(Object.keys(db.dump()), []);
  // Utkast uten spørsmål avvises.
  await assert.rejects(handleCustomerSurvey({ action: 'save', familyId: 'fam_1', survey: { title: 'Tom', questions: [] } }, auth, deps), /minst ett spørsmål/);
}

console.log('surveys.test.mjs OK');
