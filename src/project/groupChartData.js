/**
 * Henter konserntreet fra åpne registre.
 * Enhetsregisteret og Aksjonærregisteret (åpent uttrekk) kan leses direkte.
 * Regnskapsregisteret går via samme proxy som resten av bedriftssiden
 * når nettleseren ikke får lov til å lese det selv.
 */
import { accountHistoryEndpoint } from './companyPublic.js';
import { digitsOrgnr } from './companyRegistry.js';

const BRREG = 'https://data.brreg.no/enhetsregisteret/api';
const ACCOUNTS = 'https://data.brreg.no/regnskapsregisteret/regnskap';
const OWNERS = 'https://aksjegrafen.com/api';

const cache = new Map();

export function clearGroupChartCache() {
  cache.clear();
}

function headers() {
  const base = { Accept: 'application/json' };
  if (typeof window === 'undefined') base['User-Agent'] = 'ProTop/2 (https://protop.no)';
  return base;
}

async function fetchJson(url, fetchImpl, signal) {
  const res = await fetchImpl(url, { headers: headers(), signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Registeret svarte ${res.status}`);
  return res.json();
}

async function attempt(run) {
  try {
    return { value: await run() };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { error: err?.message || 'Kunne ikke hente registeret.' };
  }
}

async function postJson(url, body, fetchImpl, signal) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`Registeret svarte ${res.status}`);
  return res.json();
}

async function fetchAccounts(orgnr, fetchImpl, signal) {
  const direct = () => fetchJson(`${ACCOUNTS}/${orgnr}`, fetchImpl, signal);
  if (typeof window === 'undefined') return direct();
  try {
    return await direct();
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }
  const body = { action: 'register', orgnr };
  try {
    const data = await postJson('/api/tender-proxy', body, fetchImpl, signal);
    if (data?.accounts) return data.accounts;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
  }
  const data = await postJson(accountHistoryEndpoint(), body, fetchImpl, signal);
  return data?.accounts || null;
}

function sharesOf(payload) {
  const row = Array.isArray(payload) ? payload[0] : payload;
  return row?.shares && typeof row.shares === 'object' ? row.shares : null;
}

export async function mapPool(items, limit, fn) {
  const list = Array.isArray(items) ? items : [];
  const out = new Array(list.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(limit, 1), list.length) }, async () => {
    while (cursor < list.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(list[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function loadGroupSources(orgnr, { fetchImpl = fetch, signal } = {}) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) {
    return {
      orgnr: id,
      entity: null,
      unitPayload: null,
      accountPayload: null,
      investmentRows: null,
      investorRows: null,
      sharesByYear: null,
      warnings: ['Organisasjonsnummer må ha 9 siffer.'],
    };
  }
  const key = `src:${id}`;
  if (cache.has(key)) return cache.get(key);
  const [entity, units, accounts, investments, investors, company] = await Promise.all([
    attempt(() => fetchJson(`${BRREG}/enheter/${id}`, fetchImpl, signal)),
    attempt(() => fetchJson(`${BRREG}/underenheter?overordnetEnhet=${id}&size=100`, fetchImpl, signal)),
    attempt(() => fetchAccounts(id, fetchImpl, signal)),
    attempt(() => fetchJson(`${OWNERS}/investments?shareholderOrgnr=${id}&limit=100`, fetchImpl, signal)),
    attempt(() => fetchJson(`${OWNERS}/investors?orgnr=${id}&limit=30`, fetchImpl, signal)),
    attempt(() => fetchJson(`${OWNERS}/company/${id}`, fetchImpl, signal)),
  ]);
  const warnings = [];
  if (entity.error) warnings.push('Enhetsregisteret kunne ikke hentes.');
  if (accounts.error) warnings.push('Årsregnskap kunne ikke hentes.');
  if (investments.error) warnings.push('Eierandeler fra Aksjonærregisteret kunne ikke hentes.');
  const data = {
    orgnr: id,
    entity: entity.value || null,
    unitPayload: units.value || null,
    accountPayload: accounts.value || null,
    investmentRows: investments.error ? null : (Array.isArray(investments.value) ? investments.value : []),
    investorRows: investors.error ? null : (Array.isArray(investors.value) ? investors.value : []),
    sharesByYear: sharesOf(company.value),
    warnings,
  };
  if (!signal?.aborted) cache.set(key, data);
  return data;
}

export async function loadEntityFigures(orgnr, { fetchImpl = fetch, signal } = {}) {
  const id = digitsOrgnr(orgnr);
  if (id.length !== 9) return null;
  const key = `ent:${id}`;
  if (cache.has(key)) return cache.get(key);
  const [entity, accountPayload] = await Promise.all([
    attempt(() => fetchJson(`${BRREG}/enheter/${id}`, fetchImpl, signal)),
    attempt(() => fetchAccounts(id, fetchImpl, signal)),
  ]);
  if (entity.error && accountPayload.error) return null;
  const data = {
    organisasjonsnummer: id,
    entity: entity.value || null,
    accountPayload: accountPayload.value || null,
  };
  if (!signal?.aborted) cache.set(key, data);
  return data;
}
