import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { searchTedNotices } from './tedQuery';
import { summarizeNotice } from './dossier';

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

function rememberHit(map, hit, words) {
  const id = String(hit?.id || '').trim();
  if (!id) return;
  const prev = map.get(id);
  const matchedKeywords = [...new Set([
    ...(prev?.matchedKeywords || []),
    ...(hit?.matchedKeywords || []),
    ...words,
  ].map((word) => String(word || '').trim()).filter(Boolean))];
  map.set(id, { ...(prev || {}), ...hit, ...(matchedKeywords.length ? { matchedKeywords } : {}) });
}

/** Henter CPV-treff og, i tillegg, treff på registrerte søkeord. Tidligere rader slås sammen av kaller. */
export async function fetchWatchHits({ cpvCodes, locationIds, channels, keywords, publishedFrom } = {}) {
  const data = await fetchTenderHits({ cpvCodes, locationIds, channels, publishedFrom });
  const byId = new Map();
  for (const hit of data.hits || []) rememberHit(byId, hit, []);
  const words = (Array.isArray(keywords) ? keywords : []).map((word) => String(word || '').trim()).filter((word) => word.length >= 2).slice(0, 8);
  const channelList = Array.isArray(channels) && channels.length ? channels : ['doffin', 'ted'];
  await Promise.all(words.map(async (word) => {
    const jobs = [
      fetchTenderHits({
        cpvCodes: [],
        locationIds,
        channels: channelList,
        publishedFrom,
        searchString: word,
        keywords: [word],
      }).then((extra) => {
        for (const hit of extra.hits || []) rememberHit(byId, hit, [word]);
      }).catch(() => {}),
    ];
    if (channelList.includes('ted')) {
      jobs.push(searchTedNotices({
        keywords: [word],
        locationIds,
        publishedFrom,
        numHitsPerPage: 15,
      }).then((extra) => {
        for (const hit of extra.hits || []) rememberHit(byId, hit, [word]);
      }).catch(() => {}));
    }
    await Promise.all(jobs);
  }));
  return {
    ok: true,
    hits: [...byId.values()],
    errors: data.errors || [],
    fetchedAt: data.fetchedAt || new Date().toISOString(),
  };
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
  try {
    const res = await fetch('/api/tender-proxy', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dossier', id }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.notice) return { ok: true, dossier: summarizeNotice(data.notice) };
    if (res.ok && data.dossier) return data;
  } catch {
    // Samme-origin-proxyen finnes ikke i appen. Prøv lokal proxy eller kallbar funksjon.
  }
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
