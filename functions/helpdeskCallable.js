/**
 * Callable `helpdesk`: kobler functions/helpdesk.js til Firestore, e-post,
 * Gemini og rate-limit. All logikk ligger i helpdesk.js (testes uten Firebase).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendMail } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { callGeminiJson, getGeminiKey } from './aiShared.js';
import { assertFamilyMember, assertRateLimit, hashRateKey } from './security.js';
import { HelpdeskError, handleHelpdesk } from './helpdesk.js';

if (!getApps().length) initializeApp();

const PASS_CODES = new Set([
  'invalid-argument', 'not-found', 'permission-denied', 'unauthenticated',
  'failed-precondition', 'already-exists', 'resource-exhausted', 'unavailable',
]);

function deps() {
  const db = getFirestore();
  return {
    db,
    log: (msg, extra) => logger.warn(msg, extra || {}),
    async sendMail(message) {
      const apiKey = await resolveMailApiKey();
      if (!apiKey) throw new Error('E-post er ikke satt opp (MAIL_API_KEY mangler).');
      return sendMail(apiKey, message);
    },
    async ai(system, parts) {
      const key = getGeminiKey();
      if (!key) return null;
      return callGeminiJson(key, system, parts, {
        maxOutputTokens: 2400,
        perModelTimeoutMs: 25000,
        maxModels: 2,
      });
    },
    async rateLimit(key, limit, windowMs) {
      await assertRateLimit(db, { key: hashRateKey(['helpdesk', key]), limit, windowMs });
    },
    async companyContext(companyId, uid) {
      const id = String(companyId || '').trim();
      if (!id || !/^[A-Za-z0-9_-]{4,80}$/.test(id)) return null;
      try {
        await assertFamilyMember(db, id, uid);
        const snap = await db.collection('families').doc(id).get();
        if (!snap.exists) return null;
        const data = snap.data() || {};
        return { id, name: String(data.name || data.navn || data.companyName || '').slice(0, 120) };
      } catch {
        return null;
      }
    },
  };
}

export const helpdesk = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 120,
    memory: '512MiB',
    cors: true,
  },
  async (req) => {
    try {
      return await handleHelpdesk(req.data, req.auth, deps());
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error instanceof HelpdeskError && PASS_CODES.has(error.code)) {
        throw new HttpsError(error.code, error.message);
      }
      logger.error('helpdesk failed', { action: req.data?.action, message: error?.message, stack: error?.stack });
      const message = String(error?.message || 'Noe gikk galt i helpdesken.').slice(0, 300);
      throw new HttpsError('failed-precondition', message);
    }
  },
);
