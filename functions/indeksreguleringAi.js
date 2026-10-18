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
import { seriesById } from './indeksregulering/catalog.js';
import { fetchAllIndices } from './indeksregulering/ssb.js';
import { indexIdsInDocument, nextSsbRecord } from './indeksregulering/ledger.js';

export { handleInterpretIndeks } from './interpretAvtaleCore.js';

export async function collectUsedIndexIds(db) {
  const ids = new Set();
  const snap = await db.collectionGroup('anbud').limit(300).get();
  snap.forEach((doc) => {
    indexIdsInDocument(doc.data()).forEach((id) => {
      if (seriesById(id)) ids.add(id);
    });
  });
  return [...ids];
}

export async function recordSsbCheck(fetchImpl = fetch, dbImpl = null) {
  if (!getApps().length) initializeApp();
  const db = dbImpl || getFirestore();
  const ref = db.doc('system/indeksSsb');
  const prev = await ref.get();
  let ids = [];
  try {
    ids = await collectUsedIndexIds(db);
  } catch (error) {
    logger.error('Kunne ikke lese benyttede indekser', { message: error?.message });
    return prev.data() || null;
  }
  if (!ids.length) {
    const kept = prev.data() || {};
    const row = {
      checkedAt: new Date().toISOString(),
      errors: ['Ingen benyttede indekser i inngåtte avtaler.'],
      series: kept.series || {},
      news: [],
      history: kept.history || [],
    };
    await ref.set(row);
    logger.info('SSB-sjekk uten benyttede indekser');
    return row;
  }
  const bundle = await fetchAllIndices({ fetchImpl, ids });
  const row = nextSsbRecord(prev.data(), bundle, new Date().toISOString());
  await ref.set(row);
  logger.info('SSB-indeks sjekket', { series: Object.keys(row.series).length, news: row.news.length, ids: ids.length });
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
