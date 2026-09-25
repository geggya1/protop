import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { applyScan } from './intake.js';

export async function sendDirectAnbud(input) {
  const call = httpsCallable(functions, 'sendAnbudRequest', { timeout: 20000 });
  const res = await call(input);
  return res?.data || { ok: false };
}

export async function scanAnbudFile(imageBase64) {
  const call = httpsCallable(functions, 'scanAnbudDocument', { timeout: 60000 });
  const res = await call({ imageBase64 });
  return res?.data || { ok: false };
}

export async function fileToDataUrl(file) {
  if (!file) return '';
  if (typeof FileReader === 'undefined') return '';
  let blob = file.blob || null;
  if (!blob && file.uri && typeof fetch === 'function') {
    const res = await fetch(file.uri);
    blob = await res.blob();
  }
  if (!blob) return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kunne ikke lese filen.'));
    reader.readAsDataURL(blob);
  });
}

export function mergeScan(inquiry, data) {
  if (!data?.extracted) return inquiry;
  return applyScan(inquiry, data.extracted, { engine: data.engine || 'gemini' });
}
