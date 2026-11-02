/**
 * Callable `customerSurvey`: kobler src/surveys/customerService.js til Firestore, e-post,
 * tilgangsstyring (Kunder) og rate-limit.
 *
 * Kunden svarer uten innlogging (handlingene open og submit), så callable er åpen for alle
 * (open_for i scripts/deploy-slim-functions.sh). Alt annet krever innlogging og tilgang til Kunder:
 * Lese for å se resultater, Begrenset redigering for å lage, sende, purre og avslutte.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createHash, randomBytes } from 'node:crypto';
import { sendMail } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { assertCompanyAccess, assertRateLimit, hashRateKey } from './security.js';
import { clientIpFromHeaders, sanitizeIp } from '../src/employees/usage.js';
import { SurveyError, handleCustomerSurvey } from './customerSurvey.js';

if (!getApps().length) initializeApp();

const PASS_CODES = new Set([
  'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated',
  'failed-precondition', 'already-exists', 'resource-exhausted', 'unavailable',
]);

function clientIp(req) {
  const headers = req?.rawRequest?.headers || {};
  return clientIpFromHeaders(headers) || sanitizeIp(req?.rawRequest?.ip || '');
}

function deps(req) {
  const db = getFirestore();
  return {
    db,
    clientKey: req.auth?.uid || clientIp(req) || 'anon',
    log: (msg, extra) => logger.warn(msg, extra || {}),
    async sendMail(message) {
      const apiKey = await resolveMailApiKey();
      if (!apiKey) throw new Error('E-post er ikke satt opp (MAIL_API_KEY mangler).');
      return sendMail(apiKey, message);
    },
    async rateLimit(key, limit, windowMs) {
      await assertRateLimit(db, { key: hashRateKey(['customer-survey', key]), limit, windowMs });
    },
    async assertAccess(familyId, uid, action) {
      // Tilgangsmatrisen: see = Lese, read = Begrenset redigering (som appen og firestore.rules).
      await assertCompanyAccess(db, familyId, uid, {
        resource: 'customers',
        action: action === 'write' ? 'read' : 'see',
        message: action === 'write'
          ? 'Du har ikke tilgang til å sende kundeundersøkelser.'
          : 'Du har ikke tilgang til kundeundersøkelsene.',
      });
    },
    async companyName(familyId) {
      const snap = await db.doc(`families/${familyId}`).get();
      const data = snap.exists ? snap.data() || {} : {};
      return String(data.name || data.company?.name || data.navn || '').trim();
    },
    async notify(uids, payload) {
      await Promise.all((uids || []).filter(Boolean).map((uid) => db.collection(`users/${uid}/notifications`).add({
        ...payload,
        createdAt: FieldValue.serverTimestamp(),
        seen: false,
      })));
    },
    newToken: () => randomBytes(24).toString('base64url'),
    hashToken: async (token) => createHash('sha256').update(String(token)).digest('hex'),
  };
}

export const customerSurvey = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '512MiB',
    cors: true,
    invoker: 'public',
  },
  async (req) => {
    try {
      return await handleCustomerSurvey(req.data || {}, req.auth || null, deps(req));
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof SurveyError && PASS_CODES.has(error.code)) {
        throw new HttpsError(error.code, error.message);
      }
      logger.error('customerSurvey failed', { action: req.data?.action, message: error?.message, stack: error?.stack });
      throw new HttpsError('internal', 'Noe gikk galt med kundeundersøkelsen. Prøv igjen.');
    }
  },
);
