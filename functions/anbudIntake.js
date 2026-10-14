/**
 * Direkte anbudsforespørsel mellom bedrifter, og AI-OCR av en henvendelse.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { requireAuth } from './security.js';
import { createDirectInquiry } from '../src/anbud/intake.js';
import { handleScanAnbud } from './anbud/intakeScan.js';
import { touchGeminiEnv } from './geminiEnv.js';

if (!getApps().length) initializeApp();

function reject(code, message) {
  throw new HttpsError(code, message);
}

export const sendAnbudRequest = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 20 },
  async (request) => {
    const uid = requireAuth(request.auth);
    const made = createDirectInquiry({
      ...request.data,
      fromCompanyId: request.data?.fromCompanyId,
      fromName: request.data?.fromName,
    });
    if (!made.ok) reject('invalid-argument', made.error);
    const db = getFirestore();
    const found = await db.collection('families').where('orgnr', '==', made.inquiry.toOrgnr).limit(1).get();
    if (found.empty) reject('not-found', 'Fant ingen ProTop-bedrift med det organisasjonsnummeret.');
    const target = found.docs[0];
    if (target.id === request.data?.fromCompanyId) reject('failed-precondition', 'Du kan ikke sende forespørselen til egen bedrift.');
    const row = { ...made.inquiry, fromUid: uid };
    await target.ref.update({ anbudInbox: FieldValue.arrayUnion(row) });
    logger.info('anbud request sent', { from: request.data?.fromCompanyId, to: target.id });
    return { ok: true, inquiry: row, companyName: target.get('name') || target.get('company.navn') || '' };
  },
);

export const scanAnbudDocument = onCall(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 60, memory: '1GiB' },
  async (request) => {
    requireAuth(request.auth);
    touchGeminiEnv();
    return handleScanAnbud(request.data || {});
  },
);
