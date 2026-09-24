/** Spørring mot Doffins webklient-søk. Samme fasettform som doffin.no bruker. */

function codesOf(values) {
  return [...new Set((values || [])
    .map((code) => String(code || '').replace(/\D/g, ''))
    .filter((code) => code.length >= 2 && code.length <= 8))];
}

function placesOf(values) {
  return [...new Set((values || [])
    .map((id) => String(id || '').trim())
    .filter((id) => /^(NO[0-9A-Z]{1,6}|anyw)$/.test(id)))];
}

export function buildDoffinBody({ cpvCodes, locationIds, page = 1, numHitsPerPage = 50 } = {}) {
  const codes = codesOf(cpvCodes);
  if (!codes.length) {
    const error = new Error('Minst én CPV-kode må følge med.');
    error.code = 'invalid-argument';
    throw error;
  }
  return {
    numHitsPerPage: Math.min(50, Math.max(1, Number(numHitsPerPage) || 50)),
    page: Math.max(1, Number(page) || 1),
    searchString: '',
    sortBy: 'PUBLICATION_DATE_DESC',
    facets: {
      cpvCodesLabel: { checkedItems: [] },
      cpvCodesId: { checkedItems: codes },
      type: { checkedItems: ['COMPETITION'] },
      status: { checkedItems: ['ACTIVE'] },
      contractNature: { checkedItems: [] },
      procurementStrategicLabels: { checkedItems: [] },
      publicationDate: { from: null, to: null },
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
