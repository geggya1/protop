import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { normalizeJoinCode } from './secureJoinCode';

export async function resolveJoinCode(code) {
  const fn = httpsCallable(functions, 'resolveJoinCode');
  const res = await fn({ code: normalizeJoinCode(code) });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Ugyldig kode');
  return res.data;
}

export async function submitJoinRequestByCode(payload) {
  const fn = httpsCallable(functions, 'submitJoinRequestByCode');
  const res = await fn({
    ...payload,
    code: normalizeJoinCode(payload?.code || payload?.joinCode),
  });
  if (!res?.data?.ok) throw new Error(res?.data?.error || 'Kunne ikke sende forespørsel');
  return res.data;
}

/** Admin-backed family list — used when client Firestore list queries are denied. */
export async function listMyFamilies() {
  const fn = httpsCallable(functions, 'listMyFamilies', { timeout: 30000 });
  try {
    const res = await fn({});
    if (!res?.data?.ok) throw new Error(res?.data?.error || 'Kunne ikke hente familier');
    return Array.isArray(res.data.families) ? res.data.families : [];
  } catch (e) {
    const code = String(e?.code || '');
    const msg = String(e?.message || '');
    if (/internal|not-found|unavailable/i.test(code) || /internal|not-found|unavailable/i.test(msg)) {
      const err = new Error('Kunne ikke hente familien akkurat nå. Prøv igjen om litt.');
      err.code = code || 'functions/internal';
      err.cause = e;
      throw err;
    }
    throw e;
  }
}
