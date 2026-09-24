import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { AI_LIMITS, deleteStorageObject } from './aiShared.js';
import { ensureStorageCors } from './storageCors.js';

/** Maks dokumenter/filer per kjøring — holder Cloud Functions innenfor gratis kvote. */
const BATCH_LIMIT = 200;

function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

async function expirePendingDrafts(db) {
  const now = Timestamp.fromDate(new Date());
  const snap = await db.collectionGroup('aiDrafts')
    .where('status', '==', 'pending')
    .where('expiresAt', '<', now)
    .limit(BATCH_LIMIT)
    .get();

  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    await deleteStorageObject(data.storagePath);
    await doc.ref.update({
      status: 'expired',
      expiredAt: FieldValue.serverTimestamp(),
    });
    count += 1;
  }
  return count;
}

async function purgeOldDraftDocs(db) {
  const cutoff = Timestamp.fromDate(daysAgo(AI_LIMITS.draftArchiveDays));
  const snap = await db.collectionGroup('aiDrafts')
    .where('status', 'in', ['approved', 'rejected', 'expired'])
    .where('createdAt', '<', cutoff)
    .limit(BATCH_LIMIT)
    .get();

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  if (snap.size) await batch.commit();
  return snap.size;
}

async function purgeOldAiTempFiles() {
  const bucket = getStorage().bucket();
  const cutoffMs = Date.now() - AI_LIMITS.draftTtlMs;
  let deleted = 0;
  let pageToken;

  do {
    // eslint-disable-next-line no-await-in-loop
    const [files, , resp] = await bucket.getFiles({
      prefix: 'families/',
      autoPaginate: false,
      maxResults: BATCH_LIMIT,
      pageToken,
    });
    pageToken = resp?.nextPageToken;

    for (const file of files) {
      if (!file.name.includes('/ai-temp/')) continue;
      const created = new Date(file.metadata?.timeCreated || 0).getTime();
      if (created && created < cutoffMs) {
        // eslint-disable-next-line no-await-in-loop
        await file.delete({ ignoreNotFound: true }).catch(() => {});
        deleted += 1;
      }
    }
  } while (pageToken && deleted < BATCH_LIMIT);

  return deleted;
}

async function purgeOldUsageDocs(db) {
  const cutoffKey = daysAgo(AI_LIMITS.usageRetentionDays).toISOString().slice(0, 10);
  const snap = await db.collection('aiUsage')
    .where('dateKey', '<', cutoffKey)
    .limit(BATCH_LIMIT)
    .get();

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  if (snap.size) await batch.commit();
  return snap.size;
}

export async function runAiCleanup() {
  const cors = await ensureStorageCors();
  const db = getFirestore();
  const [expiredDrafts, purgedDrafts, tempFiles, usageDocs] = await Promise.all([
    expirePendingDrafts(db),
    purgeOldDraftDocs(db),
    purgeOldAiTempFiles(),
    purgeOldUsageDocs(db),
  ]);

  return {
    expiredDrafts,
    purgedDrafts,
    tempFiles,
    usageDocs,
    storageCors: cors?.ok !== false,
  };
}
