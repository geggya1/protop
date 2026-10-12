import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

function callableError(error, fallback) {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '');
  const cleaned = message.replace(/^INTERNAL:\s*/i, '').trim();
  return cleaned || fallback;
}

/** Knytt innlogget bruker til medarbeideren når e-posten stemmer. */
export async function claimEmployeeSeat(familyId) {
  const id = String(familyId || '').trim();
  if (!id) return { ok: true, skipped: true };
  const call = httpsCallable(functions, 'claimEmployeeInvite', { timeout: 20000 });
  try {
    const result = await call({ familyId: id });
    return result.data || { ok: true, skipped: true };
  } catch (error) {
    return { ok: false, error: callableError(error, 'Kunne ikke knytte deg til bedriften.') };
  }
}
