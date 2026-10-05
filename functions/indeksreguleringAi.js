/**
 * Leser alle avtaledokumentene for indeksregulering, og sjekker SSB én gang i døgnet.
 * Lokal tolkning kjører alltid. Gemini fyller ut når nøkkelen er satt.
 */
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireAuth } from './security.js';
import { touchGeminiEnv } from './geminiEnv.js';
import { handleInterpretIndeks } from './interpretAvtaleCore.js';
import { fetchAllIndices } from '../src/indeksregulering/ssb.js';
import { indexNews, latestMap } from '../src/indeksregulering/watch.js';

export { handleInterpretIndeks } from './interpretAvtaleCore.js';

export async function recordSsbCheck(fetchImpl = fetch) {
  if (!getApps().length) initializeApp();
  const bundle = await fetchAllIndices({ fetchImpl });
  const db = getFirestore();
  const ref = db.doc('system/indeksSsb');
  const prev = await ref.get();
  const next = latestMap(bundle.series);
  const news = indexNews(prev.data()?.series, next);
  const row = {
    checkedAt: new Date().toISOString(),
    errors: bundle.errors || [],
    series: next,
    news,
  };
  await ref.set(row);
  logger.info('SSB-indeks sjekket', { series: Object.keys(next).length, news: news.length });
  return row;
}

export const indeksSsbDaily = onSchedule(
  {
    schedule: 'every day 07:00',
    timeZone: 'Europe/Oslo',
    region: 'europe-west1',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    try {
      await recordSsbCheck();
    } catch (error) {
      logger.error('SSB-sjekken feilet', { message: error?.message });
    }
  },
);

export const interpretIndeksAvtale = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 90,
    memory: '1GiB',
  },
  async (request) => {
    requireAuth(request.auth);
    touchGeminiEnv();
    return handleInterpretIndeks(request.data || {});
  },
);
