import { getStorage } from 'firebase-admin/storage';
import * as logger from 'firebase-functions/logger';

/** Same origins as repo cors.json — applied to the Storage bucket from Admin SDK. */
export const STORAGE_CORS = [
  {
    origin: [
      'https://protop.no',
      'https://www.protop.no',
      'https://protop-c189c.web.app',
      'https://protop-c189c.firebaseapp.com',
      'http://localhost:8081',
      'http://127.0.0.1:8081',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://localhost:19006',
      'http://127.0.0.1:19006',
    ],
    method: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    responseHeader: [
      'Content-Type',
      'Authorization',
      'Content-Length',
      'User-Agent',
      'X-Firebase-AppCheck',
      'X-Firebase-GMPID',
      'X-Client-Version',
      'X-Goog-Content-SHA256',
      'X-Goog-Date',
      'X-Goog-Resumable',
      'X-Goog-Upload-Protocol',
      'X-Goog-Upload-Command',
      'X-Goog-Upload-Header-Content-Length',
      'X-Goog-Upload-Header-Content-Type',
      'X-Goog-Upload-Offset',
      'X-Goog-Upload-Status',
      'X-Goog-Meta-*',
    ],
    maxAgeSeconds: 3600,
  },
];

let applied = false;
let inflight = null;

export async function ensureStorageCors() {
  if (applied) return { ok: true, skipped: true };
  if (inflight) return inflight;
  inflight = (async () => {
    const bucket = getStorage().bucket();
    await bucket.setCorsConfiguration(STORAGE_CORS);
    applied = true;
    logger.info('[storageCors] bucket CORS applied', {
      origins: STORAGE_CORS[0].origin.length,
    });
    return { ok: true };
  })()
    .catch((err) => {
      logger.warn('[storageCors] failed', { message: err?.message });
      return { ok: false, error: err?.message || String(err) };
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
