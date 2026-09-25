/**
 * Slår opp bedrift i Enhetsregisteret og CPV-koder fra offentlige tildelinger på Doffin.
 */
import { cpvByCode } from './catalog.js';

const BRREG = 'https://data.brreg.no/enhetsregisteret/api';
const SEARCH = 'https://api.doffin.no/webclient/api/v2/search-api';
const NOTICES = 'https://api.doffin.no/webclient/api/v2/notices-api';

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\(hovedenhet\)/g, '')
    .replace(/\b(as|asa|da|sa|nuf|ans|ba|iks|sf|fkf|kf)\b/g, '')
    .replace(/[^a-z0-9æøå]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getJson(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: 'application/json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Registeret svarte ${res.status}`);
  return res.json();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Origin: 'https://www.doffin.no',
      Referer: 'https://www.doffin.no/',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Doffin svarte ${res.status}`);
  return res.json();
}

function emptyFacets(extra = {}) {
  return {
    cpvCodesLabel: { checkedItems: [] },
    cpvCodesId: { checkedItems: [] },
    type: { checkedItems: extra.type || [] },
    status: { checkedItems: [] },
    contractNature: { checkedItems: [] },
    procurementStrategicLabels: { checkedItems: [] },
    publicationDate: { from: null, to: null },
    location: { checkedItems: [] },
    buyer: { checkedItems: [] },
    winner: { checkedItems: extra.winner || [] },
  };
}

function fromEnhet(row, kind) {
  if (!row?.organisasjonsnummer || !row?.navn) return null;
  const address = row.forretningsadresse || row.postadresse || {};
  return {
    orgnr: String(row.organisasjonsnummer),
    name: String(row.navn),
    municipality: address.kommune || '',
    kind,
  };
}

export async function lookupBrreg(orgnr) {
  const id = digits(orgnr);
  if (id.length !== 9) {
    const error = new Error('Organisasjonsnummer må ha 9 siffer.');
    error.code = 'invalid-argument';
    throw error;
  }
  const enhet = await getJson(`${BRREG}/enheter/${id}`);
  if (enhet) return fromEnhet(enhet, 'enhet');
  const under = await getJson(`${BRREG}/underenheter/${id}`);
  if (under) return fromEnhet(under, 'underenhet');
  const error = new Error('Fant ikke organisasjonsnummeret i Enhetsregisteret.');
  error.code = 'not-found';
  throw error;
}

async function registeredNames(company) {
  const names = [company.name];
  if (company.kind !== 'enhet') return names;
  const data = await getJson(`${BRREG}/underenheter?overordnetEnhet=${company.orgnr}&size=100`);
  const rows = data?._embedded?.underenheter || [];
  for (const row of rows) {
    if (row?.navn) names.push(String(row.navn));
  }
  return names;
}

function matchingWinners(suggestions, names) {
  const folded = new Set(names.map(fold).filter(Boolean));
  return (suggestions?.winner?.items || []).filter((item) => folded.has(fold(item.value))).slice(0, 5);
}

let cpvLabels = null;

async function labelFor(code) {
  const known = cpvByCode(code);
  if (known) return known.label;
  if (!cpvLabels) {
    cpvLabels = new Map();
    const tree = await getJson(`${NOTICES}/codes/cpvCodes`);
    const walk = (nodes) => {
      for (const node of nodes || []) {
        if (node?.id) cpvLabels.set(String(node.id), node.label || '');
        walk(node.children);
      }
    };
    walk(tree);
  }
  return cpvLabels.get(code) || `CPV ${code}`;
}

export async function lookupCompanyCpv(orgnr) {
  const company = await lookupBrreg(orgnr);
  const names = await registeredNames(company);
  let suggestions = await postJson(`${SEARCH}/search/suggest`, {
    searchString: company.name,
    facets: emptyFacets(),
  });
  let winners = matchingWinners(suggestions, names);
  const token = company.name.split(/\s+/).find((part) => fold(part).length > 3);
  if (!winners.length && token && fold(token) !== fold(company.name)) {
    suggestions = await postJson(`${SEARCH}/search/suggest`, {
      searchString: token,
      facets: emptyFacets(),
    });
    winners = matchingWinners(suggestions, names);
  }
  const counts = new Map();
  if (winners.length) {
    const found = await postJson(`${SEARCH}/search`, {
      numHitsPerPage: 8,
      page: 1,
      searchString: '',
      sortBy: 'PUBLICATION_DATE_DESC',
      facets: emptyFacets({ type: ['RESULT'], winner: winners.map((item) => item.id) }),
    });
    const awarded = new Set(names.map(fold));
    for (const hit of (found.hits || []).slice(0, 6)) {
      const notice = await getJson(`${NOTICES}/notices/${hit.id}`);
      const namesOnNotice = (notice?.awardedNames || []).map(fold);
      if (!namesOnNotice.some((name) => awarded.has(name))) continue;
      for (const code of notice?.directCpvCodes || []) {
        const normalized = digits(code).padEnd(8, '0').slice(0, 8);
        if (normalized.length < 8) continue;
        counts.set(normalized, (counts.get(normalized) || 0) + 1);
      }
    }
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const cpvCodes = [];
  for (const [code] of ranked) {
    cpvCodes.push({ code, label: await labelFor(code), source: 'doffin' });
  }
  return {
    ok: true,
    company,
    winners: winners.map((item) => item.value),
    cpvCodes,
  };
}
