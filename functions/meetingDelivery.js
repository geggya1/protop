/**
 * Møter: innkalling og referat på e-post, og AI-hjelp.
 *
 * Bare medlemmer av bedriften kan sende. Mottakerne må stå som deltakere i det
 * lagrede møtet (pluss noen få ekstra adresser), så funksjonen ikke kan brukes til
 * å sende e-post til hvem som helst. Referat sendes bare når det er ferdigstilt.
 * Hver mottaker får sin egen e-post, med PDF og eventuelt kalenderfil.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  assertFamilyMember,
  assertRateLimit,
  assertRateLimits,
  hashRateKey,
  isValidEmail,
  requireAuth,
} from './security.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { friendlyMailError, normalizeFileAttachment, sendMail } from './mail.js';
import { mediaBucket } from './storageBucket.js';
import { allowedPath, storagePathFromUrl } from './invoiceFiles.js';
import { friendlyGeminiError } from './aiShared.js';
import { handleAiMeeting } from './meetingAi.js';

if (!getApps().length) initializeApp();

const CALL = {
  region: 'europe-west1',
  cors: true,
  invoker: 'public',
  timeoutSeconds: 120,
  memory: '512MiB',
};

const MAX_RECIPIENTS = 40;
const MAX_EXTRA = 5;
const MAX_TOTAL_BYTES = 9 * 1024 * 1024;

function familyIdFrom(data) {
  const familyId = String(data?.familyId || '').trim();
  if (!familyId || familyId.includes('/')) throw new HttpsError('invalid-argument', 'Bedrift mangler.');
  return familyId;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function emails(list) {
  return [...new Set((Array.isArray(list) ? list : [list])
    .map((row) => String(row || '').trim().toLowerCase())
    .filter((row) => isValidEmail(row)))];
}

async function readFile(file, familyId) {
  const path = String(file?.storagePath || '').trim() || storagePathFromUrl(file?.url);
  if (!allowedPath(path, familyId)) {
    throw new HttpsError('permission-denied', `Vedlegget «${String(file?.name || '').slice(0, 60)}» ligger ikke i bedriftens mappe.`);
  }
  const bucket = await mediaBucket();
  const [bytes] = await bucket.file(path).download();
  return bytes;
}

/** Hvem som kan få e-posten: deltakerne i det lagrede møtet, pluss noen få ekstra. */
export function allowedRecipients(meeting, requested, extra = []) {
  const participants = new Set(emails((meeting?.participants || []).map((p) => p?.email)));
  const extras = emails(extra).filter((row) => !participants.has(row)).slice(0, MAX_EXTRA);
  const allowed = new Set([...participants, ...extras]);
  const to = emails(requested).filter((row) => allowed.has(row));
  const refused = emails(requested).filter((row) => !allowed.has(row));
  return { to: to.slice(0, MAX_RECIPIENTS), refused };
}

export const sendMeetingMail = onCall(CALL, async (request) => {
  const uid = requireAuth(request.auth);
  const data = request.data || {};
  const familyId = familyIdFrom(data);
  const db = getFirestore();
  await assertFamilyMember(db, familyId, uid);
  try {
    await assertRateLimit(db, { key: hashRateKey(['meeting', 'mail', uid]), limit: 60, windowMs: 60 * 60 * 1000 });
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'resource-exhausted') throw err;
    logger.warn('Meeting rate limit skipped', { message: err?.message });
  }

  const meetingId = String(data.meetingId || '').trim();
  if (!meetingId || meetingId.includes('/')) throw new HttpsError('invalid-argument', 'Møtet mangler.');
  const snap = await db.doc(`families/${familyId}/meetings/${meetingId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Fant ikke møtet. Lagre det og prøv igjen.');
  const meeting = snap.data() || {};
  const kind = ['referat', 'avlysning'].includes(data.kind) ? data.kind : 'innkalling';
  if (kind === 'referat' && !['ferdigstilt', 'sendt'].includes(meeting.status)) {
    throw new HttpsError('failed-precondition', 'Referatet må ferdigstilles før det sendes.');
  }
  if (kind === 'innkalling' && meeting.status === 'avlyst') {
    throw new HttpsError('failed-precondition', 'Møtet er avlyst.');
  }
  if (kind === 'avlysning' && meeting.status !== 'avlyst') {
    throw new HttpsError('failed-precondition', 'Møtet er ikke avlyst.');
  }

  const { to, refused } = allowedRecipients(meeting, data.to, data.extra);
  if (!to.length) throw new HttpsError('invalid-argument', 'Velg minst én deltaker med gyldig e-post.');
  const subject = String(data.subject || '').trim().slice(0, 180)
    || `${{ referat: 'Referat', avlysning: 'Avlyst' }[kind] || 'Innkalling'}: ${String(meeting.title || 'Møte').slice(0, 120)}`;
  const text = String(data.text || '').trim().slice(0, 20000);
  if (text.length < 10) throw new HttpsError('invalid-argument', 'Skriv en melding til mottakerne.');
  const replyTo = isValidEmail(String(data.replyTo || '').trim()) ? String(data.replyTo).trim() : '';
  const fromName = String(data.fromName || '').replace(/[<>"]/g, '').trim().slice(0, 80) || 'ProTop';

  const files = Array.isArray(data.files) ? data.files.slice(0, 6) : [];
  const attachments = [];
  let total = 0;
  for (const file of files) {
    let content = String(file?.base64 || '').replace(/\s/g, '');
    if (!content) content = Buffer.from(await readFile(file, familyId)).toString('base64');
    const checked = normalizeFileAttachment({ filename: file?.name, contentType: file?.mime, content });
    if (!checked.ok) throw new HttpsError('invalid-argument', `${file?.name || 'Vedlegg'}: ${checked.error}`);
    total += Math.round(checked.attachment.content.length * 0.75);
    if (total > MAX_TOTAL_BYTES) throw new HttpsError('invalid-argument', 'Vedleggene er for store for e-post (over 9 MB).');
    attachments.push(checked.attachment);
  }

  const key = await resolveMailApiKey();
  if (!key) throw new HttpsError('failed-precondition', 'E-post er ikke satt opp på serveren.');
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111827">${escapeHtml(text).replace(/\n/g, '<br>')}</div>`;
  const sent = [];
  const failed = [];
  for (let i = 0; i < to.length; i += 4) {
    const batch = to.slice(i, i + 4);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.allSettled(batch.map((address) => sendMail(key, {
      to: address, subject, text, html, fromName, replyTo, attachments,
    })));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') sent.push(batch[index]);
      else failed.push({ to: batch[index], error: friendlyMailError(result.reason) });
    });
  }
  logger.info('Meeting mail', { familyId, meetingId, kind, sent: sent.length, failed: failed.length, files: attachments.length });
  if (!sent.length) throw new HttpsError('internal', failed[0]?.error || 'E-posten ble ikke sendt.');
  return { ok: true, kind, to: sent, failed, refused, files: attachments.map((row) => row.filename) };
});

/** Dagsorden, sammendrag og opprydding av notater med Gemini. */
export const aiMeeting = onCall({ ...CALL, timeoutSeconds: 90, memory: '256MiB' }, async (request) => {
  const uid = requireAuth(request.auth);
  const data = request.data || {};
  const db = getFirestore();
  const familyId = String(data.familyId || '').trim();
  if (familyId && !familyId.includes('/')) await assertFamilyMember(db, familyId, uid);
  await assertRateLimits(db, { key: hashRateKey(['ai-meeting', uid]), hourlyLimit: 60, dailyLimit: 200 });
  try {
    return await handleAiMeeting(data);
  } catch (error) {
    logger.warn('aiMeeting failed', { message: error?.message, action: data?.action });
    return { ok: false, error: friendlyGeminiError(error), engine: 'local' };
  }
});
