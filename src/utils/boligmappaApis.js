/**
 * Åpne norske API-er brukt av Boligen (adresse og firmaoppslag).
 *
 * Kilder (ingen API-nøkkel kreves):
 * - Kartverket Adresse REST: https://ws.geonorge.no/adresser/v1
 * - Kartverket Eiendom REST: https://ws.geonorge.no/eiendom/v1
 * - Brønnøysundregistrene Enhetsregisteret: https://data.brreg.no/enhetsregisteret/api
 *
 * Boligmappa AS sitt kommersielle API krever avtale/nøkler og er ikke brukt her.
 */

export const KARTVERKET_ADRESSER_BASE = 'https://ws.geonorge.no/adresser/v1';
export const KARTVERKET_EIENDOM_BASE = 'https://ws.geonorge.no/eiendom/v1';
export const BRREG_ENHETER_BASE = 'https://data.brreg.no/enhetsregisteret/api';

const DEFAULT_HEADERS = {
  Accept: 'application/json',
};

function asInt(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Formatér matrikkelnummer som «gnr/bnr», «gnr/bnr/fnr» eller «gnr/bnr/fnr/snr». */
export function formatMatrikkelnummer({
  gardsnummer,
  bruksnummer,
  festenummer = 0,
  seksjonsnummer = 0,
} = {}) {
  const gnr = asInt(gardsnummer);
  const bnr = asInt(bruksnummer);
  if (gnr == null || bnr == null) return '';
  const fnr = asInt(festenummer, 0) || 0;
  const snr = asInt(seksjonsnummer, 0) || 0;
  if (snr) return `${gnr}/${bnr}/${fnr}/${snr}`;
  if (fnr) return `${gnr}/${bnr}/${fnr}`;
  return `${gnr}/${bnr}`;
}

export function normalizeOrgnummer(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 9 ? digits : '';
}

export function formatOrgnummer(value) {
  const digits = normalizeOrgnummer(value);
  if (!digits) return asText(value);
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/** Stabil nøkkel for adresse-treff (React keys / dedupe). */
export function kartverketAdresseId(raw = {}) {
  const parts = [
    asText(raw.kommunenummer),
    asInt(raw.gardsnummer),
    asInt(raw.bruksnummer),
    asInt(raw.festenummer, 0) || 0,
    asInt(raw.seksjonsnummer, 0) || 0,
    asText(raw.adressetekst) || asText(raw.adressenavn),
    asInt(raw.nummer),
    asText(raw.bokstav).toUpperCase(),
  ];
  return parts.map((p) => (p == null ? '' : String(p))).join('|');
}

/**
 * Del opp fri tekst i gate / husnummer / bokstav / postnr / sted.
 * Eksempel: «Karl Johans gate 1B, 0154 Oslo»
 * → { adressenavn, nummer: 1, bokstav: 'B', postnummer: '0154', sted: 'Oslo' }
 */
export function parseNorwegianAddressQuery(query) {
  let rest = asText(query).replace(/\s+/g, ' ');
  if (!rest) {
    return {
      adressenavn: '',
      nummer: null,
      bokstav: '',
      postnummer: '',
      sted: '',
      sok: '',
    };
  }

  let postnummer = '';
  const postMatch = rest.match(/\b(\d{4})\b/);
  if (postMatch) {
    postnummer = postMatch[1];
    rest = `${rest.slice(0, postMatch.index)} ${rest.slice(postMatch.index + postMatch[0].length)}`
      .replace(/[,\s]+/g, ' ')
      .trim();
  }

  // Gate + husnr + valgfri bokstav bakerst, deretter eventuelt sted.
  // «Karl Johans gate 1B Oslo» / «Storgata 15» / «Slottsplassen 1»
  const streetNum = rest.match(
    /^(.+?)\s+(\d{1,4})([A-Za-zÆØÅæøå]?)\s*(?:,?\s*(.+))?$/u,
  );
  if (streetNum) {
    const adressenavn = asText(streetNum[1]).replace(/[,\s]+$/g, '');
    const nummer = asInt(streetNum[2]);
    const bokstav = asText(streetNum[3]).toUpperCase();
    const sted = asText(streetNum[4]);
    return {
      adressenavn,
      nummer,
      bokstav,
      postnummer,
      sted,
      sok: asText(query),
    };
  }

  return {
    adressenavn: rest,
    nummer: null,
    bokstav: '',
    postnummer,
    sted: '',
    sok: asText(query),
  };
}

function normPlace(value) {
  return asText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Rangér Kartverket-treff etter hvor godt de matcher søket. */
export function rankKartverketAdresse(hit, parsed) {
  if (!hit) return -1;
  let score = 0;
  const qStreet = normPlace(parsed?.adressenavn);
  const hitStreet = normPlace(hit.adressenavn || hit.adressetekst);
  const qPlace = normPlace(parsed?.sted);
  const qPost = asText(parsed?.postnummer);

  if (qStreet && hitStreet === qStreet) score += 40;
  else if (qStreet && hitStreet.startsWith(qStreet)) score += 28;
  else if (qStreet && hitStreet.includes(qStreet)) score += 16;

  if (parsed?.nummer != null && hit.nummer === parsed.nummer) score += 30;
  else if (parsed?.nummer != null && hit.nummer != null) score -= 8;

  if (parsed?.bokstav) {
    if (normPlace(hit.bokstav) === normPlace(parsed.bokstav)) score += 12;
    else score -= 4;
  } else if (!hit.bokstav) {
    score += 2;
  }

  if (qPost && hit.postnummer === qPost) score += 35;
  if (qPlace) {
    const poststed = normPlace(hit.poststed);
    const kommune = normPlace(hit.matrikkel?.kommunenavn);
    if (poststed === qPlace || kommune === qPlace) score += 30;
    else if (poststed.startsWith(qPlace) || kommune.startsWith(qPlace)) score += 18;
    else if (poststed.includes(qPlace) || kommune.includes(qPlace)) score += 8;
  }

  // Større kommuner litt høyere når sted ikke er oppgitt (Oslo/Bergen/Trondheim).
  if (!qPlace && !qPost) {
    const knr = asText(hit.matrikkel?.kommunenummer);
    if (knr === '0301' || knr === '4601' || knr === '5001') score += 3;
  }

  return score;
}

/** Kartverket adresse → stabilt boligobjekt for UI / lagring. */
export function normalizeKartverketAdresse(raw = {}) {
  const lat = Number(raw?.representasjonspunkt?.lat);
  const lon = Number(raw?.representasjonspunkt?.lon);
  const matrikkel = {
    kommunenummer: asText(raw.kommunenummer),
    kommunenavn: asText(raw.kommunenavn),
    gardsnummer: asInt(raw.gardsnummer),
    bruksnummer: asInt(raw.bruksnummer),
    festenummer: asInt(raw.festenummer, 0) || 0,
    seksjonsnummer: asInt(raw.seksjonsnummer, 0) || 0,
  };
  const adressetekst = asText(raw.adressetekst) || asText(raw.adressetekstutenadressetilleggsnavn);
  const postnummer = asText(raw.postnummer);
  const poststed = asText(raw.poststed);
  const labelParts = [adressetekst];
  if (postnummer || poststed) labelParts.push([postnummer, poststed].filter(Boolean).join(' '));
  return {
    id: kartverketAdresseId(raw),
    source: 'kartverket.adresser',
    adressetekst,
    adressenavn: asText(raw.adressenavn),
    nummer: asInt(raw.nummer),
    bokstav: asText(raw.bokstav),
    postnummer,
    poststed,
    label: labelParts.filter(Boolean).join(', '),
    objtype: asText(raw.objtype),
    bruksenhetsnummer: Array.isArray(raw.bruksenhetsnummer)
      ? raw.bruksenhetsnummer.map(asText).filter(Boolean)
      : [],
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    matrikkel,
    matrikkelnummertekst: formatMatrikkelnummer(matrikkel),
    oppdateringsdato: asText(raw.oppdateringsdato) || null,
    raw,
  };
}

export function normalizeKartverketEiendom(raw = {}) {
  const nord = Number(raw?.representasjonspunkt?.nord);
  const ost = Number(raw?.representasjonspunkt?.øst ?? raw?.representasjonspunkt?.ost);
  const matrikkel = {
    kommunenummer: asText(raw.kommunenummer),
    gardsnummer: asInt(raw.gardsnummer),
    bruksnummer: asInt(raw.bruksnummer),
    festenummer: asInt(raw.festenummer, 0) || 0,
    seksjonsnummer: asInt(raw.seksjonsnummer, 0) || 0,
  };
  return {
    source: 'kartverket.eiendom',
    lokalid: raw.lokalid ?? null,
    matrikkelnummertekst: asText(raw.matrikkelnummertekst) || formatMatrikkelnummer(matrikkel),
    matrikkel,
    meterFraPunkt: asInt(raw.meterFraPunkt),
    noyaktighetsklasse: asText(raw.nøyaktighetsklasseteig || raw.noyaktighetsklasseteig),
    objekttype: asText(raw.objekttype),
    hovedomrade: raw.hovedområde === true || raw.hovedomrade === true,
    lat: Number.isFinite(nord) ? nord : null,
    lon: Number.isFinite(ost) ? ost : null,
    oppdateringsdato: asText(raw.oppdateringsdato) || null,
    raw,
  };
}

export function normalizeBrregEnhet(raw = {}) {
  const orgnr = normalizeOrgnummer(raw.organisasjonsnummer);
  const addr = raw.forretningsadresse || raw.postadresse || {};
  const street = Array.isArray(addr.adresse) ? addr.adresse.filter(Boolean).join(', ') : asText(addr.adresse);
  const addressLabel = [street, [asText(addr.postnummer), asText(addr.poststed)].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return {
    source: 'brreg.enhetsregisteret',
    organisasjonsnummer: orgnr,
    organisasjonsnummerFormatted: formatOrgnummer(orgnr),
    navn: asText(raw.navn),
    organisasjonsform: asText(raw.organisasjonsform?.beskrivelse || raw.organisasjonsform?.kode),
    naeringskode: asText(raw.naeringskode1?.kode),
    naeringsbeskrivelse: asText(raw.naeringskode1?.beskrivelse),
    hjemmeside: asText(raw.hjemmeside),
    epostadresse: asText(raw.epostadresse),
    addressLabel,
    konkurs: raw.konkurs === true,
    underAvvikling: raw.underAvvikling === true,
    registrertIForetaksregisteret: raw.registrertIForetaksregisteret === true,
    raw,
  };
}

async function fetchJson(url, { signal } = {}) {
  const res = await fetch(url, { headers: DEFAULT_HEADERS, signal });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchKartverketAdresseSok(params, { signal } = {}) {
  const data = await fetchJson(`${KARTVERKET_ADRESSER_BASE}/sok?${params}`, { signal });
  const list = Array.isArray(data?.adresser) ? data.adresser : [];
  return {
    results: list.map(normalizeKartverketAdresse),
    total: asInt(data?.metadata?.totaltAntallTreff, list.length) || list.length,
  };
}

function buildAdresseSokParams({
  sok,
  adressenavn,
  nummer,
  bokstav,
  postnummer,
  kommunenavn,
  poststed,
  treffPerSide,
  fuzzy,
}) {
  const params = new URLSearchParams({
    treffPerSide: String(Math.min(Math.max(treffPerSide, 1), 50)),
    side: '0',
  });
  if (sok) params.set('sok', sok);
  if (adressenavn) params.set('adressenavn', adressenavn);
  if (nummer != null) params.set('nummer', String(nummer));
  if (bokstav) params.set('bokstav', bokstav);
  if (postnummer) params.set('postnummer', postnummer);
  if (kommunenavn) params.set('kommunenavn', kommunenavn);
  if (poststed) params.set('poststed', poststed);
  if (fuzzy) params.set('fuzzy', 'true');
  return params;
}

function dedupeAndRankAdresseResults(results, parsed) {
  const byId = new Map();
  for (const hit of results) {
    const key = hit.id || hit.label;
    if (!byId.has(key)) byId.set(key, hit);
  }
  return [...byId.values()].sort((a, b) => {
    const diff = rankKartverketAdresse(b, parsed) - rankKartverketAdresse(a, parsed);
    if (diff) return diff;
    return String(a.label || '').localeCompare(String(b.label || ''), 'nb');
  });
}

/**
 * Søk offisielle adresser i matrikkelen (Kartverket).
 * Parser gate/husnr/sted, prøver strukturert søk først, deretter eksakt fri-tekst,
 * og fuzzy bare som siste utvei — så «Karl Johans gate 1 Oslo» treffer Oslo, ikke
 * tilfeldige fuzzy-varianter.
 * @returns {Promise<{ results: object[], total: number, parsed: object }>}
 */
export async function searchKartverketAdresser(query, {
  treffPerSide = 8,
  fuzzy = 'auto',
  signal,
} = {}) {
  const q = asText(query);
  if (q.length < 2) return { results: [], total: 0, parsed: parseNorwegianAddressQuery(q) };
  const parsed = parseNorwegianAddressQuery(q);
  const limit = Math.min(Math.max(treffPerSide, 1), 50);
  const collected = [];

  const tryFetch = async (opts) => {
    const { results } = await fetchKartverketAdresseSok(
      buildAdresseSokParams({ ...opts, treffPerSide: limit }),
      { signal },
    );
    if (results.length) collected.push(...results);
    return results.length;
  };

  const hasStructured = Boolean(parsed.adressenavn && parsed.nummer != null);
  const place = parsed.sted || '';

  // 1) Strukturert: gate + husnr (+ postnr/kommune) — mest presist.
  if (hasStructured) {
    const structuredBase = {
      adressenavn: parsed.adressenavn,
      nummer: parsed.nummer,
      bokstav: parsed.bokstav || undefined,
      fuzzy: false,
    };
    if (parsed.postnummer) {
      await tryFetch({ ...structuredBase, postnummer: parsed.postnummer });
    }
    if (!collected.length && place) {
      await tryFetch({ ...structuredBase, kommunenavn: place });
      if (!collected.length) await tryFetch({ ...structuredBase, poststed: place });
    }
    if (!collected.length) {
      await tryFetch(structuredBase);
    }
  }

  // 2) Fri-tekst uten fuzzy (god når bruker skriver «gate nr sted»).
  if (!collected.length) {
    await tryFetch({ sok: q, fuzzy: false });
  }

  // 3) Fuzzy bare når eksplisitt bedt om, eller auto og fortsatt tomt.
  const allowFuzzy = fuzzy === true || (fuzzy === 'auto' && !collected.length);
  if (allowFuzzy && !collected.length) {
    await tryFetch({ sok: q, fuzzy: true });
  }

  // 4) Hvis strukturert ga treff men uten sted-filter, og brukeren oppga sted:
  //    behold alle, men rangér så riktig kommune kommer først.
  const ranked = dedupeAndRankAdresseResults(collected, parsed);
  return {
    results: ranked.slice(0, limit),
    total: ranked.length,
    parsed,
  };
}

/**
 * Finn eiendommer nær et punkt (Kartverket Eiendom).
 * koordsys 4258 = ETRS89 geografisk (lat/lon).
 */
export async function searchKartverketEiendomByPunkt({
  lat,
  lon,
  radius = 40,
  treffPerSide = 8,
  signal,
} = {}) {
  const nord = Number(lat);
  const ost = Number(lon);
  if (!Number.isFinite(nord) || !Number.isFinite(ost)) {
    return { results: [], total: 0 };
  }
  const params = new URLSearchParams({
    nord: String(nord),
    ost: String(ost),
    koordsys: '4258',
    radius: String(Math.min(Math.max(asInt(radius, 40) || 40, 1), 3000)),
    treffPerSide: String(Math.min(Math.max(treffPerSide, 1), 50)),
    side: '1',
  });
  const data = await fetchJson(`${KARTVERKET_EIENDOM_BASE}/punkt?${params}`, { signal });
  const list = Array.isArray(data?.eiendom) ? data.eiendom : [];
  return {
    results: list.map(normalizeKartverketEiendom),
    total: asInt(data?.metadata?.totaltAntallTreff, list.length) || list.length,
  };
}

/** Geokoding av matrikkelnummer → punkt. */
export async function geocodeKartverketMatrikkel({
  kommunenummer,
  gardsnummer,
  bruksnummer,
  festenummer,
  seksjonsnummer,
  signal,
} = {}) {
  const params = new URLSearchParams();
  if (kommunenummer) params.set('kommunenummer', String(kommunenummer).padStart(4, '0'));
  if (gardsnummer != null) params.set('gardsnummer', String(gardsnummer));
  if (bruksnummer != null) params.set('bruksnummer', String(bruksnummer));
  if (festenummer) params.set('festenummer', String(festenummer));
  if (seksjonsnummer) params.set('seksjonsnummer', String(seksjonsnummer));
  if (![...params.keys()].length) return null;
  const data = await fetchJson(`${KARTVERKET_EIENDOM_BASE}/geokoding?${params}`, { signal });
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature) return null;
  const [lon, lat] = feature.geometry?.coordinates || [];
  return {
    ...normalizeKartverketEiendom({
      ...feature.properties,
      representasjonspunkt: {
        nord: lat,
        øst: lon,
        koordsys: 4258,
      },
    }),
    geojson: feature,
  };
}

/** Søk virksomheter i Enhetsregisteret (Brønnøysund). */
export async function searchBrregEnheter(query, { size = 8, signal } = {}) {
  const q = asText(query);
  if (q.length < 2) return { results: [], total: 0 };
  const orgnr = normalizeOrgnummer(q);
  const params = new URLSearchParams({ size: String(Math.min(Math.max(size, 1), 20)) });
  if (orgnr) params.set('organisasjonsnummer', orgnr);
  else params.set('navn', q);
  const data = await fetchJson(`${BRREG_ENHETER_BASE}/enheter?${params}`, { signal });
  const list = Array.isArray(data?._embedded?.enheter) ? data._embedded.enheter : [];
  return {
    results: list.map(normalizeBrregEnhet),
    total: asInt(data?.page?.totalElements, list.length) || list.length,
  };
}

export async function fetchBrregEnhet(orgnummer, { signal } = {}) {
  const orgnr = normalizeOrgnummer(orgnummer);
  if (!orgnr) return null;
  const data = await fetchJson(`${BRREG_ENHETER_BASE}/enheter/${orgnr}`, { signal });
  return normalizeBrregEnhet(data);
}

/** Offentlig innsynslenke for matrikkel (Seeiendom). */
export function buildSeeiendomUrl({ kommunenummer, gardsnummer, bruksnummer, festenummer = 0 } = {}) {
  const knr = asText(kommunenummer).padStart(4, '0');
  const gnr = asInt(gardsnummer);
  const bnr = asInt(bruksnummer);
  if (!knr || gnr == null || bnr == null) return null;
  const fnr = asInt(festenummer, 0) || 0;
  return `https://seeiendom.kartverket.no/?kommunenr=${encodeURIComponent(knr)}&gardsnr=${gnr}&bruksnr=${bnr}&festenr=${fnr}`;
}

/** Kartlenke (OpenStreetMap) for representasjonspunkt. */
export function buildOsmMapUrl(lat, lon, zoom = 18) {
  const n = Number(lat);
  const e = Number(lon);
  if (!Number.isFinite(n) || !Number.isFinite(e)) return null;
  return `https://www.openstreetmap.org/?mlat=${n}&mlon=${e}#map=${zoom}/${n}/${e}`;
}

/** Brønnøysund detailside. */
export function buildBrregUrl(orgnummer) {
  const orgnr = normalizeOrgnummer(orgnummer);
  if (!orgnr) return null;
  return `https://virksomhet.brreg.no/nb/oppslag/enhet/${orgnr}`;
}

/** Kort oppsummeringslinje for lagret bolig. */
export function boligSummaryLine(bolig) {
  const parts = [];
  if (bolig?.adressetekst) parts.push(bolig.adressetekst);
  else if (bolig?.title) parts.push(bolig.title);
  if (bolig?.matrikkelnummertekst) {
    const knr = bolig?.matrikkel?.kommunenummer;
    parts.push(knr ? `matrikkel ${knr}/${bolig.matrikkelnummertekst}` : `matrikkel ${bolig.matrikkelnummertekst}`);
  }
  return parts.join(' · ');
}

export const BOLIG_DOC_KINDS = [
  { id: 'quote', label: 'Tilbud', emoji: '💬' },
  { id: 'invoice', label: 'Faktura', emoji: '💶' },
  { id: 'receipt', label: 'Bilag', emoji: '🧾' },
  { id: 'manual', label: 'Bruksanvisning', emoji: '📘' },
  { id: 'warranty', label: 'Garanti', emoji: '🛡️' },
  { id: 'service', label: 'Service', emoji: '🔧' },
  { id: 'insurance', label: 'Forsikring', emoji: '📄' },
  { id: 'permit', label: 'Tillatelse', emoji: '🏛️' },
  { id: 'other', label: 'Annet', emoji: '📎' },
];

export const CONTRACTOR_SERVICES = [
  'Rørlegger', 'Elektriker', 'Tak', 'Maler', 'Snekker',
  'Varmepumpe', 'Ventilasjon', 'Renhold', 'Hage', 'Annet',
];
