/**
 * Familiealbum — signert opplasting + base64-fallback (omgår Storage client CORS/App Check).
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';
import { assertFamilyMember } from './security.js';
import { ensureStorageCors } from './storageCors.js';

const MAX_SIGNED_BYTES = 50 * 1024 * 1024;
const MAX_BASE64_BYTES = 15 * 1024 * 1024;

async function assertAlbumAccess(db, familyId, albumId, uid) {
  await assertFamilyMember(db, familyId, uid);
  const albumSnap = await db.doc(`families/${familyId}/albums/${albumId}`).get();
  if (!albumSnap.exists || albumSnap.data()?.deleted) {
    throw new Error('Album finnes ikke.');
  }
}

export async function handleCreateAlbumUploadUrl(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const familyId = String(data?.familyId || '').trim();
  const albumId = String(data?.albumId || '').trim();
  const objectPath = String(data?.objectPath || '').trim();
  const contentType = String(data?.contentType || 'application/octet-stream').slice(0, 120);
  const sizeBytes = Number(data?.sizeBytes) || 0;

  if (!familyId || !albumId) throw new Error('Mangler album');
  if (!objectPath.startsWith(`families/${familyId}/albums/${albumId}/`)) {
    throw new Error('Ugyldig lagringssti');
  }
  if (objectPath.includes('..') || objectPath.length > 500) {
    throw new Error('Ugyldig lagringssti');
  }
  if (sizeBytes > MAX_SIGNED_BYTES) {
    throw new Error('Filen er for stor (maks 50 MB).');
  }

  await assertAlbumAccess(db, familyId, albumId, uid);
  await ensureStorageCors();

  const token = randomUUID();
  const bucket = getStorage().bucket();
  const file = bucket.file(objectPath);
  const metaHeader = 'x-goog-meta-firebasestoragedownloadtokens';

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 20 * 60 * 1000,
    contentType,
    extensionHeaders: {
      [metaHeader]: token,
    },
  });

  const encoded = encodeURIComponent(objectPath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;

  return {
    uploadUrl,
    downloadUrl,
    storagePath: objectPath,
    downloadToken: token,
    metaHeader,
    metaValue: token,
  };
}

/** Base64-opplasting for bilder/varianter ≤ 15 MB (samme mønster som dokumenter). */
export async function handleUploadAlbumFile(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const familyId = String(data?.familyId || '').trim();
  const albumId = String(data?.albumId || '').trim();
  const objectPath = String(data?.objectPath || '').trim();
  const contentType = String(data?.contentType || 'application/octet-stream').slice(0, 120);
  const fileBase64 = String(data?.fileBase64 || '');

  if (!familyId || !albumId || !objectPath || !fileBase64) {
    throw new Error('Mangler fil eller album.');
  }
  if (!objectPath.startsWith(`families/${familyId}/albums/${albumId}/`)) {
    throw new Error('Ugyldig lagringssti');
  }
  if (objectPath.includes('..') || objectPath.length > 500) {
    throw new Error('Ugyldig lagringssti');
  }

  await assertAlbumAccess(db, familyId, albumId, uid);

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

  await ensureStorageCors();

  const token = randomUUID();
  const bucket = getStorage().bucket();
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
