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

function typesOf(values) {
  const allowed = new Set(['COMPETITION', 'RESULT']);
  const rows = (Array.isArray(values) ? values : ['COMPETITION'])
    .map((row) => String(row || '').trim())
    .filter((row) => allowed.has(row));
  return rows.length ? [...new Set(rows)] : ['COMPETITION'];
}

export function buildDoffinBody({
  cpvCodes, locationIds, page = 1, numHitsPerPage = 50, searchString = '', publishedFrom = '', types,
} = {}) {
  const codes = codesOf(cpvCodes);
  const query = String(searchString || '').trim().slice(0, 80);
  const noticeTypes = typesOf(types);
  const activeOnly = noticeTypes.length === 1 && noticeTypes[0] === 'COMPETITION';
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
      type: { checkedItems: noticeTypes },
      status: { checkedItems: activeOnly ? ['ACTIVE'] : [] },
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

async function fetchDoffinPage(body) {
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
  return res.json();
}

/** Flere sider når søket har fra-dato, ellers faller treffene midt i perioden bort. */
export const DOFFIN_CATCH_UP_PAGES = 4;

export async function searchDoffinNotices(input) {
  const body = buildDoffinBody(input || {});
  const data = await fetchDoffinPage(body);
  const hits = Array.isArray(data?.hits) ? [...data.hits] : [];
  const total = Number(data?.numHitsTotal) || hits.length;
  const catchUp = !!body.facets.publicationDate.from && !input?.page;
  for (let page = 2; catchUp && page <= DOFFIN_CATCH_UP_PAGES && hits.length < total; page += 1) {
    const next = await fetchDoffinPage({ ...body, page });
    const rows = Array.isArray(next?.hits) ? next.hits : [];
    if (!rows.length) break;
    hits.push(...rows);
  }
  return {
    ok: true,
    numHitsTotal: total,
    hits,
    fetchedAt: new Date().toISOString(),
  };
}
