import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { searchTedNotices } from './tedQuery';

const LOCAL_SEARCH = 'http://127.0.0.1:8787/search';
const LOCAL_COMPANY = 'http://127.0.0.1:8787/company';
const LOCAL_DOSSIER = 'http://127.0.0.1:8787/dossier';

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

export async function fetchTenderHits(query) {
  const res = await fetch('/api/tender-proxy', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'search', ...query }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || 'Kunne ikke hente treff.');
  return data;
}

export async function fetchRegisterExtras(orgnr) {
  const res = await fetch('/api/tender-proxy', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', orgnr }),
  });
  if (!res.ok) return { accounts: null, signature: null };
  return res.json().catch(() => ({ accounts: null, signature: null }));
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

/** Henter kunngjøring, dokumentlenker, ESPD-grunnlag og spørsmålsfrist. */
export async function fetchCompetitionFile(id) {
  if (isLocalWeb()) {
    try {
      const res = await fetch(LOCAL_DOSSIER, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Kunngjøringen svarte ${res.status}`);
      return data;
    } catch (err) {
      if (err?.message && !String(err.message).includes('Failed to fetch')) throw err;
    }
  }
  const call = httpsCallable(functions, 'fetchDossier', { timeout: 30000 });
  const res = await call({ id });
  return res.data;
}

/** Henter aktive TED-kunngjøringer. Direkte API først, skyfunksjon som reserve. */
export async function fetchTedNotices(query) {
  try {
    return await searchTedNotices(query);
  } catch (err) {
    if (isLocalWeb()) throw err;
    const call = httpsCallable(functions, 'searchTed', { timeout: 25000 });
    const res = await call(query);
    return res.data;
  }
}

/** Sender varslingsposten til registrerte mottakere. */
export async function sendTenderAlert(message) {
  const call = httpsCallable(functions, 'sendTenderAlert', { timeout: 30000 });
  const res = await call(message);
  return res.data;
}
