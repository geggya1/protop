/**
 * Same-origin anbudsforespørsel-scan. Browseren treffer /api/scan-anbud på protop.no,
 * ikke europe-west1-*.cloudfunctions.net (callable CORS/IAM).
 */
import { onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { touchGeminiEnv } from './geminiEnv.js';
import { applyCors, requireBearerUid } from './httpAuth.js';
import { handleScanAnbud } from './anbud/intakeScan.js';

function statusOf(error) {
  const named = Number(error?.httpErrorCode?.status || 0);
  if (named >= 400 && named < 600) return named;
  const code = String(error?.code || '').replace(/^functions\//, '');
  if (code === 'invalid-argument') return 400;
  if (code === 'unauthenticated') return 401;
  if (code === 'permission-denied') return 403;
  if (code === 'failed-precondition') return 412;
  if (code === 'unavailable') return 503;
  return 500;
}

export const scanAnbudDocumentHttp = onRequest(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 60, memory: '1GiB' },
  async (req, res) => {
    applyCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).end('');
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
      const result = await handleScanAnbud(req.body || {});
      res.json(result);
    } catch (error) {
      if (error instanceof HttpsError) {
        res.status(statusOf(error)).json({ ok: false, error: error.message || 'Kunne ikke lese dokumentet.' });
        return;
      }
      logger.warn('scanAnbudDocumentHttp failed', { message: error?.message });
      res.status(500).json({ ok: false, error: 'Kunne ikke lese dokumentet.' });
    }
  },
);
