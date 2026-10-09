/**
 * Henter CV-bilder til PDF.
 * Direkte Storage (getBytes / auth-fetch) feiler ofte fra protop.no pga. ødelagt
 * CORS-preflight — samme årsak som at opplasting går via Admin-callable.
 * Rekkefølge: token-URL uten ekstra headers → downloadStorageFile-callable → getBytes.
 */
import { httpsCallable } from 'firebase/functions';
import { getBytes, ref as storageRef } from 'firebase/storage';
import { functions, storage } from '../../firebase';
import { decodeBase64 } from '../project/companyLogo.js';
import { jpegFromBytes, jpegFromDataUrl } from './cvPdfJpeg.js';
import { storagePathFromUrl } from './cvPdfPaths.js';

export { isFirebaseStorageUrl, storagePathFromUrl } from './cvPdfPaths.js';
export { jpegFromBytes, jpegFromDataUrl } from './cvPdfJpeg.js';

const MAX_BYTES = 8 * 1024 * 1024;

function rasterToJpeg(src, maxEdge = 1400) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    if (!String(src).startsWith('blob:') && !String(src).startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round((img.width || 1) * scale));
        const h = Math.max(1, Math.round((img.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(jpegFromDataUrl(canvas.toDataURL('image/jpeg', 0.86)));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function bytesToJpeg(bytes) {
  if (!bytes?.length) return null;
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const jpeg = jpegFromBytes(buf);
  if (jpeg) return jpeg;
  if (typeof document === 'undefined') return null;
  const blob = new Blob([buf]);
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await rasterToJpeg(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Enkel GET uten Authorization — unngår ødelagt CORS-preflight fra protop.no. */
export async function bytesViaPlainFetch(url) {
  if (!url || !/^https?:\/\//i.test(url) || typeof fetch !== 'function') return null;
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function bytesViaCallable(url) {
  const path = storagePathFromUrl(url);
  if (!path && !/^https?:\/\//i.test(url)) return null;
  try {
    const fn = httpsCallable(functions, 'downloadStorageFile');
    const res = await fn({ objectPath: path || undefined, url: url || undefined });
    const b64 = String(res?.data?.fileBase64 || '').replace(/\s+/g, '');
    if (!b64) return null;
    return decodeBase64(b64);
  } catch {
    return null;
  }
}

async function bytesViaGetBytes(url) {
  const path = storagePathFromUrl(url);
  if (!path) return null;
  try {
    const bytes = await getBytes(storageRef(storage, path), MAX_BYTES);
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  } catch {
    return null;
  }
}

/** Returnerer { bytes, width, height } som JPEG, eller null. */
export async function loadImageAsJpeg(url) {
  const src = String(url || '').trim();
  if (!src) return null;

  if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) {
    return jpegFromDataUrl(src);
  }
  if (src.startsWith('data:image/')) {
    return rasterToJpeg(src);
  }

  let bytes = await bytesViaPlainFetch(src);
  if (!bytes) bytes = await bytesViaCallable(src);
  if (!bytes) bytes = await bytesViaGetBytes(src);
  return bytesToJpeg(bytes);
}
