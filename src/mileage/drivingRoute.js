/**
 * Kjørelengde for én vei.
 * Google Routes brukes når nøkkelen svarer (lengde, geometri og bomestimat).
 * Ellers brukes OSRM. Faller begge ut, fylles feltet med luftlinje og veifaktor.
 */

import { haversineKm, straightSamples } from './routePlan.js';

const OSRM = 'https://router.project-osrm.org/route/v1/driving';
const ROUTES = 'https://routes.googleapis.com/directions/v2:computeRoutes';

export function decodePolyline(encoded) {
  const points = [];
  const text = String(encoded || '');
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < text.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = text.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < text.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0;
    shift = 0;
    do {
      byte = text.charCodeAt(index) - 63;
      index += 1;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < text.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/** Beløp i kroner. null når Google ikke venter bom. 0 når bom finnes uten pris. */
export function tollEstimateNok(tollInfo) {
  if (!tollInfo) return null;
  const prices = Array.isArray(tollInfo.estimatedPrice) ? tollInfo.estimatedPrice : [];
  if (!prices.length) return 0;
  const row = prices.find((item) => item?.currencyCode === 'NOK') || prices[0];
  const units = Number(row?.units || 0);
  const nanos = Number(row?.nanos || 0);
  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return 0;
  return Math.round((units + nanos / 1e9) * 100) / 100;
}

function ferryName(step) {
  const instruction = step?.navigationInstruction?.instructions
    || step?.html_instructions
    || step?.name
    || '';
  const plain = String(instruction).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return plain || 'Ferje';
}

function ferriesFromOsrm(route) {
  const rows = [];
  for (const leg of route?.legs || []) {
    for (const step of leg?.steps || []) {
      if (step?.mode !== 'ferry') continue;
      rows.push({ name: ferryName(step), source: 'osrm' });
    }
  }
  return rows;
}

function ferriesFromGoogle(route) {
  const rows = [];
  for (const leg of route?.legs || []) {
    for (const step of leg?.steps || []) {
      const mode = String(step?.travelMode || '');
      const name = ferryName(step);
      if (mode === 'FERRY' || /ferje|ferge|ferry/i.test(name)) {
        rows.push({ name, source: 'google' });
      }
    }
  }
  return rows;
}

async function planGoogleRoute(start, end, { apiKey, fetchImpl }) {
  const res = await fetchImpl(ROUTES, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'routes.distanceMeters,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo,routes.legs.steps.travelMode,routes.legs.steps.navigationInstruction',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: start.lat, longitude: start.lng } } },
      destination: { location: { latLng: { latitude: end.lat, longitude: end.lng } } },
      travelMode: 'DRIVE',
      extraComputations: ['TOLLS'],
      languageCode: 'no',
      regionCode: 'NO',
      units: 'METRIC',
      polylineQuality: 'HIGH_QUALITY',
      routeModifiers: { vehicleInfo: { emissionType: 'GASOLINE' } },
    }),
  });
  if (!res?.ok) return null;
  const data = await res.json();
  const route = data?.routes?.[0];
  const points = decodePolyline(route?.polyline?.encodedPolyline);
  const meters = Number(route?.distanceMeters);
  if (!route || !points.length || !Number.isFinite(meters)) return null;
  const tollInfo = route.travelAdvisory?.tollInfo
    || route.legs?.find((leg) => leg?.travelAdvisory?.tollInfo)?.travelAdvisory?.tollInfo
    || null;
  return {
    oneWayKm: Math.round((meters / 1000) * 10) / 10,
    points,
    source: 'google',
    ferries: ferriesFromGoogle(route),
    tollEstimate: tollEstimateNok(tollInfo),
  };
}

async function planOsrmRoute(start, end, { fetchImpl }) {
  const url = `${OSRM}/${start.lng},${start.lat};${end.lng},${end.lat}?overview=full&geometries=geojson&steps=true`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`osrm ${res.status}`);
  const data = await res.json();
  const route = data?.routes?.[0];
  const coords = route?.geometry?.coordinates;
  if (!route || !Array.isArray(coords) || !coords.length) throw new Error('empty');
  const points = coords.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
  const oneWayKm = Math.round((Number(route.distance) / 1000) * 10) / 10;
  return {
    oneWayKm,
    points,
    source: 'osrm',
    ferries: ferriesFromOsrm(route),
    tollEstimate: null,
  };
}

export async function planDrivingRoute(from, to, { fetchImpl = fetch, apiKey = '' } = {}) {
  const start = { lat: Number(from?.lat), lng: Number(from?.lng) };
  const end = { lat: Number(to?.lat), lng: Number(to?.lng) };
  if (![start.lat, start.lng, end.lat, end.lng].every(Number.isFinite)) return null;
  if (apiKey) {
    try {
      const google = await planGoogleRoute(start, end, { apiKey, fetchImpl });
      if (google?.oneWayKm) {
        if (!google.ferries.length) {
          try {
            const osrm = await planOsrmRoute(start, end, { fetchImpl });
            if (osrm?.ferries?.length) google.ferries = osrm.ferries;
          } catch {
            // Google-ruten beholdes uten ferjenavn.
          }
        }
        return google;
      }
    } catch {
      // OSRM under.
    }
  }
  try {
    return await planOsrmRoute(start, end, { fetchImpl });
  } catch {
    const oneWayKm = Math.round(haversineKm(start, end) * 1.3 * 10) / 10;
    return {
      oneWayKm,
      points: straightSamples(start, end),
      source: 'estimate',
      ferries: [],
      tollEstimate: null,
    };
  }
}
