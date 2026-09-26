/** Søk i TED (EU-kunngjøringer). Offentlig søke-API, uten nøkkel. */

const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

const TED_FIELDS = [
  'publication-number',
  'notice-title',
  'buyer-name',
  'publication-date',
  'deadline-receipt-tender-date-lot',
  'classification-cpv',
  'notice-type',
  'description-proc',
  'place-of-performance-country-lot',
];

function codesOf(values) {
  return [...new Set((values || [])
    .map((code) => {
      const digits = String(code || '').replace(/\D/g, '');
      if (digits.length < 2) return '';
      return digits.slice(0, 8).padEnd(8, '0');
    })
    .filter(Boolean))];
}

function langText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return langText(value[0]);
  if (typeof value === 'object') {
    return langText(value.nor || value.nob || value.eng || value.deu || Object.values(value)[0]);
  }
  return '';
}

function sinceDays(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

function keywordTerms(values) {
  const rows = Array.isArray(values) ? values : String(values || '').split(/[,;\n]/);
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const value = String(row || '').trim().replace(/\s+/g, ' ').replace(/["\\]/g, '');
    const key = value.toLocaleLowerCase('nb-NO');
    if (key.length < 2 || value.length > 60 || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= 8) break;
  }
  return out;
}

function publishedFromTed(value) {
  const raw = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.replace(/-/g, '') : sinceDays(120);
}

export function buildTedQuery({ cpvCodes, locationIds, keywords, publishedFrom } = {}) {
  const codes = codesOf(cpvCodes);
  const words = keywordTerms(keywords);
  if (!codes.length && !words.length) {
    const error = new Error('Minst én CPV-kode eller et søkeord må følge med.');
    error.code = 'invalid-argument';
    throw error;
  }
  const cpv = codes.length ? `(${codes.map((code) => `classification-cpv=${code}`).join(' OR ')})` : '';
  const text = words.length ? `(${words.map((word) => `FT~"${word}"`).join(' OR ')})` : '';
  const subject = [cpv, text].filter(Boolean).join(' OR ');
  const places = (locationIds || []).map((id) => String(id || '').trim()).filter((id) => /^NO[0-9A-Z]{1,6}$/.test(id));
  const where = places.length
    ? `(${places.map((id) => `place-of-performance=${id}`).join(' OR ')})`
    : 'buyer-country=NOR';
  return `(${subject}) AND ${where} AND publication-date>=${publishedFromTed(publishedFrom)}`;
}

export function tedHitToNotice(row) {
  const id = String(row?.['publication-number'] || '').trim();
  if (!id) return null;
  const cpvCodes = (Array.isArray(row['classification-cpv']) ? row['classification-cpv'] : [])
    .map((code) => String(code || '').replace(/\D/g, ''))
    .filter(Boolean);
  return {
    id: `ted-${id}`,
    heading: langText(row['notice-title']) || 'TED-kunngjøring',
    buyer: [{ name: langText(row['buyer-name']) }],
    description: langText(row['description-proc']),
    placeOfPerformance: [langText(row['place-of-performance-country-lot']) || 'Norge'].filter(Boolean),
    publicationDate: String(row['publication-date'] || '').slice(0, 10),
    deadline: String(row['deadline-receipt-tender-date-lot'] || '').slice(0, 10),
    status: 'ACTIVE',
    source: 'ted',
    noticeType: langText(row['notice-type']) || 'TED',
    cpvCodes,
    url: `https://ted.europa.eu/no/notice/-/detail/${id}`,
  };
}

export async function searchTedNotices(input) {
  const query = buildTedQuery(input || {});
  const res = await fetch(TED_SEARCH_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(20000),
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      fields: TED_FIELDS,
      limit: Math.min(25, Math.max(1, Number(input?.numHitsPerPage) || 25)),
      page: 1,
      scope: 'ACTIVE',
      paginationMode: 'PAGE_NUMBER',
    }),
  });
  if (!res.ok) throw new Error(`TED svarte ${res.status}`);
  const data = await res.json();
  const notices = Array.isArray(data?.notices) ? data.notices : [];
  const words = keywordTerms(input?.keywords);
  const hits = notices.map(tedHitToNotice).filter(Boolean).map((hit) => (
    words.length ? { ...hit, matchedKeywords: words } : hit
  ));
  return {
    ok: true,
    numHitsTotal: Number(data?.totalNoticeCount) || hits.length,
    hits,
    fetchedAt: new Date().toISOString(),
  };
}
