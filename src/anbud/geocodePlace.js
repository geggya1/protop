/** Stedsøk uten nøkkel. Kartverket først (gjeldende vert, geonorge som reserve), deretter Photon i Norge. */

const KARTVERKET_HOSTS = [
  'https://api.kartverket.no/stedsnavn/v1/navn',
  'https://ws.geonorge.no/stedsnavn/v1/navn',
];

const ADMIN_TYPES = new Set(['kommune', 'fylke', 'by', 'tettsted', 'tettbebyggelse']);

const STORE_PREFIX = 'anbud-geo:v2:';

const NOT_A_PLACE = /\b(statsbygg|sykehusinnkjøp|sykehusinnkjop|helseforetak|direktoratet|direktorat|departementet|departement)\b/i;
const TENDER_WORDS = /\b(rammeavtale|anskaffelse|konkurranse|rådgivning|radgivning|tjenester|tjenesten|kontrakt|innkjøp|innkjop|kunngjøring)\b/i;

const cache = new Map();

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function readStore(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORE_PREFIX}${key}`);
    if (!raw) return null;
    const row = JSON.parse(raw);
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    if (!inNorway(lat, lng)) return null;
    return { lat, lng, label: String(row.label || ''), precision: 'sted', source: row.source || 'photon' };
  } catch {
    return null;
  }
}

function writeStore(key, hit) {
  cache.set(key, hit);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${STORE_PREFIX}${key}`, JSON.stringify({
      lat: hit.lat,
      lng: hit.lng,
      label: hit.label,
      source: hit.source,
    }));
  } catch {
    // kvote
  }
}

function pointOf(row) {
  const punkt = row?.representasjonspunkt || row?.stedsnavn?.[0]?.representasjonspunkt;
  return {
    lat: Number(punkt?.nord ?? punkt?.lat),
    lng: Number(punkt?.øst ?? punkt?.ost ?? punkt?.lon ?? punkt?.lng),
  };
}

/** EUREF89 geografisk. UTM-tall og treff utenfor Norge skal ikke bli nåler. */
export function inNorway(lat, lng) {
  return lat >= 57 && lat <= 81 && lng >= -10 && lng <= 32;
}

function placeLabel(row) {
  if (row?.skrivemåte) return String(row.skrivemåte).trim();
  const names = Array.isArray(row?.stedsnavn) ? row.stedsnavn : [];
  const main = names.find((item) => item?.navnestatus === 'hovednavn') || names[0];
  return String(main?.skrivemåte || '').trim();
}

function placeType(row) {
  return fold(row?.navneobjekttype || '');
}

/** Org-navn og lange titler er ikke stedsnavn. */
export function looksLikePlaceQuery(query) {
  const q = String(query || '').replace(/\s+/g, ' ').trim();
  if (q.length < 3 || q.length > 48) return false;
  const words = q.split(' ');
  if (words.length > 4) return false;
  if (NOT_A_PLACE.test(q)) return false;
  const admin = /\b(kommune|fylke)\b/i.test(q);
  if (/\b(as|asa|hf|sa|nuf|ba|ans)\b/i.test(q) && !admin) return false;
  if (TENDER_WORDS.test(q) && !admin) return false;
  return true;
}

/**
 * Velg kommune, by eller tettsted med samme navn.
 * Prefiks-søk (Strand*) treffer fjord og øy først. De skal ikke vinne.
 */
export function pickStedsnavn(rows, query) {
  const wanted = fold(query);
  const bare = wanted.replace(/\bkommune\b/g, '').replace(/\s+/g, ' ').trim();
  const ranked = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const { lat, lng } = pointOf(row);
    if (!inNorway(lat, lng)) continue;
    const label = placeLabel(row);
    const name = fold(label);
    const type = placeType(row);
    if (!name) continue;
    const exact = name === wanted || name === bare || name === `${bare} kommune`;
    const kommunePrefix = type === 'kommune' && !!bare && name.startsWith(`${bare} `);
    if (!exact && !kommunePrefix) continue;
    let score = exact ? 100 : 80;
    if (type === 'kommune') score += 40;
    else if (ADMIN_TYPES.has(type)) score += 20;
    if (/(fjord|øy|oy|havområde|havomrade|verneområde|verneomrade|juv|fyr)/.test(type)) score -= 50;
    if (row?.navnestatus === 'hovednavn') score += 5;
    if (score < 90) continue;
    const knr = Number(row?.kommuner?.[0]?.kommunenummer);
    ranked.push({
      score,
      knr: Number.isFinite(knr) ? knr : 9999,
      lat,
      lng,
      label,
      precision: type === 'fylke' ? 'fylke' : 'sted',
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.knr - b.knr);
  const best = ranked[0];
  if (!best) return null;
  return {
    lat: best.lat,
    lng: best.lng,
    label: best.label,
    precision: best.precision,
    source: 'kartverket',
  };
}

function kartverketUrl(base, query, wildcard) {
  const params = new URLSearchParams({
    treffPerSide: '8',
    eksakteForst: 'true',
    utkoordsys: '4258',
    side: '1',
  });
  const sok = `${encodeURIComponent(query)}${wildcard ? '*' : ''}`;
  return `${base}?sok=${sok}&${params}`;
}

async function readKartverket(base, query, wildcard) {
  const res = await fetch(kartverketUrl(base, query, wildcard), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.navn) ? data.navn : [];
}

async function kartverket(query) {
  for (const base of KARTVERKET_HOSTS) {
    try {
      const exact = await readKartverket(base, query, false);
      const hit = pickStedsnavn(exact, query);
      if (hit) return hit;
      const wild = await readKartverket(base, query, true);
      const loose = pickStedsnavn(wild, query);
      if (loose) return loose;
    } catch {
      // Neste vert. Geonorge er fortsatt proxy for api.kartverket.no.
    }
  }
  return null;
}

async function photon(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en&lat=64.5&lon=12`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const features = Array.isArray(data?.features) ? data.features : [];
  for (const feature of features) {
    const coords = feature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const lat = Number(coords[1]);
    const lng = Number(coords[0]);
    if (!inNorway(lat, lng)) continue;
    const props = feature.properties || {};
    const country = fold(props.country);
    if (country && country !== 'norway' && country !== 'norge' && country !== 'no') continue;
    const label = [props.name, props.city, props.county].filter(Boolean).join(', ') || query;
    return { lat, lng, label, precision: 'sted', source: 'photon' };
  }
  return null;
}

export async function geocodePlaceName(query) {
  const q = String(query || '').trim();
  if (!looksLikePlaceQuery(q)) return null;
  const key = fold(q);
  if (cache.has(key)) return cache.get(key);
  const stored = readStore(key);
  if (stored) {
    cache.set(key, stored);
    return stored;
  }
  const admin = /\b(kommune|fylke)\b/i.test(q);
  try {
    const kv = await kartverket(q);
    if (kv) {
      writeStore(key, kv);
      return kv;
    }
  } catch {
    // Photon når Kartverket ikke svarer.
  }
  if (admin) {
    cache.set(key, null);
    return null;
  }
  try {
    const hit = await photon(q);
    if (hit) {
      writeStore(key, hit);
      return hit;
    }
  } catch {
    return null;
  }
  cache.set(key, null);
  return null;
}

export async function geocodeMissing(notices, locate, queryFor) {
  const out = [];
  const rows = (Array.isArray(notices) ? notices : []).filter((notice) => !locate(notice)).slice(0, 12);
  for (const notice of rows) {
    const query = queryFor(notice);
    if (!query) continue;
    const hit = await geocodePlaceName(query);
    if (!hit) continue;
    out.push({ id: notice.id, geo: hit });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return out;
}
