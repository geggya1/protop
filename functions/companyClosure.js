/**
 * Callables for avslutning og sletting av en bedrift (GRUNN-03). Logikken ligger i
 * companyClosureStore.js og src/privacy/companyClosure.js.
 *
 *   closeCompany          eier/admin: avslutter, sletting etter 90 dager
 *   reopenCompany         eier/admin: angrer før fristen
 *   exportCompanyData     eier/admin: alle bedriftens data (gzip-JSON) og listen over filer
 *   purgeClosedCompanies  driften (custom claim admin): sletter bedrifter der fristen er ute.
 *                         Tørrkjøring uten { confirm: true }. Samme som
 *                         scripts/purge-closed-companies.mjs (se docs/drift/sletting-av-bedrift.md).
 *
 * Ingen hemmeligheter: trygg for membershipIndex.js og slim-deployen.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import * as logger from 'firebase-functions/logger';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';
import { STORAGE_BUCKET_CANDIDATES, mediaBucket } from './storageBucket.js';
import {
  closeCompanyFor, exportCompanyDataFor, reopenCompanyFor, runCompanyPurge,
} from './companyClosureStore.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

const KNOWN_CODES = new Set(['invalid-argument', 'not-found', 'permission-denied', 'failed-precondition', 'resource-exhausted']);

/** Feil fra logikken med kjent kode går til appen med teksten; resten logges. */
function rethrow(label, error) {
  if (error instanceof HttpsError) throw error;
  if (KNOWN_CODES.has(error?.code)) throw new HttpsError(error.code, error.message);
  logger.error(label, error?.message || error);
  throw new HttpsError('internal', 'Noe gikk galt. Prøv igjen, eller kontakt support@protop.no.');
}

function actorName(auth) {
  return String(auth?.token?.name || auth?.token?.email || '').trim().slice(0, 120);
}

/** Alle bucketene bedriftens filer kan ligge i (begge kandidatene som finnes). */
async function existingBuckets() {
  const out = [];
  for (const name of STORAGE_BUCKET_CANDIDATES) {
    const bucket = getStorage().bucket(name);
    try {
      const [exists] = await bucket.exists();
      if (exists) out.push(bucket);
    } catch {
      // neste kandidat
    }
  }
  return out;
}

export const closeCompany = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  await assertRateLimit(db, { key: hashRateKey(['company-close', uid]), limit: 10, windowMs: 24 * 60 * 60 * 1000 });
  try {
    const res = await closeCompanyFor(db, {
      familyId: req.data?.familyId,
      uid,
      actorName: actorName(req.auth),
      data: {
        confirm: req.data?.confirm,
        accountingConfirmed: req.data?.accountingConfirmed === true,
        reason: req.data?.reason,
      },
    });
    logger.info('closeCompany', { familyId: req.data?.familyId, uid, deleteAfter: res.closure.deleteAfter });
    return res;
  } catch (error) {
    return rethrow('closeCompany', error);
  }
});

export const reopenCompany = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  try {
    const res = await reopenCompanyFor(db, { familyId: req.data?.familyId, uid, actorName: actorName(req.auth) });
    logger.info('reopenCompany', { familyId: req.data?.familyId, uid });
    return res;
  } catch (error) {
    return rethrow('reopenCompany', error);
  }
});

export const exportCompanyData = onCall({ ...CALL, timeoutSeconds: 540, memory: '1GiB' }, async (req) => {
  const uid = requireAuth(req.auth);
  await assertRateLimit(db, { key: hashRateKey(['company-export', uid]), limit: 20, windowMs: 24 * 60 * 60 * 1000 });
  try {
    const bucket = await mediaBucket().catch(() => null);
    const res = await exportCompanyDataFor(db, bucket, { familyId: req.data?.familyId, uid });
    logger.info('exportCompanyData', {
      familyId: req.data?.familyId, uid, documents: res.documents, files: res.files.length,
    });
    return res;
  } catch (error) {
    return rethrow('exportCompanyData', error);
  }
});

/** Bare driften: en konto med custom claim admin (settes bare med Admin SDK), som applyStorageCors. */
export const purgeClosedCompanies = onCall({ ...CALL, timeoutSeconds: 540, memory: '512MiB' }, async (req) => {
  const uid = requireAuth(req.auth);
  if (req.auth?.token?.admin !== true) {
    throw new HttpsError('permission-denied', 'Bare driften kan slette bedrifter.');
  }
  try {
    const res = await runCompanyPurge(db, await existingBuckets(), {
      companyId: req.data?.companyId,
      dryRun: req.data?.confirm !== true,
      actorUid: uid,
    });
    logger.info('purgeClosedCompanies', {
      uid, dryRun: res.dryRun, results: res.results.map((row) => ({ id: row.companyId, purge: row.purge, deleted: row.deleted })),
    });
    return res;
  } catch (error) {
    return rethrow('purgeClosedCompanies', error);
  }
});
