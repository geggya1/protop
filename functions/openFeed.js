/**
 * Proxy for åpne feeds uten CORS (VG, DN, E24, Yahoo Finance).
 * Kun innloggede brukere, stram allowlist, rate limit.
 */
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';
import { validateOpenFeedUrl } from './openFeedAllow.js';
import { applyCors, requireBearerUid } from './httpAuth.js';

if (!getApps().length) initializeApp();

const MAX_BYTES = 350000;
const USER_AGENT = 'Mozilla/5.0 (compatible; Weekplan/2.0; +https://protop.no) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function reject(code, message) {
  throw new HttpsError(code, message);
}

function isHttpsError(err) {
  return err instanceof HttpsError || err?.httpErrorCode || err?.code === 'unavailable';
}

async function fetchFeed(target) {
  const res = await fetch(target, {
    redirect: 'manual',
    signal: AbortSignal.timeout(12000),
    headers: {
      Accept: 'application/json, application/rss+xml, application/xml, text/xml, */*',
      'User-Agent': USER_AGENT,
    },
  });
  if (res.status >= 300 && res.status < 400) {
    reject('unavailable', 'Kilden videresendte forespørselen');
  }
  if (!res.ok) {
    reject('unavailable', `Kilden svarte ${res.status}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) {
    reject('resource-exhausted', 'Svaret var for stort');
  }
  return {
    ok: true,
    contentType: res.headers.get('content-type') || '',
    body: new TextDecoder('utf-8').decode(buf),
  };
}

export const fetchOpenFeed = onCall(
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
      let target;
      try {
        target = validateOpenFeedUrl(request.data?.url);
      } catch (err) {
        reject(err.code === 'permission-denied' ? 'permission-denied' : 'invalid-argument', err.message);
      }

      await assertRateLimit(getFirestore(), {
        key: hashRateKey(['openfeed', uid]),
        limit: 80,
        windowMs: 60 * 60 * 1000,
      });

      try {
        return await fetchFeed(target);
      } catch (err) {
        if (isHttpsError(err)) throw err;
        logger.warn('fetchOpenFeed network', { message: err?.message });
        reject('unavailable', 'Kunne ikke nå kilden');
      }
    } catch (err) {
      if (isHttpsError(err)) throw err;
      logger.warn('fetchOpenFeed failed', { message: err?.message });
      reject('unavailable', 'Kunne ikke hente kilden');
    }
  },
);

export const fetchOpenFeedHttp = onRequest(
  { region: 'europe-west1', cors: true, invoker: 'public', timeoutSeconds: 20, memory: '256MiB' },
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
      let target;
      try {
        target = validateOpenFeedUrl(req.body?.url);
      } catch (err) {
        const status = err?.code === 'permission-denied' ? 403 : 400;
        res.status(status).json({ ok: false, error: err.message || 'Ugyldig adresse.' });
        return;
      }
      await assertRateLimit(getFirestore(), {
        key: hashRateKey(['openfeed', uid]),
        limit: 80,
        windowMs: 60 * 60 * 1000,
      });
      const data = await fetchFeed(target);
      res.json(data);
    } catch (err) {
      if (err instanceof HttpsError) {
        const status = err.code === 'unauthenticated' ? 401 : err.code === 'permission-denied' ? 403 : 502;
        res.status(status).json({ ok: false, error: err.message || 'Kunne ikke hente kilden.' });
        return;
      }
      logger.warn('fetchOpenFeedHttp failed', { message: err?.message });
      res.status(502).json({ ok: false, error: 'Kunne ikke hente kilden.' });
    }
  },
);
