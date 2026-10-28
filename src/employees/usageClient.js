import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { USAGE_BACKOFF_MS, createNavigationBatcher, isRateLimited } from './usageBatch';

const MIN_ACTIVE_MS = 3 * 60 * 1000;
/** Aktivitet (innlogging, puls, sidevisninger) kan vente; timer og invitasjoner er endringsspor. */
const ACTIVITY_TYPES = new Set(['login', 'active', 'navigation']);
let lastActiveAt = 0;
let pausedUntil = 0;

function callableError(error, fallback) {
  return String(error?.message || fallback).replace(/^FirebaseError:\s*/i, '');
}

async function sendUsage(event) {
  const type = String(event?.type || '');
  if (ACTIVITY_TYPES.has(type) && Date.now() < pausedUntil) return { ok: true, skipped: 'paused' };
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
    // For mange kall: ikke fortsett å treffe grensen (feil i konsollen og tapte hendelser).
    if (isRateLimited({ code: error?.code, message: error?.message })) pausedUntil = Date.now() + USAGE_BACKOFF_MS;
    return { ok: false, error: callableError(error, 'Kunne ikke skrive bruksloggen.') };
  }
}

// Sidevisninger samles og sendes én gang i minuttet (EGEN-05).
const navigation = createNavigationBatcher({ send: sendUsage });

/** Send sidene i køen nå (fanen skjules, siden lukkes). */
export function flushUsage() {
  return navigation.flush();
}

export async function recordUsage(event) {
  const type = String(event?.type || '');
  if (type === 'active') {
    const now = Date.now();
    if (now - lastActiveAt < MIN_ACTIVE_MS) return { ok: true, skipped: true };
    lastActiveAt = now;
  }
  if (type === 'navigation') {
    const added = navigation.add({
      companyId: event.companyId || '',
      tab: event.detail?.tab || '',
      subView: event.detail?.subView || '',
    });
    return { ok: true, queued: added, skipped: !added };
  }
  return sendUsage(event);
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
