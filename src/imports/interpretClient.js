import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

function bytesToBase64(bytes) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < raw.length; index += chunk) {
    binary += String.fromCharCode(...raw.subarray(index, index + chunk));
  }
  if (typeof btoa !== 'function') {
    throw new Error('Kunne ikke sende filen til tolking.');
  }
  return btoa(binary);
}

export async function askImportInterpret(payload) {
  const call = httpsCallable(functions, 'interpretImport', { timeout: 120000 });
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
    body.mime = payload?.media?.mime || 'image/jpeg';
    body.imageBase64 = bytesToBase64(payload?.bytes);
  }
  try {
    const res = await call(body);
    return res?.data || {};
  } catch (err) {
    const code = String(err?.code || '');
    if (code.includes('not-found') || code.includes('unavailable')) {
      throw new Error('AI-tolking er ikke tilgjengelig akkurat nå.');
    }
    throw err;
  }
}
