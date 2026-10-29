import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { emptyBilag } from './familyDocuments';

/**
 * Kjør AI-OCR på kvitteringsbilde (storage-path eller base64).
 * @returns {Promise<{ bilag: object, engine?: string }>}
 */
export async function ocrReceiptWithAi(familyId, {
  storagePath = '',
  imageBase64 = '',
  hint = '',
} = {}) {
  const fn = httpsCallable(functions, 'aiReceiptOcr', { timeout: 120000 });
  const result = await fn({
    familyId,
    storagePath: String(storagePath || '').trim(),
    imageBase64: String(imageBase64 || '').trim(),
    hint: String(hint || '').trim(),
  });
  const data = result?.data || {};
  return {
    bilag: {
      ...emptyBilag({ ocrStatus: 'done', ocrEngine: data.engine || 'gemini' }),
      ...(data.bilag || {}),
    },
    engine: data.engine || 'gemini',
  };
}

/** Blob → data-URL base64 (for OCR når storagePath ikke er klar). */
export async function blobToDataUrl(blob) {
  if (!blob) return '';
  if (typeof FileReader === 'undefined') return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kunne ikke lese bildet'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Tolk kvitteringen til et utlegg. images: data-URL-er (1–4 bilder eller PDF) fra prepareReceipt.
 * expenseTypes: «id: navn; …» (expenseTypeHint), så AI-en velger en type appen kjenner.
 */
export async function ocrExpenseReceipt(familyId, images = [], { expenseTypes = '', hint = '' } = {}) {
  const fn = httpsCallable(functions, 'aiReceiptOcr', { timeout: 120000 });
  const result = await fn({
    familyId,
    purpose: 'expense',
    images: (images || []).filter(Boolean).slice(0, 4),
    expenseTypes: String(expenseTypes || ''),
    hint: String(hint || '').trim().slice(0, 200),
  });
  return result?.data?.bilag || {};
}
