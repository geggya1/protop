/**
 * Barnetegninger — minner av barnas tegninger med ramme og metadata.
 */
import { Alert, Platform, Linking } from 'react-native';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, getDoc, query,
  orderBy, limit, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { toIsoDate } from './age';
import { uploadImage } from './media';
import { processDrawingImage } from './drawingImageProcess';
import {
  FRAME_SHAPES,
  FRAME_COLORS,
  ROOM_SCENES,
  normalizeFrame,
  normalizePlacement,
  frameColorHex,
  ageAtDate,
  defaultSlotForScene,
  getRoomScene,
  getFrameRect,
  coverImageBox,
  containImageBox,
  drawingThumbUrl,
  drawingViewerUrl,
  formatDrawingDrawnAt,
  formatDrawingUploadedAt,
} from './childDrawingMeta';
import {
  composeDrawingOnWall,
  wallDownloadFilename,
} from './childDrawingCompose';

export {
  FRAME_SHAPES,
  FRAME_COLORS,
  ROOM_SCENES,
  normalizeFrame,
  normalizePlacement,
  frameColorHex,
  ageAtDate,
  defaultSlotForScene,
  getRoomScene,
  getFrameRect,
  coverImageBox,
  containImageBox,
  drawingThumbUrl,
  drawingViewerUrl,
  formatDrawingDrawnAt,
  formatDrawingUploadedAt,
  composeDrawingOnWall,
  wallDownloadFilename,
};

function triggerBlobDownload(blob, name) {
  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 2000);
}

export async function downloadDrawingImage(drawing) {
  const url = drawingViewerUrl(drawing);
  if (!url) {
    Alert.alert('Feil', 'Fant ikke bildefilen.');
    return;
  }
  const safeTitle = String(drawing?.title || 'tegning')
    .replace(/[^\w\-æøåÆØÅ ]+/gi, '')
    .trim()
    .slice(0, 40) || 'tegning';
  const name = `${safeTitle}.jpg`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      triggerBlobDownload(blob, name);
      return;
    } catch {
      // fall through
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }

  Linking.openURL(url).catch(() => Alert.alert('Feil', 'Klarte ikke åpne filen.'));
}

/** Last ned rom-mockup med tegningen lagt inn i rammen. */
export async function downloadDrawingOnWall(drawing, sceneId) {
  if (!drawing) {
    Alert.alert('Feil', 'Ingen tegning valgt.');
    return;
  }
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    Alert.alert('Info', 'Nedlasting med vegg er tilgjengelig i nettleseren.');
    return;
  }
  const roomId = sceneId || drawing?.placement?.scene || 'living';
  try {
    const blob = await composeDrawingOnWall(drawing, roomId);
    triggerBlobDownload(blob, wallDownloadFilename(drawing, roomId));
  } catch (e) {
    Alert.alert('Feil', e?.message || 'Klarte ikke lage veggbildet.');
  }
}

function drawingId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function drawingsCol(familyId) {
  return collection(db, 'families', familyId, 'childDrawings');
}

export function listenChildDrawings(familyId, cb) {
  if (!familyId) return () => {};
  const qy = query(drawingsCol(familyId), orderBy('drawnAt', 'desc'), limit(120));
  return onSnapshot(qy, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

function toDrawnAt(value) {
  if (!value && value !== 0) return Timestamp.now();
  if (value?.toDate) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Timestamp.fromDate(value);
  }
  const iso = toIsoDate(value);
  if (iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Timestamp.fromDate(new Date(y, m - 1, d, 12, 0, 0));
  }
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) return Timestamp.fromDate(d);
  return Timestamp.now();
}

/**
 * Last opp tegning: auto-crop (eller manuell cropRect) + høyoppløst display + thumb.
 * @param {string} familyId
 * @param {{ uri?: string, blob?: Blob }|string} picked
 * @param {{ onProgress?: Function, autoCrop?: boolean, cropRect?: object|null, cropQuad?: object|null }} [opts]
 */
export async function uploadChildDrawingImage(familyId, picked, {
  onProgress,
  autoCrop = true,
  cropRect = null,
  cropQuad = null,
} = {}) {
  if (!familyId) throw new Error('Mangler familie');
  if (!picked) throw new Error('Mangler bilde');

  const report = (n) => onProgress?.(Math.max(0, Math.min(100, Math.round(n))));
  report(5);

  let blob = picked?.blob || null;
  if (!blob) {
    const uri = typeof picked === 'string' ? picked : picked?.uri;
    if (!uri) throw new Error('Mangler fil');
    const res = await fetch(uri);
    if (!res.ok) throw new Error('Kunne ikke lese bildet');
    blob = await res.blob();
  }
  report(15);

  const processed = await processDrawingImage(blob, {
    autoCrop: (cropRect || cropQuad) ? false : autoCrop,
    cropRect,
    cropQuad,
  });
  report(45);

  const id = drawingId();
  const base = `families/${familyId}/childDrawings/${id}`;
  const displayPath = `${base}/display.jpg`;
  const thumbPath = `${base}/thumb.jpg`;

  const displayUrl = await uploadImage(displayPath, {
    blob: processed.displayBlob,
    mimeType: 'image/jpeg',
  });
  report(75);

  const thumbUrl = await uploadImage(thumbPath, {
    blob: processed.thumbBlob,
    mimeType: 'image/jpeg',
  });
  report(100);

  return {
    id,
    displayUrl,
    thumbUrl,
    displayPath,
    thumbPath,
    width: processed.width,
    height: processed.height,
    crop: processed.crop,
    sourceWidth: processed.sourceWidth,
    sourceHeight: processed.sourceHeight,
  };
}

export async function createChildDrawing({
  familyId,
  createdBy,
  createdByName,
  childId,
  childName,
  childBirthday,
  age,
  place,
  drawnAt,
  title,
  note,
  image,
  frame,
  placement,
}) {
  if (!familyId) throw new Error('Mangler familie');
  if (!image?.displayUrl) throw new Error('Mangler bilde');
  const when = toDrawnAt(drawnAt);
  const whenDate = when.toDate ? when.toDate() : new Date();
  const computedAge = age != null && age !== ''
    ? Number(age)
    : ageAtDate(childBirthday, whenDate);

  const ref = await addDoc(drawingsCol(familyId), {
    title: String(title || '').trim() || 'Tegning',
    note: String(note || '').trim(),
    childId: childId || null,
    childName: childName || '',
    age: Number.isFinite(computedAge) ? computedAge : null,
    place: String(place || '').trim(),
    drawnAt: when,
    drawnAtKey: toIsoDate(whenDate),
    imageUrl: image.displayUrl,
    thumbUrl: image.thumbUrl || image.displayUrl,
    width: image.width || 0,
    height: image.height || 0,
    crop: image.crop || null,
    frame: normalizeFrame(frame),
    placement: normalizePlacement(placement),
    createdBy: createdBy || null,
    createdByName: createdByName || '',
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateChildDrawing(familyId, drawingId, patch, {
  editorUid,
  isAdmin = false,
} = {}) {
  if (!familyId || !drawingId) throw new Error('Mangler tegning');
  const ref = doc(db, 'families', familyId, 'childDrawings', drawingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Tegningen finnes ikke.');
  const data = snap.data() || {};
  if (data.deleted === true) throw new Error('Tegningen er slettet.');
  if (!isAdmin && data.createdBy && data.createdBy !== editorUid) {
    throw new Error('Du kan bare redigere egne tegninger.');
  }

  const next = { updatedAt: serverTimestamp() };

  if (patch.title !== undefined) next.title = String(patch.title || '').trim() || 'Tegning';
  if (patch.note !== undefined) next.note = String(patch.note || '').trim();
  if (patch.place !== undefined) next.place = String(patch.place || '').trim();
  if (patch.childId !== undefined) next.childId = patch.childId || null;
  if (patch.childName !== undefined) next.childName = String(patch.childName || '').trim();
  if (patch.age !== undefined) {
    const n = Number(patch.age);
    next.age = Number.isFinite(n) ? n : null;
  }
  if (patch.drawnAt !== undefined) {
    const when = toDrawnAt(patch.drawnAt);
    next.drawnAt = when;
    next.drawnAtKey = toIsoDate(when.toDate ? when.toDate() : new Date());
  }
  if (patch.frame !== undefined) next.frame = normalizeFrame(patch.frame);
  if (patch.placement !== undefined) next.placement = normalizePlacement(patch.placement);
  if (patch.imageUrl !== undefined) next.imageUrl = patch.imageUrl;
  if (patch.thumbUrl !== undefined) next.thumbUrl = patch.thumbUrl;

  await updateDoc(ref, next);
}

export async function softDeleteChildDrawing(familyId, drawingId) {
  if (!familyId || !drawingId) return;
  await updateDoc(doc(db, 'families', familyId, 'childDrawings', drawingId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}
