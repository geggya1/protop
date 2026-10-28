/**
 * Sender indeksbrevet til kunden når noen ber om det.
 * Egen fil slik at avtaletolkningen ikke drar inn e-postnøkkelen.
 *
 * Bare medlemmer av bedriften kan sende, med grense per person og per bedrift,
 * og til få mottakere om gangen. Ellers kunne hvem som helst med konto bruke
 * ProTops avsenderadresse som e-postrelé.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey, isValidEmail, requireAuth } from './security.js';
import { assertCompanyMember, cleanFamilyId } from './companyMember.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { friendlyMailError, normalizePdfAttachment, sendMail } from './mail.js';

if (!getApps().length) initializeApp();

/** Høyst så mange kopimottakere i tillegg til kunden. */
export const INDEKS_MAX_CC = 3;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Mottakerne: kunden og noen få kopier, uten duplikater. */
export function indeksRecipients(toRaw, ccRaw) {
  const to = String(toRaw || '').trim().toLowerCase();
  if (!isValidEmail(to)) throw new HttpsError('invalid-argument', 'E-postadressen er ikke gyldig.');
  const list = (Array.isArray(ccRaw) ? ccRaw : [])
    .map((row) => String(row || '').trim().toLowerCase())
    .filter((row) => isValidEmail(row) && row !== to);
  const cc = [...new Set(list)];
  if (cc.length > INDEKS_MAX_CC) {
    throw new HttpsError('invalid-argument', `Varselet kan ha høyst ${INDEKS_MAX_CC} kopimottakere.`);
  }
  return { to, cc };
}

async function limitSending(db, uid, familyId) {
  try {
    await assertRateLimit(db, { key: hashRateKey(['indeks-letter', uid]), limit: 15, windowMs: HOUR });
    await assertRateLimit(db, { key: hashRateKey(['indeks-letter-company', familyId]), limit: 60, windowMs: DAY });
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    // Uten grense sender vi ikke: dette er et e-postrelé hvis grensen faller bort.
    logger.error('sendIndeksLetter rate limit failed', { message: err?.message });
    throw new HttpsError('unavailable', 'Kunne ikke sende akkurat nå. Prøv igjen om litt.');
  }
}

export const sendIndeksLetter = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    const uid = requireAuth(request.auth);
    const familyId = cleanFamilyId(request.data?.familyId);
    if (!familyId) throw new HttpsError('failed-precondition', 'Last siden på nytt og prøv igjen (bedrift mangler).');
    const db = getFirestore();
    await assertCompanyMember(db, familyId, uid);
    const { to, cc } = indeksRecipients(request.data?.to, request.data?.cc);
    const subject = String(request.data?.subject || 'Varsel om indeksregulering').replace(/[\r\n]+/g, ' ').slice(0, 180);
    const text = String(request.data?.text || '').trim().slice(0, 20000);
    if (text.length < 20) throw new HttpsError('invalid-argument', 'Brevet er for kort til å sendes.');
    const name = String(request.data?.name || '').replace(/[\r\n<>"]+/g, ' ').slice(0, 120);
    const file = normalizePdfAttachment(request.data?.attachment);
    if (!file.ok) throw new HttpsError('invalid-argument', file.error);
    await limitSending(db, uid, familyId);
    const key = await resolveMailApiKey();
    if (!key) throw new HttpsError('failed-precondition', 'E-post er ikke satt opp på serveren.');
    const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
    try {
      const sent = await sendMail(key, {
        to,
        cc,
        name,
        subject,
        text,
        html,
        attachments: file.attachment ? [file.attachment] : [],
      });
      logger.info('Indeksbrev sendt', { familyId, uid, count: 1 + cc.length });
      return { ok: true, providerId: String(sent?.id || sent?.messageId || '') };
    } catch (error) {
      throw new HttpsError('internal', friendlyMailError(error));
    }
  },
);
