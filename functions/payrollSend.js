/**
 * Lønnsoppsummeringen til regnskapsfører (HR › Lønn).
 *
 * Månedens grunnlag ligger i families/{id}/hr/payroll/runs/{YYYY-MM}, lagret og godkjent i appen
 * (src/arbeid/payroll.js). Her sendes den godkjente versjonen, slik den står, til adressen i
 * families/{id}/hr/payroll. Bare den som kan redigere HR › Lønn (eller eier/administrator) kan sende.
 * Svar til e-posten går til den som sendte.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  assertCompanyAccess, assertRateLimit, hashRateKey, isValidEmail, requireAuth,
} from './security.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { friendlyMailError, sendMail } from './mail.js';
import {
  buildPayrollMailHtml, normalizePayrollRun, normalizePayrollSettings,
} from '../src/arbeid/payrollMail.js';

if (!getApps().length) initializeApp();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

async function authUser(uid) {
  try {
    const user = await getAuth().getUser(uid);
    return { email: text(user?.email).toLowerCase(), name: text(user?.displayName, 120) };
  } catch {
    return { email: '', name: '' };
  }
}

/** Send måneden. deps (authUser, mailKey, sendMail, now) kan byttes i tester. */
export async function sendPayrollRun(db, { familyId, month, uid, deps = {} }) {
  const base = `families/${familyId}/hr/payroll`;
  const [settingsSnap, runSnap, familySnap] = await Promise.all([
    db.doc(base).get(),
    db.doc(`${base}/runs/${month}`).get(),
    db.doc(`families/${familyId}`).get(),
  ]);
  const settings = normalizePayrollSettings(settingsSnap.exists ? settingsSnap.data() : {});
  if (!settings.accountantEmail) {
    throw new HttpsError('failed-precondition', 'Legg inn e-posten til regnskapsfører først.');
  }
  const run = normalizePayrollRun(runSnap.exists ? runSnap.data() : {}, month);
  if (run.status === 'draft' || !run.approvedAt) {
    throw new HttpsError('failed-precondition', 'Lønnsgrunnlaget må godkjennes før det sendes.');
  }
  if (!run.rows.length) throw new HttpsError('failed-precondition', 'Lønnsgrunnlaget er tomt.');
  const family = familySnap.exists ? familySnap.data() || {} : {};
  const companyName = text(family.company?.firma || family.company?.name || family.name, 120);
  const sender = await (deps.authUser || authUser)(uid);
  const senderName = run.approvedByName || sender.name;
  const mail = buildPayrollMailHtml({
    month, rows: run.rows, companyName, senderName, note: run.note,
  });
  const key = deps.mailKey !== undefined ? deps.mailKey : await resolveMailApiKey();
  if (!key) throw new HttpsError('unavailable', 'E-post er ikke satt opp på serveren.');
  const send = deps.sendMail || sendMail;
  const cc = [settings.ccEmail, sender.email]
    .filter((v, i, all) => isValidEmail(v) && v !== settings.accountantEmail && all.indexOf(v) === i);
  const now = (deps.now || (() => new Date()))().toISOString();
  const ref = db.doc(`${base}/runs/${month}`);
  try {
    await send(key, {
      to: settings.accountantEmail,
      name: settings.accountantName,
      cc,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      fromName: (companyName || 'ProTop').replace(/[<>"]/g, ''),
      replyTo: isValidEmail(sender.email) ? sender.email : '',
    });
  } catch (error) {
    const message = friendlyMailError(error);
    logger.warn('payrollSend failed', { familyId, month, message });
    await ref.set({ sendError: text(message, 300), updatedAt: now }, { merge: true });
    throw new HttpsError('unavailable', `Kunne ikke sende: ${message}`);
  }
  const sentTo = [settings.accountantEmail, ...cc].slice(0, 5);
  await ref.set({ status: 'sent', sentAt: now, sentTo, sendError: '', updatedAt: now }, { merge: true });
  return { ok: true, run: { ...run, status: 'sent', sentAt: now, sentTo, sendError: '' } };
}

export const payrollSend = onCall(CALL, async (request) => {
  const uid = requireAuth(request.auth);
  const data = request.data || {};
  const familyId = text(data.familyId, 120);
  const month = text(data.month, 7);
  if (!familyId || familyId.includes('/')) throw new HttpsError('invalid-argument', 'Bedrift mangler.');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpsError('invalid-argument', 'Ugyldig måned.');
  const db = getFirestore();
  await assertRateLimit(db, { key: hashRateKey(['payroll-send', uid]), limit: 20, windowMs: 60 * 60 * 1000 });
  await assertCompanyAccess(db, familyId, uid, {
    resource: 'hrPayroll', action: 'read', message: 'Du har ikke tilgang til å sende lønnsgrunnlaget.',
  });
  return sendPayrollRun(db, { familyId, month, uid });
});
