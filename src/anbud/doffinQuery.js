/** Spørring mot Doffins webklient-søk. Samme fasettform som doffin.no bruker. */

function codesOf(values) {
  return [...new Set((values || [])
    .map((code) => {
      const digits = String(code || '').replace(/\D/g, '');
      if (digits.length < 2) return '';
      return digits.slice(0, 8).padEnd(8, '0');
    })
    .filter(Boolean))];
}

function placesOf(values) {
  return [...new Set((values || [])
    .map((id) => String(id || '').trim())
    .filter((id) => /^(NO[0-9A-Z]{1,6}|anyw)$/.test(id)))];
}

function publishedFromOf(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

export function buildDoffinBody({
  cpvCodes, locationIds, page = 1, numHitsPerPage = 50, searchString = '', publishedFrom = '',
} = {}) {
  const codes = codesOf(cpvCodes);
  const query = String(searchString || '').trim().slice(0, 80);
  if (!codes.length && !query) {
    const error = new Error('Minst én CPV-kode eller et søkeord må følge med.');
    error.code = 'invalid-argument';
    throw error;
  }
  return {
    numHitsPerPage: Math.min(50, Math.max(1, Number(numHitsPerPage) || 50)),
    page: Math.max(1, Number(page) || 1),
    searchString: query,
    sortBy: 'PUBLICATION_DATE_DESC',
    facets: {
      cpvCodesLabel: { checkedItems: [] },
      cpvCodesId: { checkedItems: codes },
      type: { checkedItems: ['COMPETITION'] },
      status: { checkedItems: ['ACTIVE'] },
      contractNature: { checkedItems: [] },
      procurementStrategicLabels: { checkedItems: [] },
      publicationDate: { from: publishedFromOf(publishedFrom), to: null },
      location: { checkedItems: placesOf(locationIds) },
      buyer: { checkedItems: [] },
      winner: { checkedItems: [] },
    },
  };
}

export const DOFFIN_SEARCH_URL = 'https://api.doffin.no/webclient/api/v2/search-api/search';

export async function searchDoffinNotices(input) {
  const body = buildDoffinBody(input || {});
  const res = await fetch(DOFFIN_SEARCH_URL, {
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
  const data = await res.json();
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return {
    ok: true,
    numHitsTotal: Number(data?.numHitsTotal) || hits.length,
    hits,
    fetchedAt: new Date().toISOString(),
  };
}
