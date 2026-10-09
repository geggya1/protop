/**
 * Generell Storage-opplasting via Admin SDK — omgår Firebase Storage CORS i nettleseren.
 * Bucket-CORS settes ikke her: Admin SDK trenger det ikke, og setCorsConfiguration
 * på opplastingsstien kan henge / feile og blokkere CV-bilder.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { assertFamilyMember } from './security.js';
import { ensureStorageCors } from './storageCors.js';
import { mediaBucket } from './storageBucket.js';

const MAX_BASE64_BYTES = 15 * 1024 * 1024;

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

/** Samme ACL som skriv — lesing av egne familie-/brukerbilder. */
export const assertCanReadObjectPath = assertCanWriteObjectPath;

function objectPathFromUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^gs:\/\//i.test(value)) return value.replace(/^gs:\/\/[^/]+\//i, '');
  if (/firebasestorage\.googleapis\.com\/v0\/b\//i.test(value)) {
    try {
      const after = value.split('/o/')[1] || '';
      return decodeURIComponent((after.split('?')[0] || ''));
    } catch {
      return '';
    }
  }
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\//, '');
  return '';
}

/**
 * Last ned bilde via Admin SDK — omgår Firebase Storage CORS i nettleseren
 * (samme årsak som uploadStorageFile finnes).
 */
export async function handleDownloadStorageFile(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const fromUrl = objectPathFromUrl(data?.url);
  const objectPath = await assertCanReadObjectPath(db, uid, data?.objectPath || fromUrl);
  const bucket = await mediaBucket();
  const file = bucket.file(objectPath);
  const [exists] = await file.exists();
  if (!exists) throw new Error('Filen finnes ikke.');

  const [metadata] = await file.getMetadata();
  const size = Number(metadata?.size || 0);
  if (size > MAX_BASE64_BYTES) {
    throw new Error('Filen er for stor til PDF-eksport (maks 15 MB).');
  }

  const [buffer] = await file.download();
  if (!buffer?.length) throw new Error('Tom fil.');
  if (buffer.length > MAX_BASE64_BYTES) {
    throw new Error('Filen er for stor til PDF-eksport (maks 15 MB).');
  }

  return {
    storagePath: objectPath,
    contentType: String(metadata?.contentType || 'application/octet-stream').slice(0, 120),
    fileBase64: buffer.toString('base64'),
    size: buffer.length,
    bucket: bucket.name,
  };
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
  const bucket = await mediaBucket();
  const file = bucket.file(objectPath);
  try {
    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (/bucket does not exist|No such object|Not Found/i.test(msg)) {
      throw new Error(`Lagringsbucket mangler (${bucket.name}).`);
    }
    throw err;
  }

  const encoded = encodeURIComponent(objectPath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
  return { downloadUrl, storagePath: objectPath, size: buffer.length, bucket: bucket.name };
}

/** Engangs/periodisk: sett bucket-CORS fra Admin SDK. */
export async function handleApplyStorageCors(_data, auth) {
  if (!auth?.uid) throw new Error('Ikke innlogget');
  const result = await ensureStorageCors({ force: true });
  if (!result?.ok) throw new Error(result?.error || 'Klarte ikke sette Storage CORS.');
  return { ok: true, origins: result.origins || 0 };
}
