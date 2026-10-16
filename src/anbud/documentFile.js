/** Henter avtalefiler til forhåndsvisning og «Åpne original».
 * Nettleseren kan ikke vise Firebase-PDF i iframe, og window.open(data:) feiler.
 * Vi leser bytes (direkte, eller via downloadStorageFile) og lager en blob-URL.
 */

import { documentPreviewKind } from './documentAccess.js';

const CACHE_MAX = 4;
const byteCache = new Map();
const urlCache = new Map();

function rememberLimited(map, key, value, onEvict) {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > CACHE_MAX) {
    const oldest = map.keys().next().value;
    const prev = map.get(oldest);
    map.delete(oldest);
    onEvict?.(prev, oldest);
  }
}

export function storagePathFromReference(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return '';
  if (raw.includes('..')) return '';
  if (/^gs:\/\//i.test(raw)) {
    const path = raw.replace(/^gs:\/\/[^/]+\//i, '').replace(/^\//, '');
    return path.includes('..') ? '' : path;
  }
  if (
    /firebasestorage\.googleapis\.com\/v0\/b\//i.test(raw)
    || /\.firebasestorage\.app\/v0\/b\//i.test(raw)
    || /\.appspot\.com\/v0\/b\//i.test(raw)
  ) {
    try {
      const after = raw.split('/o/')[1] || '';
      const path = decodeURIComponent((after.split('?')[0] || '')).replace(/^\//, '');
      if (!path || path.includes('..')) return '';
      return path;
    } catch {
      return '';
    }
  }
  if (/^https?:\/\//i.test(raw)) return '';
  return raw.replace(/^\//, '');
}

export function storagePathFromDocument(doc) {
  return storagePathFromReference(doc?.storagePath)
    || storagePathFromReference(doc?.url)
    || storagePathFromReference(doc?.uri)
    || '';
}

/** Varig https-adresse. blob:- og data:-URLer holdes utenfor. */
export function publicHttpHref(doc) {
  for (const value of [doc?.url, doc?.uri]) {
    const href = String(value || '').trim();
    if (/^https?:\/\//i.test(href)) return href;
  }
  return '';
}

export function bytesFromBase64(value) {
  const clean = String(value || '').replace(/\s+/g, '');
  if (!clean) return new Uint8Array();
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(clean, 'base64'));
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return null;
  const mime = match[1] || 'application/octet-stream';
  const payload = match[3] || '';
  try {
    if (match[2]) return { mime, bytes: bytesFromBase64(payload) };
    const text = decodeURIComponent(payload);
    return { mime, bytes: new TextEncoder().encode(text) };
  } catch {
    return null;
  }
}

function cacheKey(doc) {
  const data = String(doc?.dataUrl || '');
  return [
    storagePathFromDocument(doc),
    publicHttpHref(doc),
    String(doc?.uri || '').startsWith('blob:') ? String(doc.uri) : '',
    data.length,
    data.slice(0, 64),
    Number(doc?.size) || 0,
    String(doc?.name || ''),
  ].join('\n');
}

export function peekAgreementBlobUrl(doc) {
  return urlCache.get(cacheKey(doc)) || '';
}

export function rememberAgreementBlobUrl(doc, file) {
  const key = cacheKey(doc);
  const existing = urlCache.get(key);
  if (existing) return existing;
  if (!file?.bytes?.length || typeof URL === 'undefined' || typeof Blob === 'undefined') return '';
  const url = URL.createObjectURL(new Blob([file.bytes], { type: file.mime || 'application/octet-stream' }));
  rememberLimited(urlCache, key, url, (prev) => {
    if (typeof prev === 'string' && prev.startsWith('blob:')) {
      try { URL.revokeObjectURL(prev); } catch { /* ignore */ }
    }
  });
  return url;
}

function looksLikePdf(bytes) {
  return !!bytes
    && bytes.length >= 5
    && bytes[0] === 0x25
    && bytes[1] === 0x50
    && bytes[2] === 0x44
    && bytes[3] === 0x46;
}

function mimeFor(doc, sniffed) {
  const kind = documentPreviewKind(doc);
  const header = String(sniffed || '').split(';')[0].trim().toLowerCase();
  if (kind === 'pdf') return 'application/pdf';
  if (kind === 'image') {
    if (header.startsWith('image/')) return header;
    const declared = String(doc?.mimeType || '').toLowerCase();
    if (declared.startsWith('image/')) return declared;
    return 'image/jpeg';
  }
  if (header) return header;
  return String(doc?.mimeType || 'application/octet-stream') || 'application/octet-stream';
}

function acceptable(doc, bytes) {
  if (!bytes?.length) return false;
  if (documentPreviewKind(doc) === 'pdf') return looksLikePdf(bytes);
  return true;
}

function asFile(doc, bytes, sniffed) {
  return {
    bytes,
    mime: mimeFor(doc, sniffed),
    name: String(doc?.name || ''),
  };
}

async function fetchBytes(href, fetchImpl) {
  const res = await fetchImpl(href, { method: 'GET', mode: 'cors', credentials: 'omit' });
  if (!res?.ok) return null;
  const buffer = typeof res.arrayBuffer === 'function' ? await res.arrayBuffer() : null;
  if (!buffer) return null;
  const bytes = new Uint8Array(buffer);
  if (!bytes.length) return null;
  const mime = typeof res.headers?.get === 'function' ? res.headers.get('content-type') : '';
  return { bytes, mime: mime || '' };
}

async function defaultDownload(objectPath) {
  const { httpsCallable } = await import('firebase/functions');
  const { functions } = await import('../../firebase.js');
  const fn = httpsCallable(functions, 'downloadStorageFile', { timeout: 120000 });
  const res = await fn({ objectPath });
  return res?.data || null;
}

/**
 * @param {object} doc
 * @param {{ fetch?: Function, download?: Function }} [deps]
 * @returns {Promise<{ bytes: Uint8Array, mime: string, name: string } | null>}
 */
export async function loadAgreementBytes(doc, deps = {}) {
  if (!doc) return null;
  const custom = !!(deps.fetch || deps.download);
  const key = cacheKey(doc);
  if (!custom && byteCache.has(key)) return byteCache.get(key);

  const store = (file) => {
    if (!custom && file) rememberLimited(byteCache, key, file);
    return file;
  };

  const data = parseDataUrl(doc.dataUrl);
  if (data?.bytes?.length && acceptable(doc, data.bytes)) {
    return store(asFile(doc, data.bytes, data.mime));
  }

  const hrefs = [];
  const blobHref = String(doc.uri || '');
  if (blobHref.startsWith('blob:')) hrefs.push(blobHref);
  const http = publicHttpHref(doc);
  if (http) hrefs.push(http);

  const fetchImpl = deps.fetch || globalThis.fetch;
  if (typeof fetchImpl === 'function') {
    for (const href of hrefs) {
      try {
        const got = await fetchBytes(href, fetchImpl);
        if (got && acceptable(doc, got.bytes)) return store(asFile(doc, got.bytes, got.mime));
      } catch {
        // Prøv neste kilde. CORS fra protop.no feiler ofte mot Storage.
      }
    }
  }

  const path = storagePathFromDocument(doc);
  const download = deps.download === undefined ? defaultDownload : deps.download;
  if (path && typeof download === 'function') {
    try {
      const payload = await download(path);
      const bytes = bytesFromBase64(payload?.fileBase64 || '');
      if (acceptable(doc, bytes)) return store(asFile(doc, bytes, payload?.contentType || ''));
    } catch {
      // Ingen bytes å vise.
    }
  }

  return null;
}
