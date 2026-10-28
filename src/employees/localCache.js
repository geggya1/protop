import { normalizeEmployee } from './model.js';
import { withoutPrivate } from './privateFields.js';

const LIST_KEY = 'protop.employees.v1';

export function employeeListKey(companyId) {
  return `${LIST_KEY}.${companyId}`;
}

export function isQuotaError(err) {
  const name = String(err?.name || '');
  const message = String(err?.message || '');
  return name === 'QuotaExceededError'
    || err?.code === 22
    || err?.code === 1014
    || /quota/i.test(message);
}

function keepRemoteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || /^data:/i.test(raw)) return '';
  return raw;
}

/**
 * Lokal kopi uten innebygde bilder. De fyller Safari sin kvote og stopper lagring.
 * Personnummer, pårørende og intern kommentar lagres ikke på enheten (L-03).
 */
export function employeeForCache(employee) {
  const next = normalizeEmployee(withoutPrivate(normalizeEmployee(employee)));
  next.person.photoUrl = keepRemoteUrl(next.person.photoUrl);
  next.cv.projects = (next.cv.projects || []).map((project) => ({
    ...project,
    images: (project.images || []).map(keepRemoteUrl).filter(Boolean),
  }));
  return next;
}

export async function persistEmployeeList(storage, key, rows) {
  if (!key) return;
  const payload = JSON.stringify((rows || []).map(employeeForCache));
  try {
    await storage.setItem(key, payload);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    try { await storage.removeItem(key); } catch { /* den gamle kopien får stå hvis den ikke kan slettes */ }
    try { await storage.setItem(key, payload); } catch { /* nettlisten er allerede lagret */ }
  }
}
