import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'crypto';

const MAX_BYTES = 15 * 1024 * 1024;

export async function handleUploadDocument(data, auth) {
  const db = getFirestore();
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');

  const familyId = String(data?.familyId || '').trim();
  const folderId = String(data?.folderId || '').trim();
  const fileName = String(data?.fileName || 'dokument').trim().slice(0, 200);
  const mimeType = String(data?.mimeType || 'application/octet-stream').slice(0, 120);
  const fileBase64 = String(data?.fileBase64 || '');

  if (!familyId || !folderId || !fileBase64) {
    throw new Error('Mangler fil eller mappe.');
  }

  const folderSnap = await db.doc(`families/${familyId}/documentFolders/${folderId}`).get();
  if (!folderSnap.exists || folderSnap.data()?.deleted) {
    throw new Error('Mappe finnes ikke.');
  }

  const folder = folderSnap.data() || {};
  const memberIds = Array.isArray(folder.memberIds) ? folder.memberIds : [];
  const isFamilyScope = folder.scope === 'family' || folder.visibility === 'family';
  const isOwner = folder.ownerUid === uid || folder.createdBy === uid;
  if (!memberIds.includes(uid) && !isFamilyScope && !isOwner) {
    // Sjekk også at brukeren er familiemedlem for family-mapper
    throw new Error('Ingen tilgang til denne mappen.');
  }
  if (isFamilyScope && !memberIds.includes(uid) && !isOwner) {
    const fam = await db.doc(`families/${familyId}`).get();
    const famData = fam.exists ? (fam.data() || {}) : {};
    const adminUids = Array.isArray(famData.adminUids) ? famData.adminUids : [];
    const memberList = Array.isArray(famData.memberIds) ? famData.memberIds : [];
    const membersMap = famData.members && typeof famData.members === 'object' ? famData.members : {};
    const isFamMember = famData.ownerUid === uid
      || famData.ownerId === uid
      || adminUids.includes(uid)
      || memberList.includes(uid)
      || Object.prototype.hasOwnProperty.call(membersMap, uid);
    const parent = await db.doc(`families/${familyId}/parents/${uid}`).get();
    const child = await db.doc(`families/${familyId}/children/${uid}`).get();
    if (!isFamMember && !parent.exists && !child.exists) {
      throw new Error('Ingen tilgang til denne mappen.');
    }
  }

  let buffer;
  try {
    buffer = Buffer.from(fileBase64, 'base64');
  } catch {
    throw new Error('Kunne ikke lese filen.');
  }

  if (!buffer.length) throw new Error('Tom fil.');
  if (buffer.length > MAX_BYTES) {
    throw new Error('Filen er for stor (maks 15 MB).');
  }

  const safeName = fileName.replace(/[^\w.\-()+ ]/g, '_').slice(0, 120) || 'dokument';
  const storagePath = `families/${familyId}/documents/${folderId}/${Date.now()}-${safeName}`;
  const token = randomUUID();
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);

  await file.save(buffer, {
    metadata: {
      contentType: mimeType,
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });

  const encoded = encodeURIComponent(storagePath);
  const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;

  return { downloadUrl, storagePath, size: buffer.length };
}
