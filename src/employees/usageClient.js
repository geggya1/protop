import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const MIN_ACTIVE_MS = 3 * 60 * 1000;
let lastActiveAt = 0;
let lastNavigation = '';

function callableError(error, fallback) {
  return String(error?.message || fallback).replace(/^FirebaseError:\s*/i, '');
}

export async function recordUsage(event) {
  const type = String(event?.type || '');
  if (type === 'active') {
    const now = Date.now();
    if (now - lastActiveAt < MIN_ACTIVE_MS) return { ok: true, skipped: true };
    lastActiveAt = now;
  }
  if (type === 'navigation') {
    const key = `${event.companyId || ''}:${event.detail?.tab || ''}:${event.detail?.subView || ''}`;
    if (key === lastNavigation) return { ok: true, skipped: true };
    lastNavigation = key;
  }
  const call = httpsCallable(functions, 'recordUsage', { timeout: 15000 });
  try {
    const result = await call({
      type,
      companyId: event.companyId || '',
      employeeId: event.employeeId || '',
      summary: event.summary || '',
      detail: event.detail || {},
    });
    return result.data || { ok: true };
  } catch (error) {
    return { ok: false, error: callableError(error, 'Kunne ikke skrive bruksloggen.') };
  }
}

export async function listEmployeeUsage({ companyId, employeeId }) {
  const call = httpsCallable(functions, 'listEmployeeUsage', { timeout: 20000 });
  try {
    const result = await call({ companyId, employeeId });
    return result.data || { ok: false, error: 'Kunne ikke hente bruksloggen.' };
  } catch (error) {
    return { ok: false, error: callableError(error, 'Kunne ikke hente bruksloggen.') };
  }
}
