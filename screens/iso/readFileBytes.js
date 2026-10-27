/**
 * Innholdet i en valgt fil (eller et vedlegg i Storage) som bytes.
 * Felles for importene fra Visio, Excel og Word.
 */
import { bytesFromBase64, storagePathFromReference } from '../../src/anbud/documentFile';

export async function readFileBytes(picked, what = 'filen') {
  if (picked?.blob?.arrayBuffer) return new Uint8Array(await picked.blob.arrayBuffer());
  if (typeof Blob !== 'undefined' && picked instanceof Blob) return new Uint8Array(await picked.arrayBuffer());
  try {
    const res = await fetch(picked.uri || picked.url);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    // CORS mot Storage fra nettleseren: hent via serveren under.
  }
  const path = picked.path || storagePathFromReference(picked.url || '');
  if (path) {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../firebase');
    const res = await httpsCallable(functions, 'downloadStorageFile', { timeout: 120000 })({ objectPath: path });
    const bytes = bytesFromBase64(res?.data?.fileBase64 || '');
    if (bytes?.length) return bytes;
  }
  throw new Error(`Kunne ikke hente ${what}.`);
}

/** Filnavn som tåles i Storage-stier. */
export const safeFileName = (name, fallback = 'fil') => String(name || fallback).replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
