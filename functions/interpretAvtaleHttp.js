/**
 * Same-origin avtale-KI. Browseren treffer /api/interpret-avtale på protop.no,
 * ikke europe-west1-*.cloudfunctions.net (callable CORS/IAM).
 */
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { touchGeminiEnv } from './geminiEnv.js';
import { applyCors, requireBearerUid } from './httpAuth.js';
import { handleInterpretIndeks } from './interpretAvtaleCore.js';

function statusOf(error) {
  const named = Number(error?.httpErrorCode?.status || 0);
  if (named >= 400 && named < 600) return named;
  const code = String(error?.code || '').replace(/^functions\//, '');
  if (code === 'invalid-argument') return 400;
  if (code === 'unauthenticated') return 401;
  if (code === 'permission-denied') return 403;
  return 500;
}

export const interpretAvtaleHttp = onRequest(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 120, memory: '2GiB' },
  async (req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Bruk POST.' });
      return;
    }
    const uid = await requireBearerUid(req, res);
    if (!uid) return;
    try {
      touchGeminiEnv();
      const result = await handleInterpretIndeks(req.body || {});
      res.json(result);
    } catch (error) {
      if (error instanceof HttpsError) {
        res.status(statusOf(error)).json({ ok: false, error: error.message || 'Kunne ikke lese avtalen.' });
        return;
      }
      logger.warn('interpretAvtaleHttp failed', { message: error?.message });
      res.status(500).json({ ok: false, error: 'Kunne ikke lese avtalen.' });
    }
  },
);
