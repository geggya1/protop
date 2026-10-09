/**
 * Henter CV-bilder til PDF via Firebase Storage SDK (getBytes).
 * Vanlig fetch/CORS fra nettleseren feiler ofte mot Storage — derfor denne stien.
 */
import { getAuth } from 'firebase/auth';
import { getBytes, ref as storageRef } from 'firebase/storage';
import { storage } from '../../firebase';
import { decodeBase64, jpegSize } from '../project/companyLogo.js';
import { storagePathFromUrl } from './cvPdfPaths.js';

export { isFirebaseStorageUrl, storagePathFromUrl } from './cvPdfPaths.js';

const MAX_BYTES = 8 * 1024 * 1024;

function jpegFromDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:image\/(?:jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const bytes = decodeBase64(match[1]);
  const size = jpegSize(bytes);
  if (!bytes || !size) return null;
  return { bytes, width: size.width, height: size.height };
}

function jpegFromBytes(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    const size = jpegSize(buf);
    if (!size) return null;
    return { bytes: buf, width: size.width, height: size.height };
  }
  return null;
}

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

async function bytesViaGetBytes(path) {
  if (!path) return null;
  try {
    const bytes = await getBytes(storageRef(storage, path), MAX_BYTES);
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  } catch {
    return null;
  }
}

async function bytesViaAuthFetch(url) {
  if (!url || !/^https?:\/\//i.test(url) || typeof fetch !== 'function') return null;
  try {
    const user = getAuth().currentUser;
    const headers = {};
    if (user) {
      try {
        headers.Authorization = `Bearer ${await user.getIdToken()}`;
      } catch {
        // fortsett uten token
      }
    }
    const res = await fetch(url, { headers, mode: 'cors' });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
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

  const path = storagePathFromUrl(src);
  let bytes = path ? await bytesViaGetBytes(path) : null;
  if (!bytes && /^https?:\/\//i.test(src)) {
    bytes = await bytesViaAuthFetch(src);
  }
  if (!bytes) return null;

  const jpeg = jpegFromBytes(bytes);
  if (jpeg) return jpeg;

  if (typeof document !== 'undefined') {
    const blob = new Blob([bytes]);
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await rasterToJpeg(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }
  return null;
}
