import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

/** Ber den deployede funksjonen lese avtalen. Lokal tolkning brukes hvis kallet ikke svarer. */
export async function interpretAvtale(payload) {
  const call = httpsCallable(functions, 'interpretIndeksAvtale', { timeout: 90000 });
  const documents = Array.isArray(payload?.documents) ? payload.documents.slice(0, 12).map((doc) => ({
    name: String(doc?.name || 'Avtale').slice(0, 180),
    text: String(doc?.text || '').slice(0, 20000),
  })) : [];
  const response = await call({
    text: String(payload?.text || '').slice(0, 40000),
    fileName: String(payload?.fileName || '').slice(0, 180),
    mimeType: String(payload?.mimeType || '').slice(0, 120),
    fileBase64: String(payload?.fileBase64 || '').slice(0, 6000000),
    documents,
  });
  return response?.data || { ok: false };
}
