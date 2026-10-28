import { Platform, Linking } from 'react-native';
import { mapsEmbed, mapsUrl } from './locationMaps';
import {
  searchKartverketAdresser,
  parseNorwegianAddressQuery,
} from './boligmappaApis';
import { reverseGeocodeWith } from './reverseGeocode';

export { mapsEmbed, mapsUrl };

const PLACE_SEARCH_TIMEOUT_MS = 2800;

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function nominatimHeaders(lang = 'nb') {
  const headers = {
    Accept: 'application/json',
    'Accept-Language': lang || 'nb',
  };
  // Do not set User-Agent in the browser — it is a forbidden header and can break fetch.
  if (Platform.OS !== 'web') {
    headers['User-Agent'] = 'ProTop/2.0 (https://protop.no)';
  }
  return headers;
}

async function searchPlacesOsm(query, lang = 'en') {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&addressdetails=1&countrycodes=no,se,dk&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: nominatimHeaders(lang) });
  if (!res.ok) return [];
  const json = await res.json();
  return (json || []).map((r) => ({
    label: r.display_name,
    lat: Number(r.lat),
    lng: Number(r.lon),
    placeId: String(r.place_id),
    source: 'osm',
  })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

/** Ser ut som norsk gateadresse (husnummer / postnr) → bruk Kartverket. */
export function looksLikeNordicStreetAddress(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return false;
  const parsed = parseNorwegianAddressQuery(q);
  if (parsed.nummer != null && parsed.adressenavn) return true;
  if (/\b\d{4}\b/.test(q)) return true;
  return false;
}

function kartverketHitToPlace(hit) {
  return {
    label: hit.label || hit.adressetekst,
    lat: hit.lat,
    lng: hit.lon,
    placeId: hit.id || `kv:${hit.label}`,
    source: 'kartverket',
    adressetekst: hit.adressetekst,
    postnummer: hit.postnummer,
    poststed: hit.poststed,
    matrikkel: hit.matrikkel || null,
  };
}

async function searchPlacesKartverket(query) {
  // Fuzzy slår av stedsnavn som «Foss eik» og fyller lista med urelaterte treff.
  // Gateadresser treffer uten fuzzy. Stedsnavn kommer fra Photon og Nominatim.
  const { results } = await searchKartverketAdresser(query, { treffPerSide: 6, fuzzy: false });
  return results.map(kartverketHitToPlace);
}

async function searchPlacesPhoton(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en&lat=61.5&lon=8.5`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = await res.json();
  const allowed = new Set(['NO', 'SE', 'DK']);
  return (json?.features || []).map((feature) => {
    const props = feature?.properties || {};
    const country = String(props.countrycode || '').toUpperCase();
    if (country && !allowed.has(country)) return null;
    const street = [props.street || props.name, props.housenumber].filter(Boolean).join(' ');
    const city = props.city || props.locality || props.county || '';
    const postcode = props.postcode || '';
    const label = [street, [postcode, city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const coords = feature?.geometry?.coordinates || [];
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      label,
      lat,
      lng,
      placeId: `ph:${props.osm_id || label}`,
      source: 'photon',
      adressetekst: street,
      postnummer: postcode,
      poststed: city,
    };
  }).filter(Boolean);
}

function mergePlaceHits(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const hit of group || []) {
      const key = String(hit?.label || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!key || seen.has(key)) continue;
      if (!Number.isFinite(Number(hit.lat)) || !Number.isFinite(Number(hit.lng))) continue;
      seen.add(key);
      out.push(hit);
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/**
 * Adressetreff etter tre bokstaver. Kartverket, Photon og Nominatim i parallell.
 * Google Maps JavaScript Places brukes ikke: nøkkelen har ikke Places aktivert.
 */
export async function searchPlaces(query, lang = 'en') {
  const q = String(query || '').trim();
  if (q.length < 3) return [];
  const [kv, photon, osm] = await Promise.all([
    withTimeout(searchPlacesKartverket(q).catch(() => []), PLACE_SEARCH_TIMEOUT_MS, []),
    withTimeout(searchPlacesPhoton(q).catch(() => []), PLACE_SEARCH_TIMEOUT_MS, []),
    withTimeout(searchPlacesOsm(q, lang).catch(() => []), PLACE_SEARCH_TIMEOUT_MS, []),
  ]);
  return mergePlaceHits(kv, photon, osm);
}

/** Build a usable location from free-typed text (optional geocode). */
export async function resolveTypedLocation(text, lang = 'en') {
  const label = String(text || '').trim();
  if (label.length < 3) return null;

  try {
    const hits = await searchPlaces(label, lang);
    if (hits[0]) return hits[0];
  } catch {
    // keep typed fallback
  }

  return {
    label,
    lat: null,
    lng: null,
    placeId: '',
    source: 'typed',
  };
}

/**
 * Adresse fra posisjon: Kartverket, Photon og Nominatim (src/utils/reverseGeocode.js).
 * Alltid et sted tilbake (koordinatene som tekst til slutt).
 */
export async function reverseGeocode(lat, lng, lang = 'en') {
  return reverseGeocodeWith(lat, lng, {
    fetchImpl: (...args) => fetch(...args),
    nominatimHeaders: nominatimHeaders(lang),
  });
}

export async function openGoogleMaps(loc) {
  const url = mapsUrl(loc);
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Linking.openURL(url);
}

export async function getDeviceLocation() {
  if (Platform.OS !== 'web') {
    const Location = await import('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('denied');
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy?.Balanced ?? Location.Accuracy?.Low,
    });
    return {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    };
  }
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? null,
        }),
        (err) => {
          const code = err?.code;
          if (code === 1) reject(new Error('denied'));
          else if (code === 3) reject(new Error('timeout'));
          else reject(new Error('geolocation-unavailable'));
        },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
      );
    });
  }
  throw new Error('geolocation-unavailable');
}
