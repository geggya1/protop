/**
 * Direkte anbudsforespørsel mellom bedrifter, og AI-OCR av en henvendelse.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { requireAuth } from './security.js';
import { createDirectInquiry, tenderFromScan } from '../src/anbud/intake.js';
import {
  callGeminiJson,
  friendlyGeminiError,
  getGeminiKey,
} from './aiShared.js';

if (!getApps().length) initializeApp();

const PROMPT = `Du leser en anbudsforespørsel, et brev, en e-post eller et notat (OCR).
Returner KUN gyldig JSON:
{
  "title": "kort navn på forespørselen",
  "buyer": "avsender / oppdragsgiver",
  "contactName": "kontaktperson",
  "email": "e-post eller tom streng",
  "phone": "telefon eller tom streng",
  "deadline": "YYYY-MM-DD eller tom streng",
  "description": "kort sammendrag av hva som etterspørres",
  "reference": "referanse eller tom streng",
  "amount": null
}
Ikke finn opp beløp, dato eller kontakt. Tom streng eller null når feltet ikke står i dokumentet.`;

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
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 60, memory: '512MiB' },
  async (request) => {
    requireAuth(request.auth);
    const imageBase64 = String(request.data?.imageBase64 || '');
    if (imageBase64.length < 80) reject('invalid-argument', 'Last opp et bilde eller et skannet dokument.');
    const apiKey = getGeminiKey();
    if (!apiKey) reject('failed-precondition', 'AI er ikke tilgjengelig akkurat nå.');
    const cleaned = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/i);
    try {
      const parsed = await callGeminiJson(apiKey, PROMPT, [
        { text: 'Les denne anbudsforespørselen og trekk ut feltene.' },
        { inline_data: { mime_type: mimeMatch?.[1] || 'image/jpeg', data: cleaned } },
      ], { maxOutputTokens: 2048, perModelTimeoutMs: 40000 });
      return { ok: true, extracted: tenderFromScan(parsed), engine: 'gemini' };
    } catch (err) {
      reject('unavailable', friendlyGeminiError(err));
    }
    return { ok: false };
  },
);
