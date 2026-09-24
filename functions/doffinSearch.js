/**
 * Søker aktive konkurranser på Doffin via samme webklient-API som doffin.no.
 * Ingen abonnementsnøkkel. Nettleseren kan ikke kalle API-et direkte (CORS),
 * derfor går kallet via denne funksjonen.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';
import { searchDoffinNotices as searchPublished } from './doffinQuery.js';
import { lookupCompanyCpv } from '../src/anbud/companyLookup.js';

if (!getApps().length) initializeApp();

function reject(code, message) {
  throw new HttpsError(code, message);
}

export async function searchDoffinNotices(input) {
  const codes = input?.cpvCodes || [];
  if (codes.length > 20) reject('invalid-argument', 'Maks 20 CPV-koder.');
  try {
    return await searchPublished(input);
  } catch (err) {
    if (err?.code === 'invalid-argument') reject('invalid-argument', err.message);
    throw err;
  }
}

export const searchDoffin = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 20,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const uid = requireAuth(request.auth);
      await assertRateLimit(getFirestore(), {
        key: hashRateKey(['doffin', uid]),
        limit: 60,
        windowMs: 60 * 60 * 1000,
      });
      return await searchDoffinNotices(request.data || {});
    } catch (err) {
      if (err instanceof HttpsError || err?.httpErrorCode) throw err;
      logger.warn('searchDoffin failed', { message: err?.message });
      reject('unavailable', 'Kunne ikke hente kunngjøringer fra Doffin.');
    }
  },
);

export const lookupCompany = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    try {
      const uid = requireAuth(request.auth);
      await assertRateLimit(getFirestore(), {
        key: hashRateKey(['doffin-company', uid]),
        limit: 30,
        windowMs: 60 * 60 * 1000,
      });
      return await lookupCompanyCpv(request.data?.orgnr);
    } catch (err) {
      if (err instanceof HttpsError || err?.httpErrorCode) throw err;
      if (err?.code === 'invalid-argument' || err?.code === 'not-found') reject(err.code, err.message);
      logger.warn('lookupCompany failed', { message: err?.message });
      reject('unavailable', 'Kunne ikke hente bedriftens CPV-koder.');
    }
  },
);
