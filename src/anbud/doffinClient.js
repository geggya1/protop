import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const LOCAL_SEARCH = 'http://127.0.0.1:8787/search';
const LOCAL_COMPANY = 'http://127.0.0.1:8787/company';

function isLocalWeb() {
  if (typeof window === 'undefined' || !window.location) return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

async function searchViaProxy(query) {
  const res = await fetch(LOCAL_SEARCH, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`Doffin-proxy svarte ${res.status}`);
  return res.json();
}

async function companyViaProxy(orgnr) {
  const res = await fetch(LOCAL_COMPANY, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgnr }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Oppslag svarte ${res.status}`);
  return data;
}

/** Henter aktive Doffin-kunngjøringer for registrerte CPV-koder og område. */
export async function fetchDoffinNotices(query) {
  if (isLocalWeb()) {
    try {
      return await searchViaProxy(query);
    } catch {
      // Lokal proxy kjører ikke. Prøv skyfunksjonen.
    }
  }
  const call = httpsCallable(functions, 'searchDoffin', { timeout: 20000 });
  const res = await call(query);
  return res.data;
}

/** Henter bedrift fra Enhetsregisteret og CPV-koder fra offentlige Doffin-tildelinger. */
export async function fetchCompanyCpv(orgnr) {
  if (isLocalWeb()) {
    try {
      return await companyViaProxy(orgnr);
    } catch (err) {
      if (err?.message && !String(err.message).includes('Failed to fetch')) throw err;
    }
  }
  const call = httpsCallable(functions, 'lookupCompany', { timeout: 60000 });
  const res = await call({ orgnr });
  return res.data;
}
