/**
 * Generell Storage-opplasting via Admin SDK — omgår Firebase Storage CORS i nettleseren.
 * Bucket-CORS settes ikke her: Admin SDK trenger det ikke, og setCorsConfiguration
 * på opplastingsstien kan henge / feile og blokkere CV-bilder.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';
import { assertFamilyMember } from './security.js';
import { ensureStorageCors } from './storageCors.js';

const MAX_BASE64_BYTES = 15 * 1024 * 1024;
const STORAGE_BUCKET = 'protop-c189c.firebasestorage.app';

export async function assertCanWriteObjectPath(db, uid, objectPath) {
  const path = String(objectPath || '').trim();
  if (!path || path.includes('..') || path.length > 500 || path.startsWith('/')) {
    throw new Error('Ugyldig lagringssti');
  }
  if (path.startsWith(`users/${uid}/`)) return path;
  if (path.startsWith('families/personal/')) return path;
  if (path.startsWith('groups/')) return path;

  const match = path.match(/^families\/([^/]+)\//);
  if (match?.[1] && match[1] !== 'personal') {
    await assertFamilyMember(db, match[1], uid);
    return path;
  }
  throw new Error('Ugyldig lagringssti');
}

export async function handleUploadStorageFile(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const objectPath = await assertCanWriteObjectPath(db, uid, data?.objectPath);
  const contentType = String(data?.contentType || 'application/octet-stream').slice(0, 120);
  // Klienten kan sende data-URL eller ren base64.
  const fileBase64 = String(data?.fileBase64 || '').replace(/^data:[^;]+;base64,/i, '');
  if (!fileBase64) throw new Error('Mangler fil.');

  let buffer;
  try {
    buffer = Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Kunne ikke lese filen.');
  }
  if (!buffer.length) throw new Error('Tom fil.');
  if (buffer.length > MAX_BASE64_BYTES) {
    throw new Error('Filen er for stor for reservedelopplasting (maks 15 MB).');
  }

  const token = randomUUID();
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  const file = bucket.file(objectPath);
  await file.save(buffer, {
    metadata: {
      contentType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encoded = encodeURIComponent(objectPath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
  return { downloadUrl, storagePath: objectPath, size: buffer.length };
}

/** Engangs/periodisk: sett bucket-CORS fra Admin SDK. */
export async function handleApplyStorageCors(_data, auth) {
  if (!auth?.uid) throw new Error('Ikke innlogget');
  const result = await ensureStorageCors({ force: true });
  if (!result?.ok) throw new Error(result?.error || 'Klarte ikke sette Storage CORS.');
  return { ok: true, origins: result.origins || 0 };
}
