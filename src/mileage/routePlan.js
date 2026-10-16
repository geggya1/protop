/**
 * Forslag til bom og ferje langs en kjørerute.
 * Beløpene er veiledende satser som den ansatte kan endre før turen lagres.
 * Treff beregnes mot rutegeometrien (eller en rett linje når rutetjenesten mangler).
 */

import { roundMoney } from '../economy/vat.js';

/** Én passering, personbil. Oppdateres av driften ved å endre beløpet på turen. */
export const ROUTE_CHARGES = [
  {
    id: 'oslo-bomring',
    name: 'Oslo bomring',
    kind: 'toll',
    price: 37,
    radiusKm: 3.5,
    points: [
      { lat: 59.913, lng: 10.639 },
      { lat: 59.927, lng: 10.802 },
      { lat: 59.962, lng: 10.883 },
      { lat: 59.905, lng: 10.788 },
    ],
  },
  {
    id: 'bergen-bomring',
    name: 'Bergen bomring',
    kind: 'toll',
    price: 24,
    radiusKm: 3.5,
    points: [
      { lat: 60.391, lng: 5.328 },
      { lat: 60.368, lng: 5.355 },
    ],
  },
  {
    id: 'stavanger-bomring',
    name: 'Nord-Jæren bomring',
    kind: 'toll',
    price: 22,
    radiusKm: 4,
    points: [
      { lat: 58.970, lng: 5.733 },
      { lat: 58.893, lng: 5.735 },
    ],
  },
  {
    id: 'trondheim-bomring',
    name: 'Trondheim bomring',
    kind: 'toll',
    price: 20,
    radiusKm: 3.5,
    points: [
      { lat: 63.430, lng: 10.395 },
      { lat: 63.420, lng: 10.470 },
    ],
  },
  {
    id: 'bastosambandet',
    name: 'Ferje Horten–Moss',
    kind: 'ferry',
    price: 248,
    radiusKm: 6,
    from: { lat: 59.414, lng: 10.486 },
    to: { lat: 59.432, lng: 10.661 },
  },
  {
    id: 'halhjem-sandvikvag',
    name: 'Ferje Halhjem–Sandvikvåg',
    kind: 'ferry',
    price: 320,
    radiusKm: 8,
    from: { lat: 60.141, lng: 5.381 },
    to: { lat: 59.983, lng: 5.337 },
  },
  {
    id: 'mortavika-arsvagen',
    name: 'Ferje Mortavika–Arsvågen',
    kind: 'ferry',
    price: 280,
    radiusKm: 8,
    from: { lat: 59.094, lng: 5.584 },
    to: { lat: 59.176, lng: 5.435 },
  },
  {
    id: 'lavik-oppedal',
    name: 'Ferje Lavik–Oppedal',
    kind: 'ferry',
    price: 220,
    radiusKm: 8,
    from: { lat: 61.104, lng: 5.507 },
    to: { lat: 61.056, lng: 5.512 },
  },
];

export function haversineKm(a, b) {
  const lat1 = Number(a?.lat);
  const lng1 = Number(a?.lng);
  const lat2 = Number(b?.lat);
  const lng2 = Number(b?.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nearestKm(points, spot) {
  let best = Infinity;
  for (const point of points || []) {
    best = Math.min(best, haversineKm(point, spot));
  }
  return best;
}

function zoneHit(points, station) {
  const spots = station.points || [station.from, station.to].filter(Boolean);
  return spots.some((spot) => nearestKm(points, spot) <= station.radiusKm);
}

function ferryHit(points, station) {
  return nearestKm(points, station.from) <= station.radiusKm
    && nearestKm(points, station.to) <= station.radiusKm;
}

/**
 * Tur/retur teller to passeringer når ruten treffer stasjonen én vei.
 * Beløpet kan overstyres på den enkelte turen.
 */
export function chargesForRoute(points, { roundTrip = true, catalog = ROUTE_CHARGES } = {}) {
  const passes = roundTrip ? 2 : 1;
  const hits = [];
  for (const station of catalog || []) {
    const hit = station.kind === 'ferry' ? ferryHit(points, station) : zoneHit(points, station);
    if (!hit) continue;
    hits.push({
      id: station.id,
      name: station.name,
      kind: station.kind,
      passes,
      unitPrice: station.price,
      amount: roundMoney(station.price * passes),
      source: 'katalog',
    });
  }
  return hits;
}

export function straightSamples(from, to, steps = 32) {
  const points = [];
  const count = Math.max(1, steps);
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    points.push({
      lat: Number(from.lat) + (Number(to.lat) - Number(from.lat)) * t,
      lng: Number(from.lng) + (Number(to.lng) - Number(from.lng)) * t,
    });
  }
  return points;
}
