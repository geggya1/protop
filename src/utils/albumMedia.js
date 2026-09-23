/**
 * Familiealbum — bilde-/videovariants, metadata og nedlasting.
 */
import { Platform, Linking, Alert } from 'react-native';
import {
  MAX_ALBUM_MEDIA_BYTES,
  uploadAlbumObjectWithProgress,
} from './media';

export const ALBUM_THUMB_EDGE = 360;
export const ALBUM_DISPLAY_EDGE = 1600;

function isVideoMime(mime, name = '') {
  const m = String(mime || '').toLowerCase();
  const n = String(name || '').toLowerCase();
  return m.startsWith('video/')
    || /\.(mp4|m4v|mov|webm|avi|mkv|mpeg|mpg)$/i.test(n);
}

function extForMime(mime, isVideo) {
  const m = String(mime || '').toLowerCase();
  if (isVideo) {
    if (m.includes('webm')) return 'webm';
    if (m.includes('quicktime') || m.includes('mov')) return 'mov';
    return 'mp4';
  }
  if (m.includes('png')) return 'png';
  if (m.includes('webp')) return 'webp';
  if (m.includes('gif')) return 'gif';
  return 'jpg';
}

async function readBlob(picked) {
  if (picked?.blob) return picked.blob;
  if (typeof Blob !== 'undefined' && picked instanceof Blob) return picked;
  const uri = typeof picked === 'string' ? picked : picked?.uri;
  if (!uri) throw new Error('Mangler fil');
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Kunne ikke lese filen');
  return res.blob();
}

function canvasToJpegBlob(canvas, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (canvas.toBlob) {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Kunne ikke lage bilde'))),
        'image/jpeg',
        quality,
      );
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      fetch(dataUrl).then((r) => r.blob()).then(resolve).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function resizeImageBlob(blob, maxEdge, quality = 0.82) {
  if (typeof document === 'undefined') {
    return { blob, width: 0, height: 0 };
  }
  let bitmap;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(blob);
    }
  } catch {
    bitmap = null;
  }

  const draw = (srcW, srcH, drawFn) => {
    const scale = Math.min(1, maxEdge / Math.max(srcW, srcH, 1));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    drawFn(canvas.getContext('2d'), width, height);
    return { canvas, width, height };
  };

  if (bitmap) {
    const { canvas, width, height } = draw(
      bitmap.width,
      bitmap.height,
      (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
    );
    bitmap.close?.();
    const out = await canvasToJpegBlob(canvas, quality);
    return { blob: out, width, height };
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Kunne ikke lese bildet'));
      el.src = url;
    });
    const { canvas, width, height } = draw(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
    );
    const out = await canvasToJpegBlob(canvas, quality);
    return { blob: out, width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageNaturalSize(blob) {
  if (typeof document === 'undefined') return { width: 0, height: 0 };
  try {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      return size;
    }
  } catch {
    // fall through
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('size'));
      el.src = url;
    });
    return { width: img.naturalWidth || img.width || 0, height: img.naturalHeight || img.height || 0 };
  } catch {
    return { width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Minimal JPEG EXIF (DateTimeOriginal + GPS) — best effort. */
async function readJpegExif(blob) {
  const meta = { takenAt: null, latitude: null, longitude: null };
  try {
    const buf = await blob.arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return meta;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xff) break;
      const marker = view.getUint8(offset + 1);
      const size = view.getUint16(offset + 2);
      if (marker === 0xe1) {
        const start = offset + 4;
        if (start + 6 < view.byteLength) {
          const head = String.fromCharCode(
            view.getUint8(start), view.getUint8(start + 1), view.getUint8(start + 2),
            view.getUint8(start + 3),
          );
          if (head === 'Exif') {
            Object.assign(meta, parseExifTiff(view, start + 6));
          }
        }
        break;
      }
      if (marker === 0xda) break;
      offset += 2 + size;
    }
  } catch {
    // ignore
  }
  return meta;
}

function parseExifTiff(view, tiffStart) {
  const out = { takenAt: null, latitude: null, longitude: null };
  try {
    const le = view.getUint16(tiffStart) === 0x4949;
    const u16 = (o) => (le ? view.getUint16(o, true) : view.getUint16(o, false));
    const u32 = (o) => (le ? view.getUint32(o, true) : view.getUint32(o, false));
    const ifd0 = tiffStart + u32(tiffStart + 4);

    const readIfd = (ifdOffset) => {
      if (ifdOffset <= 0 || ifdOffset + 2 > view.byteLength) return {};
      const entries = u16(ifdOffset);
      const map = {};
      for (let i = 0; i < entries; i += 1) {
        const e = ifdOffset + 2 + i * 12;
        if (e + 12 > view.byteLength) break;
        map[u16(e)] = {
          type: u16(e + 2),
          count: u32(e + 4),
          valueOffset: e + 8,
          value: u32(e + 8),
        };
      }
      return map;
    };

    const readString = (entry) => {
      if (!entry) return '';
      const bytes = entry.count;
      let pos = entry.value;
      if (bytes <= 4) pos = entry.valueOffset;
      else pos = tiffStart + entry.value;
      let s = '';
      for (let i = 0; i < bytes; i += 1) {
        const c = view.getUint8(pos + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    };

    const readRational = (entry, index = 0) => {
      if (!entry) return null;
      const pos = tiffStart + entry.value + index * 8;
      if (pos + 8 > view.byteLength) return null;
      const num = u32(pos);
      const den = u32(pos + 4) || 1;
      return num / den;
    };

    const ifd0map = readIfd(ifd0);
    const exifPtr = ifd0map[0x8769];
    if (exifPtr) {
      const exifMap = readIfd(tiffStart + exifPtr.value);
      const dt = readString(exifMap[0x9003]) || readString(exifMap[0x0132]);
      if (dt && /^\d{4}:\d{2}:\d{2}/.test(dt)) {
        const iso = dt.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T');
        const ms = Date.parse(iso);
        if (!Number.isNaN(ms)) out.takenAt = new Date(ms).toISOString();
      }
    }

    const gpsPtr = ifd0map[0x8825];
    if (gpsPtr) {
      const gps = readIfd(tiffStart + gpsPtr.value);
      const latRef = readString(gps[1]);
      const lonRef = readString(gps[3]);
      const lat = [0, 1, 2].map((i) => readRational(gps[2], i) || 0);
      const lon = [0, 1, 2].map((i) => readRational(gps[4], i) || 0);
      const toDeg = (a) => a[0] + a[1] / 60 + a[2] / 3600;
      if (gps[2] && gps[4]) {
        let latitude = toDeg(lat);
        let longitude = toDeg(lon);
        if (latRef === 'S') latitude = -latitude;
        if (lonRef === 'W') longitude = -longitude;
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          out.latitude = Math.round(latitude * 1e6) / 1e6;
          out.longitude = Math.round(longitude * 1e6) / 1e6;
        }
      }
    }
  } catch {
    // ignore
  }
  return out;
}

async function videoPosterBlob(blob) {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = url;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('video-timeout')), 12000);
      video.onloadeddata = () => { clearTimeout(t); resolve(); };
      video.onerror = () => { clearTimeout(t); reject(new Error('video-load')); };
    });
    try {
      const target = Math.min(0.4, Math.max(0, (video.duration || 1) * 0.05));
      if (Number.isFinite(target)) {
        video.currentTime = target;
        await new Promise((resolve) => {
          const done = () => resolve();
          video.onseeked = done;
          setTimeout(done, 1500);
        });
      }
    } catch {
      // use first frame
    }
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 360;
    const scale = Math.min(1, ALBUM_THUMB_EDGE / Math.max(w, h, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const out = await canvasToJpegBlob(canvas, 0.78);
    return {
      blob: out,
      width: w,
      height: h,
      thumbWidth: canvas.width,
      thumbHeight: canvas.height,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function mediaId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Prosesser og last opp ett album-media (original + display + thumb).
 * onProgress får 0–100 for hele jobben (varianter + opplastinger).
 */
export async function processAndUploadAlbumMedia(picked, {
  familyId,
  albumId,
  onProgress,
} = {}) {
  if (!familyId || !albumId) throw new Error('Mangler album');
  const blob = await readBlob(picked);
  const mime = picked?.mimeType || blob.type || 'application/octet-stream';
  const name = picked?.name || 'fil';
  const video = isVideoMime(mime, name);

  if (blob.size > MAX_ALBUM_MEDIA_BYTES) {
    throw new Error('Filen er for stor (maks 50 MB).');
  }

  const id = mediaId();
  const base = `families/${familyId}/albums/${albumId}/${id}`;
  const report = (pct) => onProgress?.(Math.max(0, Math.min(100, Math.round(pct))));
  report(2);

  if (video) {
    const originalExt = extForMime(mime, true);
    const originalPath = `${base}/original.${originalExt}`;
    let thumbUrl = null;
    let thumbPath = null;
    let width = picked?.width || 0;
    let height = picked?.height || 0;

    report(8);
    const poster = await videoPosterBlob(blob);
    if (poster?.blob) {
      width = poster.width || width;
      height = poster.height || height;
      thumbPath = `${base}/thumb.jpg`;
      thumbUrl = await uploadAlbumObjectWithProgress({
        familyId,
        albumId,
        objectPath: thumbPath,
        picked: { blob: poster.blob, mimeType: 'image/jpeg' },
        contentType: 'image/jpeg',
        onProgress: (p) => report(8 + p * 0.15),
      });
    } else {
      report(22);
    }

    const originalUrl = await uploadAlbumObjectWithProgress({
      familyId,
      albumId,
      objectPath: originalPath,
      picked: { blob, mimeType: mime },
      contentType: mime,
      onProgress: (p) => report(25 + p * 0.74),
    });

    report(100);
    return {
      id,
      mediaType: 'video',
      mimeType: mime,
      fileName: name,
      sizeBytes: blob.size,
      width: width || null,
      height: height || null,
      durationMs: picked?.duration ? Math.round(Number(picked.duration) * 1000) : null,
      downloadUrl: originalUrl,
      originalUrl,
      displayUrl: originalUrl,
      thumbUrl: thumbUrl || originalUrl,
      storagePath: originalPath,
      originalPath,
      displayPath: null,
      thumbPath,
      takenAt: null,
      latitude: null,
      longitude: null,
    };
  }

  // Image pipeline: original + display (~1600) + thumb (~360)
  const size = await imageNaturalSize(blob);
  report(6);
  const exif = mime.includes('jpeg') || mime.includes('jpg') || /\.jpe?g$/i.test(name)
    ? await readJpegExif(blob)
    : { takenAt: null, latitude: null, longitude: null };
  report(10);

  const display = await resizeImageBlob(blob, ALBUM_DISPLAY_EDGE, 0.85);
  report(18);
  const thumb = await resizeImageBlob(blob, ALBUM_THUMB_EDGE, 0.72);
  report(26);

  const originalExt = extForMime(mime, false);
  const originalPath = `${base}/original.${originalExt}`;
  const displayPath = `${base}/display.jpg`;
  const thumbPath = `${base}/thumb.jpg`;

  const originalUrl = await uploadAlbumObjectWithProgress({
    familyId,
    albumId,
    objectPath: originalPath,
    picked: { blob, mimeType: mime },
    contentType: mime || 'image/jpeg',
    onProgress: (p) => report(26 + p * 0.42),
  });
  const displayUrl = await uploadAlbumObjectWithProgress({
    familyId,
    albumId,
    objectPath: displayPath,
    picked: { blob: display.blob, mimeType: 'image/jpeg' },
    contentType: 'image/jpeg',
    onProgress: (p) => report(68 + p * 0.18),
  });
  const thumbUrl = await uploadAlbumObjectWithProgress({
    familyId,
    albumId,
    objectPath: thumbPath,
    picked: { blob: thumb.blob, mimeType: 'image/jpeg' },
    contentType: 'image/jpeg',
    onProgress: (p) => report(86 + p * 0.13),
  });

  report(100);
  return {
    id,
    mediaType: 'image',
    mimeType: mime || 'image/jpeg',
    fileName: name,
    sizeBytes: blob.size,
    width: size.width || display.width || null,
    height: size.height || display.height || null,
    durationMs: null,
    downloadUrl: originalUrl,
    originalUrl,
    displayUrl,
    thumbUrl,
    storagePath: originalPath,
    originalPath,
    displayPath,
    thumbPath,
    takenAt: exif.takenAt || null,
    latitude: exif.latitude,
    longitude: exif.longitude,
  };
}

export function albumThumbUrl(photo) {
  return photo?.thumbUrl || photo?.displayUrl || photo?.downloadUrl || photo?.originalUrl || null;
}

export function albumViewerUrl(photo, viewportWidth = 400) {
  if (!photo) return null;
  if (photo.mediaType === 'video') {
    return photo.originalUrl || photo.downloadUrl || null;
  }
  // Mobil/nettbrett: display-variant. Desktop kan også bruke display (original kun ved nedlasting).
  if (viewportWidth >= 1400 && photo.originalUrl) {
    // Svært store skjermer: fortsatt display for navigasjon (spar data); original via last ned.
    return photo.displayUrl || photo.originalUrl || photo.downloadUrl;
  }
  return photo.displayUrl || photo.downloadUrl || photo.originalUrl || null;
}

export function albumOriginalUrl(photo) {
  return photo?.originalUrl || photo?.downloadUrl || null;
}

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatPhotoTakenAt(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('nb-NO', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export async function downloadAlbumOriginal(photo) {
  const url = albumOriginalUrl(photo);
  if (!url) {
    Alert.alert('Feil', 'Fant ikke originalfilen.');
    return;
  }
  const name = photo?.fileName || (photo?.mediaType === 'video' ? 'video.mp4' : 'bilde.jpg');

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = obj;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(obj), 2000);
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

export async function downloadAlbumOriginals(photos) {
  const list = (photos || []).filter(Boolean);
  for (let i = 0; i < list.length; i += 1) {
    // Sequential so browser download managers stay stable.
    // eslint-disable-next-line no-await-in-loop
    await downloadAlbumOriginal(list[i]);
    if (i < list.length - 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}
