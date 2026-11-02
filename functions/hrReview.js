/**
 * Medarbeidersamtalen: det den ansatte gjør (forberedelse og signatur), og den signerte kopien
 * på e-post. Se src/hr/reviewPrep.js.
 *
 * Den ansatte skriver aldri selv i families/{id}/hrReviewPrep eller i det utfylte skjemaet
 * (formDocs). Alt går hit, der det sjekkes at den innloggede er koblet til ansattposten samtalen
 * gjelder, og at samtalen står i riktig steg. Signaturen får serverens tidspunkt.
 *
 * Når den ansatte signerer: skjemaet slik lederen sendte det (snapshot) får signaturen og
 * merknaden, merkes ferdig og lagres. Deretter lages PDF, og begge får en kopi på e-post.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  assertCompanyAccess, assertFamilyMember, assertRateLimit, hashRateKey, isValidEmail, requireAuth,
} from './security.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { friendlyMailError, normalizeFileAttachment, sendMail } from './mail.js';
import { normalizeFilledDoc } from '../src/forms/filledDocs.js';
import { tokenContext } from '../src/forms/tokens.js';
import { companyLogoOf } from '../src/project/companyLogo.js';
import { displayName } from '../src/employees/model.js';
import {
  COMMENT_MAX, PREP_COLLECTION, canAnswer, copyFileName, copyMail, normalizePrep, signedDoc, withAnswers,
} from '../src/hr/reviewPrep.js';
import { buildReviewCopyPdf } from '../src/hr/reviewCopyPdf.js';

if (!getApps().length) initializeApp();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 90,
  memory: '512MiB',
  cors: true,
  invoker: 'public',
};

const ACTIONS = new Set(['save', 'submit', 'sign', 'resend']);

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function idOf(value, label) {
  const id = text(value, 120);
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', `${label} mangler.`);
  return id;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function authEmail(uid) {
  if (!uid) return '';
  try {
    const user = await getAuth().getUser(uid);
    return text(user?.email, 200).toLowerCase();
  } catch {
    return '';
  }
}

/** Den ansattes adresse: jobb-e-post, privat e-post, ellers kontoens e-post. */
export function employeeAddress(employee, accountEmail = '') {
  const candidates = [employee?.company?.email, employee?.person?.email, accountEmail].map((v) => text(v, 200).toLowerCase());
  return candidates.find((v) => isValidEmail(v)) || '';
}

/** Mottakerne av kopien, uten dubletter. */
export function copyRecipients({ employeeEmail = '', leaderEmail = '' } = {}) {
  return [...new Set([employeeEmail, leaderEmail].map((v) => text(v, 200).toLowerCase()).filter((v) => isValidEmail(v)))];
}

async function notify(db, uid, { familyId, title, body, createdBy }) {
  if (!uid) return;
  await db.collection(`users/${uid}/notifications`).add({
    eventType: 'hrReviewUpdate', title, body, familyId, createdBy: createdBy || null,
    createdAt: FieldValue.serverTimestamp(), seen: false,
  }).catch((error) => logger.warn('hrReview notify failed', { message: error?.message }));
}

/**
 * Lag PDF og send kopien til begge. Svar: { sentAt, to, failed }. deps kan byttes i tester.
 */
export async function mailSignedCopy(db, { familyId, prep, doc, employee, deps = {} }) {
  const familySnap = await db.doc(`families/${familyId}`).get();
  const family = familySnap.exists ? familySnap.data() || {} : {};
  const company = tokenContext(family.company, { fallbackName: family.name });
  const bytes = buildReviewCopyPdf(doc, {
    company, logo: companyLogoOf(family.company), employeeName: prep.employeeName, meetingDate: prep.meetingDate,
  });
  const leaderUid = prep.signing?.requestedBy?.uid || prep.leaderUid;
  const lookup = deps.authEmail || authEmail;
  const [employeeAccount, leaderEmail] = await Promise.all([lookup(prep.employeeUid), lookup(leaderUid)]);
  const to = copyRecipients({ employeeEmail: employeeAddress(employee, employeeAccount), leaderEmail });
  const sentAt = new Date().toISOString();
  if (!to.length) return { sentAt, to: [], failed: ['Ingen e-postadresse'] };
  const key = deps.mailKey !== undefined ? deps.mailKey : await resolveMailApiKey();
  if (!key) return { sentAt, to: [], failed: ['E-post er ikke satt opp på serveren'] };
  const checked = normalizeFileAttachment({
    filename: copyFileName(prep), contentType: 'application/pdf', content: Buffer.from(bytes).toString('base64'),
  });
  if (!checked.ok) return { sentAt, to: [], failed: [checked.error] };
  const mail = copyMail(prep, { companyName: company.firma });
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">${escapeHtml(mail.text).replace(/\n/g, '<br>')}</div>`;
  const fromName = text(company.firma, 80).replace(/[<>"]/g, '') || 'ProTop';
  const send = deps.sendMail || sendMail;
  const results = await Promise.allSettled(to.map((address) => send(key, {
    to: address,
    subject: mail.subject,
    text: mail.text,
    html,
    fromName,
    replyTo: address === leaderEmail ? '' : leaderEmail,
    attachments: [checked.attachment],
  })));
  const sent = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') sent.push(to[i]);
    else failed.push(`${to[i]}: ${friendlyMailError(r.reason)}`.slice(0, 200));
  });
  return { sentAt, to: sent, failed };
}

/**
 * Det den ansatte gjør. Svar: { ok, prep } (og mail ved signering).
 * store: Firestore (admin); deps kan byttes i tester.
 */
export async function employeeAction(db, { familyId, docId, uid, action, answers, comment, now = new Date(), deps = {} }) {
  const prepRef = db.doc(`families/${familyId}/${PREP_COLLECTION}/${docId}`);
  const snap = await prepRef.get();
  const prep = snap.exists ? normalizePrep({ ...snap.data(), docId }) : null;
  if (!prep) throw new HttpsError('not-found', 'Fant ikke samtalen.');
  if (!prep.employeeUid || prep.employeeUid !== uid) {
    throw new HttpsError('permission-denied', 'Samtalen gjelder en annen ansatt.');
  }
  const empSnap = await db.doc(`families/${familyId}/employees/${prep.employeeId}`).get();
  const employee = empSnap.exists ? empSnap.data() || {} : null;
  if (!employee || text(employee.personUid, 128) !== uid) {
    throw new HttpsError('permission-denied', 'Du er ikke koblet til ansattposten samtalen gjelder.');
  }

  if (action === 'save' || action === 'submit') {
    if (!canAnswer(prep)) throw new HttpsError('failed-precondition', 'Samtalen er sendt til signering. Forberedelsen kan ikke endres lenger.');
    const next = withAnswers(prep, answers, { submit: action === 'submit', now });
    await prepRef.set(next);
    if (action === 'submit') {
      await notify(db, prep.leaderUid, {
        familyId,
        title: 'Forberedelse til medarbeidersamtale',
        body: `${prep.employeeName || 'Medarbeideren'} har sendt inn forberedelsen (${Object.keys(next.answers).length} av ${prep.topics.length} tema).`,
        createdBy: uid,
      });
    }
    return { ok: true, prep: next };
  }

  // Signering: bare når lederen har sendt skjemaet, og bare én gang.
  const note = String(comment ?? '').replace(/\r\n?/g, '\n').trim().slice(0, COMMENT_MAX);
  const name = text(displayName(employee) !== 'Uten navn' ? displayName(employee) : prep.employeeName, 120);
  const result = await db.runTransaction(async (tx) => {
    const fresh = await tx.get(prepRef);
    const current = normalizePrep({ ...fresh.data(), docId });
    if (current?.status === 'signed') throw new HttpsError('failed-precondition', 'Du har allerede signert samtalen.');
    if (current?.status !== 'signing' || !current.signing?.doc) {
      throw new HttpsError('failed-precondition', 'Lederen har ikke sendt samtalen til signering, eller har trukket den tilbake.');
    }
    const at = now.toISOString();
    const signature = { name: name || 'Medarbeider', uid, at };
    const doc = normalizeFilledDoc(signedDoc(current.signing.doc, { signature, comment: note, now }));
    if (!doc || doc.id !== docId) throw new HttpsError('failed-precondition', 'Skjemaet mangler. Be lederen sende det på nytt.');
    const next = { ...current, status: 'signed', employeeSignature: signature, comment: note, updatedAt: at, signing: { ...current.signing, doc } };
    tx.set(db.doc(`families/${familyId}/formDocs/${docId}`), JSON.parse(JSON.stringify(doc)));
    tx.set(prepRef, JSON.parse(JSON.stringify(next)));
    return { next, doc };
  });

  let mail;
  try {
    mail = await mailSignedCopy(db, { familyId, prep: result.next, doc: result.doc, employee, deps });
  } catch (error) {
    logger.error('hrReview copy failed', { familyId, docId, message: error?.message });
    mail = { sentAt: now.toISOString(), to: [], failed: ['Kopien kunne ikke lages'] };
  }
  await prepRef.update({ mail });
  await notify(db, result.next.signing?.requestedBy?.uid || prep.leaderUid, {
    familyId,
    title: 'Medarbeidersamtalen er signert',
    body: `${result.next.employeeName || 'Medarbeideren'} har signert${note ? ' og skrevet en merknad' : ''}. ${mail.to.length ? 'Kopi er sendt på e-post.' : 'Kopien ble ikke sendt på e-post.'}`,
    createdBy: uid,
  });
  logger.info('hrReview signed', { familyId, docId, sent: mail.to.length, failed: mail.failed.length });
  return { ok: true, prep: { ...result.next, mail } };
}

/** HR sender kopien på nytt (f.eks. når e-posten feilet). */
export async function resendCopy(db, { familyId, docId, deps = {} }) {
  const prepRef = db.doc(`families/${familyId}/${PREP_COLLECTION}/${docId}`);
  const snap = await prepRef.get();
  const prep = snap.exists ? normalizePrep({ ...snap.data(), docId }) : null;
  if (!prep || prep.status !== 'signed') throw new HttpsError('failed-precondition', 'Samtalen er ikke signert av begge ennå.');
  const docSnap = await db.doc(`families/${familyId}/formDocs/${docId}`).get();
  const doc = docSnap.exists ? normalizeFilledDoc({ ...docSnap.data(), id: docId }) : prep.signing?.doc;
  const empSnap = await db.doc(`families/${familyId}/employees/${prep.employeeId}`).get();
  const mail = await mailSignedCopy(db, { familyId, prep, doc, employee: empSnap.exists ? empSnap.data() : null, deps });
  await prepRef.update({ mail });
  return { ok: true, prep: { ...prep, mail } };
}

export const hrReviewAction = onCall(CALL, async (request) => {
  const uid = requireAuth(request.auth);
  const data = request.data || {};
  const familyId = idOf(data.familyId, 'Bedrift');
  const docId = idOf(data.docId, 'Samtalen');
  const action = ACTIONS.has(data.action) ? data.action : '';
  if (!action) throw new HttpsError('invalid-argument', 'Ukjent handling.');
  const db = getFirestore();
  await assertRateLimit(db, { key: hashRateKey(['hr-review', uid]), limit: 120, windowMs: 60 * 60 * 1000 });
  if (action === 'resend') {
    await assertCompanyAccess(db, familyId, uid, {
      resource: 'hrFollowup', action: 'read', message: 'Du har ikke tilgang til å sende kopien.',
    });
    return resendCopy(db, { familyId, docId });
  }
  await assertFamilyMember(db, familyId, uid);
  return employeeAction(db, {
    familyId, docId, uid, action, answers: data.answers, comment: data.comment,
  });
});
