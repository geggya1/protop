/**
 * Kjørelengde tur. OSRM gir veiavstand. Faller rutetjenesten ut,
 * brukes luftlinje med en veifaktor slik at feltet likevel fylles.
 */

import { haversineKm, straightSamples } from './routePlan.js';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';

export async function planDrivingRoute(from, to, { fetchImpl = fetch } = {}) {
  const start = { lat: Number(from?.lat), lng: Number(from?.lng) };
  const end = { lat: Number(to?.lat), lng: Number(to?.lng) };
  if (![start.lat, start.lng, end.lat, end.lng].every(Number.isFinite)) return null;
  try {
    const url = `${OSRM}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson`;
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`osrm ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!route || !Array.isArray(coords) || !coords.length) throw new Error('empty');
    const points = coords.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
    const oneWayKm = Math.round((Number(route.distance) / 1000) * 10) / 10;
    return { oneWayKm, points, source: 'osrm' };
  } catch {
    const oneWayKm = Math.round(haversineKm(start, end) * 1.3 * 10) / 10;
    return {
      oneWayKm,
      points: straightSamples(start, end),
      source: 'estimate',
    };
  }
}
