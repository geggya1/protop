import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

const LOCAL_PROXY = 'http://127.0.0.1:8787/search';

function isLocalWeb() {
  if (typeof window === 'undefined' || !window.location) return false;
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
}

async function searchViaProxy(query) {
  const res = await fetch(LOCAL_PROXY, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!res.ok) throw new Error(`Doffin-proxy svarte ${res.status}`);
  return res.json();
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
