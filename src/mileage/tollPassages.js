/**
 * Bompasseringer langs en kjørt rute.
 * Stasjonene kommer fra Nasjonal vegdatabank (vegobjekttype 45, Bomstasjon).
 * En stasjon registreres når rutegeometrien passerer den.
 */

import { haversineKm } from './routePlan.js';
import { roundMoney } from '../economy/vat.js';
import { normalizeFeeClass, tariffIsExact, tollPriceForClass } from './vehicleFee.js';

const NVDB = 'https://nvdbapiles-v3.atlas.vegvesen.no/vegobjekter/45';
/** Portal står i kjørebanen. Bredere treff tar med parallell veg. */
export const TOLL_PASS_METERS = 40;
const DEDUPE_METERS = 30;

function text(value) {
  return String(value ?? '').trim();
}

function prop(station, name) {
  const row = (station?.egenskaper || []).find((item) => item?.navn === name);
  return row ? row.verdi : undefined;
}

/** NVDB med srid 4326 skriver breddegrad først i WKT. */
export function parseNvdbPoint(wkt) {
  if (!wkt || typeof wkt !== 'string') return null;
  const open = wkt.indexOf('(');
  const close = wkt.indexOf(')');
  if (open < 0 || close < 0) return null;
  const nums = wkt.slice(open + 1, close).trim().split(/\s+/).map(Number).filter(Number.isFinite);
  if (nums.length < 2) return null;
  const [a, b] = nums;
  if (Math.abs(a) > 45 && Math.abs(b) < 45) return { lat: a, lng: b };
  return { lat: b, lng: a };
}

export function normalizeTollStation(raw) {
  const point = parseNvdbPoint(raw?.geometri?.wkt);
  const name = text(prop(raw, 'Navn bomstasjon'));
  if (!point || !name) return null;
  const price = Number(prop(raw, 'Takst liten bil'));
  const priceElectric = Number(prop(raw, 'Takst liten elbil'));
  const priceHeavy = Number(prop(raw, 'Takst stor bil'));
  return {
    id: String(raw.id || name),
    name,
    lat: point.lat,
    lng: point.lng,
    price: Number.isFinite(price) && price >= 0 ? price : 0,
    priceElectric: Number.isFinite(priceElectric) && priceElectric >= 0 ? priceElectric : null,
    priceHeavy: Number.isFinite(priceHeavy) && priceHeavy >= 0 ? priceHeavy : null,
    direction: text(prop(raw, 'Innkrevningsretning')),
  };
}

export function routeBounds(points, pad = 0.012) {
  const lats = [];
  const lngs = [];
  for (const point of points || []) {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    lats.push(lat);
    lngs.push(lng);
  }
  if (!lats.length) return null;
  return {
    west: Math.min(...lngs) - pad,
    south: Math.min(...lats) - pad,
    east: Math.max(...lngs) + pad,
    north: Math.max(...lats) + pad,
  };
}

function nvdbHeaders() {
  const headers = { Accept: 'application/json' };
  // Nettleseren sender egen User-Agent. Node har navigator, men NVDB avviser den.
  if (typeof document === 'undefined') {
    headers['User-Agent'] = 'Mozilla/5.0 (compatible; ProTop/2.0; +https://protop.no)';
  }
  return headers;
}

export async function fetchTollStations(points, { fetchImpl = fetch } = {}) {
  const bounds = routeBounds(points);
  if (!bounds) return [];
  const box = [bounds.west, bounds.south, bounds.east, bounds.north].map((n) => n.toFixed(5)).join(',');
  let url = `${NVDB}?inkluder=egenskaper,geometri&srid=4326&kartutsnitt=${box}&antall=200`;
  const raw = [];
  for (let page = 0; page < 6 && url; page += 1) {
    const res = await fetchImpl(url, { headers: nvdbHeaders() });
    if (!res?.ok) {
      if (raw.length) break;
      throw new Error(`nvdb ${res?.status || 'feil'}`);
    }
    const data = await res.json();
    const batch = Array.isArray(data?.objekter) ? data.objekter : [];
    if (!batch.length) break;
    raw.push(...batch);
    const next = data?.metadata?.neste?.href;
    if (!next || next === url) break;
    url = next;
  }
  const stations = [];
  const seen = new Set();
  for (const row of raw) {
    const station = normalizeTollStation(row);
    if (!station || seen.has(station.id)) continue;
    seen.add(station.id);
    stations.push(station);
  }
  return stations;
}

function nearestOnRoute(points, spot) {
  let best = Infinity;
  let index = 0;
  for (let i = 0; i < points.length; i += 1) {
    const meters = haversineKm(points[i], spot) * 1000;
    if (meters < best) {
      best = meters;
      index = i;
    }
  }
  return { meters: best, index };
}

/**
 * Én rad per portal ruta faktisk kjører gjennom.
 * Tur/retur teller to passeringer. Taksten følger bilens gebyrgruppe.
 */
export function tollPassagesForRoute(points, stations, {
  roundTrip = true,
  maxMeters = TOLL_PASS_METERS,
  feeClass = 'lett',
} = {}) {
  const path = (points || []).filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
  if (path.length < 2) return [];
  const hits = [];
  for (const station of stations || []) {
    const near = nearestOnRoute(path, station);
    if (near.meters > maxMeters) continue;
    hits.push({ ...station, meters: near.meters, index: near.index });
  }
  hits.sort((a, b) => a.meters - b.meters);
  const kept = [];
  for (const hit of hits) {
    const duplicate = kept.some((row) => haversineKm(row, hit) * 1000 <= DEDUPE_METERS);
    if (!duplicate) kept.push(hit);
  }
  kept.sort((a, b) => a.index - b.index);
  const passes = roundTrip ? 2 : 1;
  const tariff = normalizeFeeClass(feeClass) || 'lett';
  return kept.map((station) => {
    const unitPrice = tollPriceForClass(station, tariff);
    return {
      id: `nvdb-${station.id}`,
      name: station.name,
      kind: 'toll',
      passes,
      unitPrice,
      amount: roundMoney(unitPrice * passes),
      source: 'nvdb',
      tariff,
      tariffExact: tariffIsExact(station, tariff),
    };
  });
}

export function ferryPassages(ferries, { roundTrip = true, feeClass = 'lett' } = {}) {
  const passes = roundTrip ? 2 : 1;
  const tariff = normalizeFeeClass(feeClass) || 'lett';
  const seen = new Set();
  const rows = [];
  for (const ferry of ferries || []) {
    const name = text(ferry?.name) || 'Ferje';
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const unitPrice = tollPriceForClass({
      price: ferry?.price,
      priceElectric: ferry?.priceElectric,
      priceHeavy: ferry?.priceHeavy,
      priceMotorcycle: ferry?.priceMotorcycle,
    }, tariff);
    rows.push({
      id: `ferry-${key.replace(/[^a-z0-9æøå]+/gi, '-').replace(/^-|-$/g, '') || rows.length}`,
      name,
      kind: 'ferry',
      passes,
      unitPrice,
      amount: roundMoney(unitPrice * passes),
      source: text(ferry?.source) || 'rute',
      tariff,
      tariffExact: tariffIsExact(ferry, tariff),
    });
  }
  return rows;
}
