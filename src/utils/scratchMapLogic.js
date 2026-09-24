/**
 * Ren logikk for Skrapekart (uten Firebase).
 */
import { WORLD_COUNTRIES, COUNTRY_BY_CODE } from './worldCountries.js';
import { mapPlacesForCountry, findMapPlace, placeKeyOf } from './worldMapPaths.js';

export const PERIODS = [
  { id: 'spring', label: 'Vår' },
  { id: 'summer', label: 'Sommer' },
  { id: 'autumn', label: 'Høst' },
  { id: 'winter', label: 'Vinter' },
  { id: 'christmas', label: 'Jul / nyttår' },
  { id: 'easter', label: 'Påske' },
  { id: 'school', label: 'Skoleferie' },
  { id: 'year', label: 'Helår' },
  { id: 'other', label: 'Annet' },
];

export const PERIOD_BY_ID = Object.fromEntries(PERIODS.map((p) => [p.id, p]));

export function normalizePartId(partId) {
  if (partId == null || partId === '') return 0;
  const n = Number(partId);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function visitPlaceKey(visit) {
  if (!visit?.countryCode) return null;
  if (visit.placeKey) return String(visit.placeKey);
  return placeKeyOf(visit.countryCode, normalizePartId(visit.partId));
}

export function periodLabel(visit) {
  const base = PERIOD_BY_ID[visit?.period]?.label || 'Periode';
  const note = String(visit?.periodNote || '').trim();
  return note ? `${base} · ${note}` : base;
}

export function placeDisplayName(visitOrPlace) {
  if (!visitOrPlace) return '';
  if (visitOrPlace.label) return visitOrPlace.label;
  const key = visitOrPlace.placeKey || visitPlaceKey(visitOrPlace);
  const place = key ? findMapPlace(key) : null;
  if (place?.label) return place.label;
  const code = visitOrPlace.countryCode || place?.code;
  return COUNTRY_BY_CODE[code]?.name || code || '';
}

export function visitTitle(visit) {
  const placeName = placeDisplayName(visit);
  const country = COUNTRY_BY_CODE[visit?.countryCode];
  const name = placeName || country?.name || visit?.countryCode || 'Land';
  if (visit?.year == null || visit?.year === '') return name;
  return `${name} · ${visit.year}`;
}

export function visitYearLabel(visit) {
  if (visit?.year == null || visit?.year === '') return 'Ukjent år';
  return String(visit.year);
}

/** Aggregert oversikt: besøkte land/steder. */
export function buildScratchStats(visits, { memberId } = {}) {
  const filtered = memberId
    ? (visits || []).filter((v) => (v.memberIds || []).includes(memberId))
    : (visits || []);

  const byCountry = new Map();
  const byPlace = new Map();
  filtered.forEach((v) => {
    const code = v.countryCode;
    if (!code) return;
    if (!byCountry.has(code)) byCountry.set(code, []);
    byCountry.get(code).push(v);
    const key = visitPlaceKey(v);
    if (!key) return;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(v);
  });

  const visitedCodes = [...byCountry.keys()];
  const visitedPlaceKeys = new Set(byPlace.keys());
  const totalCountries = WORLD_COUNTRIES.length;
  const byRegion = {};
  WORLD_COUNTRIES.forEach((c) => {
    if (!byRegion[c.region]) byRegion[c.region] = { total: 0, visited: 0 };
    byRegion[c.region].total += 1;
    if (byCountry.has(c.code)) byRegion[c.region].visited += 1;
  });

  const years = filtered.map((v) => Number(v.year)).filter((y) => Number.isFinite(y));
  const memberCounts = new Map();
  filtered.forEach((v) => {
    (v.memberIds || []).forEach((id) => {
      memberCounts.set(id, (memberCounts.get(id) || 0) + 1);
    });
  });

  return {
    visitCount: filtered.length,
    visitedCount: visitedCodes.length,
    visitedPlaceCount: visitedPlaceKeys.size,
    totalCountries,
    percent: totalCountries
      ? Math.round((visitedCodes.length / totalCountries) * 100)
      : 0,
    visitedCodes: new Set(visitedCodes),
    visitedPlaceKeys,
    byCountry,
    byPlace,
    byRegion,
    yearMin: years.length ? Math.min(...years) : null,
    yearMax: years.length ? Math.max(...years) : null,
    memberCounts,
  };
}

export function emptyVisitForm(defaults = {}) {
  const year = new Date().getFullYear();
  const countryCode = defaults.countryCode || '';
  const hasPart = defaults.partId != null || defaults.placeKey;
  const partId = hasPart ? normalizePartId(
    defaults.partId != null
      ? defaults.partId
      : String(defaults.placeKey || '').split(':')[1],
  ) : null;
  const skipYear = defaults.skipYear === true || defaults.year == null;
  return {
    countryCode,
    partId,
    placeKey: defaults.placeKey
      || (countryCode && partId != null ? placeKeyOf(countryCode, partId) : ''),
    memberIds: defaults.memberIds || [],
    skipYear,
    year: skipYear ? '' : String(defaults.year ?? year),
    period: defaults.period || 'summer',
    periodNote: defaults.periodNote || '',
    comment: defaults.comment || '',
    imageUrl: defaults.imageUrl || null,
    imageLocalUri: null,
    _picked: null,
  };
}

export function normalizeMemberIds(ids) {
  return [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

export function assertValidVisitInput(data) {
  const code = String(data.countryCode || '').toUpperCase();
  if (!COUNTRY_BY_CODE[code]) throw new Error('Ukjent land.');
  const skipYear = data.skipYear === true
    || data.year == null
    || data.year === '';
  let year = null;
  if (!skipYear) {
    year = Number(data.year);
    if (!Number.isFinite(year) || year < 1900 || year > 2100) {
      throw new Error('Oppgi et gyldig år.');
    }
  }
  const period = String(data.period || 'summer');
  if (!PERIOD_BY_ID[period]) throw new Error('Ugyldig periode.');

  const places = mapPlacesForCountry(code);
  const hasExplicitPlace = !!(data.placeKey)
    || (data.partId != null && data.partId !== '');
  let partId = 0;
  if (data.placeKey) {
    partId = normalizePartId(String(data.placeKey).split(':')[1]);
  } else if (data.partId != null && data.partId !== '') {
    partId = normalizePartId(data.partId);
  }

  if (places.length > 1) {
    if (!hasExplicitPlace) throw new Error('Velg hvilket område du har besøkt.');
    const ok = places.some((p) => p.partId === partId);
    if (!ok) throw new Error('Velg hvilket område du har besøkt.');
  } else {
    partId = places[0]?.partId ?? 0;
  }

  return {
    code,
    year,
    period,
    partId,
    placeKey: placeKeyOf(code, partId),
  };
}

export { mapPlacesForCountry, findMapPlace, placeKeyOf };
