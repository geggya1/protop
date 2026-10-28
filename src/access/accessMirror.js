/**
 * Ber serveren speile tilgangsmatrisen for selskapet (Cloud Function syncCompanyAccess).
 *
 * Speilet (families/{id}/accessAcl/{uid}) er det Firestore-reglene leser for selskapsdokumentet,
 * ansatte og ISO. Samme kall holder administratorlisten (adminUids) i takt med nivået
 * Administrator. Appen ber om synk når et bedriftsskall åpnes, og straks når noen som kan
 * endre tilgang ser at et nivå, en status eller matrisen er endret. Ellers ikke oftere enn
 * hvert tiende minutt (speilet varer i 12 timer).
 *
 * Klienten kan bare be om synk. Speilet skrives av serveren (og av eieren som reserve).
 */

export const ACCESS_SYNC_INTERVAL_MS = 10 * 60 * 1000;
const DEBOUNCE_MS = 1500;

const runs = new Map();

/** Feltene på en ansatt som påvirker tilgangen. */
function accessFields(row) {
  const company = row?.company || {};
  return [
    String(row?.id || ''),
    String(row?.personUid || ''),
    String(company.status || ''),
    String(company.accessLevel || ''),
    Array.isArray(company.accessLevels) ? company.accessLevels.join(',') : '',
    String(company.accessRole || ''),
    JSON.stringify(company.accessOverrides || {}),
  ].join('|');
}

/** Fingeravtrykk av matrisen og nivåene. Endres det, må speilet beregnes på nytt. */
export function accessSignature(policy, employees = []) {
  const rows = (employees || []).map(accessFields).sort();
  return `${JSON.stringify(policy || null)}#${rows.join(';')}`;
}

/**
 * Skal appen be om ny synk nå?
 * previous: { at, key } fra forrige synk i denne økten, eller null.
 * force: den innloggede kan endre tilgang, og fingeravtrykket er nytt.
 */
export function accessSyncDue(previous, { now = Date.now(), key = '', force = false } = {}) {
  if (!previous) return true;
  if (force && previous.key !== key) return true;
  return now - (Number(previous.at) || 0) >= ACCESS_SYNC_INTERVAL_MS;
}

async function callSyncCompanyAccess(companyId) {
  const [{ httpsCallable }, { functions }] = await Promise.all([import('firebase/functions'), import('../../firebase.js')]);
  const call = httpsCallable(functions, 'syncCompanyAccess', { timeout: 20000 });
  return call({ companyId });
}

async function runAccessSync(companyId, { key, force, call }) {
  const previous = runs.get(companyId) || null;
  if (previous?.pending) {
    // Ett kall om gangen. Et nytt fingeravtrykk kjøres når det pågående er ferdig.
    previous.again = { key, force };
    return;
  }
  const now = Date.now();
  if (!accessSyncDue(previous, { now, key, force })) return;
  runs.set(companyId, { at: now, key, pending: true });
  try {
    await call(companyId);
  } catch {
    // Nett eller tilgang: neste åpning av skallet prøver igjen.
  } finally {
    const again = runs.get(companyId)?.again || null;
    runs.set(companyId, { at: now, key, pending: false });
    if (again) runAccessSync(companyId, { ...again, call });
  }
}

/**
 * Be om synk etter en kort pause (flere skjermer i skallet ber samtidig). Returnerer avbryt.
 */
export function scheduleAccessSync(companyId, {
  key = '', force = false, call = callSyncCompanyAccess, delayMs = DEBOUNCE_MS,
} = {}) {
  const id = String(companyId || '').trim();
  if (!id) return () => {};
  const timer = setTimeout(() => {
    runAccessSync(id, { key, force, call });
  }, delayMs);
  return () => clearTimeout(timer);
}

/** Bare for tester. */
export function resetAccessSyncState() {
  runs.clear();
}
