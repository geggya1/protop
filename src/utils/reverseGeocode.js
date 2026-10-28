/**
 * Adresse fra en posisjon (omvendt geokoding), for «Her» i kjøreboken, stedsvalg og været.
 * Bare tjenester i EØS eller Storbritannia (GRUNN-02): Kartverket (Geonorge) først, så
 * Photon (komoot, Tyskland) og OpenStreetMap/Nominatim. BigDataCloud (Australia) brukes ikke
 * lenger. Ren modul uten react-native, så den kan testes i node.
 */
import { KARTVERKET_ADRESSER_BASE, normalizeKartverketAdresse } from './boligmappaApis.js';

/** Vertene posisjonen kan sendes til. Står også i personvernerklæringen. */
export const REVERSE_GEOCODE_HOSTS = ['ws.geonorge.no', 'photon.komoot.io', 'nominatim.openstreetmap.org'];

/** Kartverket søker etter nærmeste adresse innenfor denne radiusen (meter). */
const KARTVERKET_RADIUS_M = 200;
const PROVIDER_TIMEOUT_MS = 5000;

function withTimeout(promise, ms, fallback = null) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export function coordsLabel(lat, lng) {
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

export function placeFromCoords(lat, lng, label, source = 'coords') {
  return {
    label: label || coordsLabel(lat, lng),
    lat: Number(lat),
    lng: Number(lng),
    placeId: '',
    source,
  };
}

/** Nærmeste adresse i Kartverkets adresseregister. Bare Norge; ellers ingen treff. */
export function kartverketPunktsokUrl(lat, lng, radius = KARTVERKET_RADIUS_M) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    radius: String(radius),
    treffPerSide: '1',
    utkoordsys: '4258',
  });
  return `${KARTVERKET_ADRESSER_BASE}/punktsok?${params}`;
}

async function reverseViaKartverket(lat, lng, { fetchImpl }) {
  const res = await fetchImpl(kartverketPunktsokUrl(lat, lng), { headers: { Accept: 'application/json' } });
  if (!res?.ok) return null;
  const json = await res.json();
  const hit = Array.isArray(json?.adresser) ? json.adresser[0] : null;
  if (!hit) return null;
  const adresse = normalizeKartverketAdresse(hit);
  if (!adresse.label) return null;
  return {
    ...placeFromCoords(lat, lng, adresse.label, 'kartverket'),
    adressetekst: adresse.adressetekst,
    postnummer: adresse.postnummer,
    poststed: adresse.poststed,
  };
}

async function reverseViaPhoton(lat, lng, { fetchImpl }) {
  // Photon støtter bare default/de/en/fr: engelske navn.
  const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&lang=en`;
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res?.ok) return null;
  const json = await res.json();
  const props = json?.features?.[0]?.properties;
  if (!props) return null;
  const street = [props.street, props.housenumber].filter(Boolean).join(' ');
  const parts = [street || props.name, props.locality || props.district, props.city, props.country]
    .filter(Boolean);
  const unique = [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))];
  if (!unique.length) return null;
  return placeFromCoords(lat, lng, unique.join(', '), 'photon');
}

async function reverseViaNominatim(lat, lng, { fetchImpl, nominatimHeaders }) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const res = await fetchImpl(url, { headers: nominatimHeaders || { Accept: 'application/json' } });
  if (!res?.ok) return null;
  const json = await res.json();
  if (!json?.display_name) return null;
  return placeFromCoords(lat, lng, json.display_name, 'osm');
}

/**
 * Omvendt geokoding. Alle tre tjenestene svarer med CORS i nettleseren (Nominatim ikke
 * alltid, derfor sist). Gir alltid et sted: koordinatene som tekst når ingen svarer.
 */
export async function reverseGeocodeWith(lat, lng, { fetchImpl = fetch, nominatimHeaders = null, timeoutMs = PROVIDER_TIMEOUT_MS } = {}) {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    throw new Error('invalid-coords');
  }
  const options = { fetchImpl, nominatimHeaders };
  const providers = [reverseViaKartverket, reverseViaPhoton, reverseViaNominatim];
  for (const run of providers) {
    try {
      const hit = await withTimeout(run(nLat, nLng, options), timeoutMs, null);
      if (hit?.label) return hit;
    } catch {
      // neste tjeneste
    }
  }
  return placeFromCoords(nLat, nLng, coordsLabel(nLat, nLng), 'coords');
}
