import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { prepareImportBody, readableImportError } from './filePayload';

async function shrinkImageInBrowser(bytes, { maxEdge = 1400, quality = 0.72 } = {}) {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const blob = new Blob([bytes], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height, 1));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (typeof document.createElement !== 'function') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context || typeof canvas.toDataURL !== 'function') return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const encoded = String(dataUrl || '').split(',')[1] || '';
    if (!encoded || typeof atob !== 'function') return null;
    const binary = atob(encoded);
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return { bytes: out, width, height };
  } finally {
    bitmap.close?.();
  }
}

export async function askImportInterpret(payload) {
  const call = httpsCallable(functions, 'interpretImport', { timeout: 180000 });
  const body = {
    familyId: payload?.familyId || '',
    kind: payload?.kind || 'customers',
    mode: payload?.mode || 'columns',
    filename: payload?.filename || '',
  };
  if (payload?.text) {
    body.mode = 'ocr';
    body.text = String(payload.text).slice(0, 12000);
  } else if (body.mode === 'columns') {
    body.headers = payload?.headers || [];
    body.samples = payload?.samples || [];
  } else {
    const prepared = await prepareImportBody({
      bytes: payload?.bytes,
      filename: payload?.filename,
      mime: payload?.media?.mime,
    }, { shrinkImage: shrinkImageInBrowser });
    body.mime = prepared.mime;
    body.imageBase64 = prepared.imageBase64;
  }
  try {
    const res = await call(body);
    return res?.data || {};
  } catch (err) {
    throw readableImportError(err);
  }
}
