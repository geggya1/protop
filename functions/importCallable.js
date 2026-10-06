/**
 * Bare import-kallet. Holder oppstarten liten, så funksjonen rekker å lytte
 * før helsesjekken gir opp.
 */
import './setRegion.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import './geminiEnv.js';
import { handleInterpretImport } from './importInterpret.js';
import { assertRateLimits, hashRateKey, requireAuth } from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

function rethrowCallable(error, fallback) {
  if (error instanceof HttpsError) throw error;
  const message = String(error?.message || fallback || 'Noe gikk galt.').slice(0, 400);
  const code = error?.code === 'resource-exhausted' ? 'resource-exhausted' : 'failed-precondition';
  throw new HttpsError(code, message);
}

export const interpretImport = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 180,
    memory: '1GiB',
    cors: true,
  },
  async (req) => {
    try {
      const uid = requireAuth(req.auth);
      await assertRateLimits(db, {
        key: hashRateKey(['ai-import', uid]),
        hourlyLimit: 20,
        dailyLimit: 60,
      });
      return await handleInterpretImport(req.data, req.auth);
    } catch (error) {
      logger.warn('interpretImport failed', { message: error?.message });
      rethrowCallable(error, 'Klarte ikke tolke importfilen.');
    }
  },
);
