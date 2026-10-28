import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { shouldSendAccess } from './accessLog';

const seen = new Map();

/**
 * Logg innsyn i en annens HR-mappe, lønn, fravær eller personnummer (L-19).
 * Venter ikke og feiler stille: visningen skal ikke stoppe om loggen ikke svarer.
 * Samme innsyn sendes én gang per ti minutter.
 */
export function logSensitiveAccess({ familyId, kind, employeeId = '' }) {
  if (!familyId || !kind) return;
  if (!shouldSendAccess(seen, `${familyId}:${kind}:${employeeId}`)) return;
  httpsCallable(functions, 'logSensitiveAccess', { timeout: 15000 })({ familyId, kind, employeeId })
    .catch(() => {});
}

/** { ok, rows, scope } eller { ok: false, error }. employeeId = bare innsyn i én ansatt. */
export async function listAccessLog({ familyId, employeeId = '' }) {
  try {
    const res = await httpsCallable(functions, 'listAccessLog', { timeout: 20000 })({ familyId, employeeId });
    return res?.data || { ok: false, error: 'Kunne ikke hente innsynsloggen.' };
  } catch (error) {
    return { ok: false, error: String(error?.message || 'Kunne ikke hente innsynsloggen.').replace(/^FirebaseError:\s*/i, '') };
  }
}
