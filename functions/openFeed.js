/**
 * Proxy for åpne feeds uten CORS (VG, DN, E24, Yahoo Finance).
 * Kun innloggede brukere, stram allowlist, rate limit.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';
import { validateOpenFeedUrl } from './openFeedAllow.js';

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
