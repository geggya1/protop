import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { searchTedNotices } from './tedQuery';
import { summarizeNotice } from './dossier';
import { interestUrlFromDocs } from './portalCatalog';
import { collectWatchHits } from './watchHits';

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
  if (!res.ok || data.ok === false) {
    const detail = data.error || (Array.isArray(data.errors) ? data.errors.filter(Boolean)[0] : '');
    throw new Error(detail || 'Kunne ikke hente treff.');
  }
  return data;
}

/** Henter CPV-treff og, i tillegg, treff på søkeord fra bedriften og AI-profilen. */
export function fetchWatchHits(query) {
  return collectWatchHits(query, {
    proxy: fetchTenderHits,
    ted: searchTedNotices,
  });
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

/** Henter den offentlige fillisten hos Mercell. Filinnholdet åpnes på portalen. */
export async function fetchPortalCatalog(url) {
  const interestUrl = interestUrlFromDocs(url);
  try {
    const res = await fetch('/api/tender-proxy', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'catalog', url }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && Array.isArray(data.files)) {
      return { ...data, interestUrl: data.interestUrl || interestUrl };
    }
  } catch {
    // Katalogen ligger bak proxyen. Interessen kan likevel åpnes på portalen.
  }
  return {
    ok: false,
    files: [],
    interestUrl,
    gated: true,
    note: interestUrl
      ? 'Fillisten er ikke hentet ennå. Interessen og filene åpnes på portalen.'
      : 'Dokumentene åpnes på innloggingsportalen som er satt under Innstillinger.',
  };
}

export async function attachPortalCatalog(dossier) {
  if (!dossier || typeof dossier !== 'object') return dossier;
  const url = dossier.documentsUrl || dossier.documents?.[0]?.url || '';
  if (!url) return dossier;
  const catalog = await fetchPortalCatalog(url);
  return {
    ...dossier,
    interestUrl: catalog.interestUrl || dossier.interestUrl || '',
    portalFiles: catalog.files?.length ? catalog.files : (dossier.portalFiles || []),
    portalNote: catalog.note || '',
  };
}

/** Laster ned et offentlig konkurransedokument. Innloggede portalfiler blir stående som lenke. */
export async function downloadPublicFile(url) {
  const res = await fetch('/api/tender-proxy', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'download', url }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) return { ok: false, note: data.note || data.error || '' };
  return data;
}

/** Legger nedlastet innhold på fillisten når portalen gir ut filen uten innlogging. */
export async function storeReachableFiles(dossier) {
  if (!dossier || typeof dossier !== 'object') return dossier;
  const portalFiles = [];
  for (const file of (dossier.portalFiles || []).slice(0, 8)) {
    const url = String(file?.url || '');
    if (!/^https:\/\//i.test(url)) {
      portalFiles.push({ ...file, status: 'portal' });
      continue;
    }
    try {
      const got = await downloadPublicFile(url);
      if (got?.ok && got.base64 && got.size <= 480000) {
        const mimeType = got.mimeType || 'application/octet-stream';
        portalFiles.push({
          ...file,
          status: 'lastet',
          mimeType,
          size: got.size,
          dataUrl: `data:${mimeType};base64,${got.base64}`,
        });
        continue;
      }
    } catch {
      // Filen blir liggende med adressen, slik at den kan åpnes på portalen.
    }
    portalFiles.push({ ...file, status: 'portal' });
  }
  return { ...dossier, portalFiles };
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
