/**
 * Privat familiealbum (bilder/video utenfor chat).
 */
import {
  collection, doc, onSnapshot, addDoc, updateDoc, serverTimestamp, increment,
  getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { albumThumbUrl } from './albumMedia';

export function albumsCol(familyId) {
  return collection(db, 'families', familyId, 'albums');
}

export function albumDoc(familyId, albumId) {
  return doc(db, 'families', familyId, 'albums', albumId);
}

export function photosCol(familyId, albumId) {
  return collection(db, 'families', familyId, 'albums', albumId, 'photos');
}

export function photoDoc(familyId, albumId, photoId) {
  return doc(db, 'families', familyId, 'albums', albumId, 'photos', photoId);
}

export function listenAlbums(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(albumsCol(familyId), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => a.deleted !== true)
      .sort((a, b) => String(b.updatedAt?.toMillis?.() || 0) - String(a.updatedAt?.toMillis?.() || 0));
    cb(list);
  }, () => cb([]));
}

export function listenAlbumPhotos(familyId, albumId, cb) {
  if (!familyId || !albumId) return () => {};
  return onSnapshot(photosCol(familyId, albumId), (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.deleted !== true)
      .sort((a, b) => {
        const am = a.createdAt?.toMillis?.() || 0;
        const bm = b.createdAt?.toMillis?.() || 0;
        return bm - am;
      });
    cb(list);
  }, () => cb([]));
}

export async function createAlbum(familyId, {
  title,
  createdBy,
  creatorName,
  visibility = 'family',
  viewerUids = null,
}) {
  const owners = [...new Set([createdBy].filter(Boolean))];
  const viewers = Array.isArray(viewerUids)
    ? [...new Set([...viewerUids, ...owners].filter(Boolean))]
    : owners;
  const ref = await addDoc(albumsCol(familyId), {
    title: String(title || '').trim() || 'Album',
    coverUrl: null,
    photoCount: 0,
    createdBy: createdBy || null,
    createdByName: creatorName || '',
    visibility: visibility === 'private' || visibility === 'shared' ? visibility : 'family',
    viewerUids: viewers,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** Oppdater hvem som ser albumet (synlighet + viewerUids). */
export async function updateAlbumShare(familyId, albumId, { visibility, viewerUids }) {
  if (!familyId || !albumId) return;
  const patch = { updatedAt: serverTimestamp() };
  if (visibility === 'private' || visibility === 'shared' || visibility === 'family') {
    patch.visibility = visibility;
  }
  if (Array.isArray(viewerUids)) {
    patch.viewerUids = [...new Set(viewerUids.filter(Boolean))];
  }
  await updateDoc(albumDoc(familyId, albumId), patch);
}

export async function addAlbumPhoto(familyId, albumId, payload = {}) {
  const {
    downloadUrl,
    originalUrl,
    displayUrl,
    thumbUrl,
    storagePath,
    originalPath,
    displayPath,
    thumbPath,
    caption = '',
    createdBy,
    creatorName,
    mediaType = 'image',
    mimeType = null,
    fileName = null,
    sizeBytes = null,
    width = null,
    height = null,
    durationMs = null,
    takenAt = null,
    latitude = null,
    longitude = null,
  } = payload;

  const original = originalUrl || downloadUrl;
  if (!familyId || !albumId || !original) throw new Error('Mangler bilde');

  const thumb = thumbUrl || displayUrl || original;
  await addDoc(photosCol(familyId, albumId), {
    downloadUrl: original,
    originalUrl: original,
    displayUrl: displayUrl || original,
    thumbUrl: thumb,
    storagePath: storagePath || originalPath || null,
    originalPath: originalPath || storagePath || null,
    displayPath: displayPath || null,
    thumbPath: thumbPath || null,
    mediaType: mediaType === 'video' ? 'video' : 'image',
    mimeType: mimeType || null,
    fileName: fileName || null,
    sizeBytes: sizeBytes == null ? null : Number(sizeBytes) || 0,
    width: width == null ? null : Number(width) || null,
    height: height == null ? null : Number(height) || null,
    durationMs: durationMs == null ? null : Number(durationMs) || null,
    takenAt: takenAt || null,
    latitude: latitude == null ? null : Number(latitude),
    longitude: longitude == null ? null : Number(longitude),
    caption: String(caption || '').trim(),
    createdBy: createdBy || null,
    createdByName: creatorName || '',
    deleted: false,
    createdAt: serverTimestamp(),
  });
  await updateDoc(albumDoc(familyId, albumId), {
    coverUrl: thumb,
    photoCount: increment(1),
    updatedAt: serverTimestamp(),
  });
}

async function refreshAlbumCover(familyId, albumId) {
  try {
    const snap = await getDocs(photosCol(familyId, albumId));
    const live = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((p) => p.deleted !== true)
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
    await updateDoc(albumDoc(familyId, albumId), {
      coverUrl: live ? albumThumbUrl(live) : null,
      updatedAt: serverTimestamp(),
    });
  } catch {
    await updateDoc(albumDoc(familyId, albumId), {
      updatedAt: serverTimestamp(),
    });
  }
}

export async function softDeleteAlbum(familyId, albumId) {
  if (!familyId || !albumId) return;
  await updateDoc(albumDoc(familyId, albumId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function softDeletePhoto(familyId, albumId, photoId) {
  if (!familyId || !albumId || !photoId) return;
  await updateDoc(photoDoc(familyId, albumId, photoId), {
    deleted: true,
  });
  try {
    await updateDoc(albumDoc(familyId, albumId), {
      photoCount: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // ignore count drift
  }
  await refreshAlbumCover(familyId, albumId);
}

export async function softDeletePhotos(familyId, albumId, photoIds = []) {
  const ids = [...new Set((photoIds || []).filter(Boolean))];
  for (const id of ids) {
    // Sequential to keep cover/count updates predictable.
    // eslint-disable-next-line no-await-in-loop
    await softDeletePhoto(familyId, albumId, id);
  }
}
