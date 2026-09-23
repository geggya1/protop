import { Platform, Linking } from 'react-native';
import { firebaseConfig } from '../../firebase';
import { mapsEmbed, mapsUrl } from './locationMaps';
import {
  searchKartverketAdresser,
  parseNorwegianAddressQuery,
} from './boligmappaApis';

export { mapsEmbed, mapsUrl };

const MAPS_KEY = firebaseConfig?.apiKey || '';
const GOOGLE_SEARCH_TIMEOUT_MS = 2500;

let googleMapsReady = null;
let placesServiceHost = null;

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

function coordsLabel(lat, lng) {
  return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
}

function placeFromCoords(lat, lng, label, source = 'coords') {
  return {
    label: label || coordsLabel(lat, lng),
    lat: Number(lat),
    lng: Number(lng),
    placeId: '',
    source,
  };
}

/**
 * Load Maps JS (Places library). Resolves null on failure / timeout — never hangs.
 */
function loadGoogleMaps() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }
  if (googleMapsReady) return googleMapsReady;

  googleMapsReady = new Promise((resolve) => {
    const finish = () => resolve(window.google?.maps || null);
    const existing = document.getElementById('weekplan-google-maps');
    if (existing) {
      if (window.google?.maps) {
        finish();
        return;
      }
      existing.addEventListener('load', finish, { once: true });
      existing.addEventListener('error', () => resolve(null), { once: true });
      // Load event may already have fired — don't hang.
      setTimeout(finish, 4000);
      return;
    }
    const script = document.createElement('script');
    script.id = 'weekplan-google-maps';
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&libraries=places&language=no`;
    script.onload = finish;
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
    setTimeout(finish, 8000);
  });
  return googleMapsReady;
}

/** PlacesService needs a DOM-attached element; a detached div often fails silently. */
function getPlacesServiceHost() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return null;
  if (placesServiceHost?.isConnected) return placesServiceHost;
  const el = document.createElement('div');
  el.id = 'weekplan-places-host';
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none;';
  document.body.appendChild(el);
  placesServiceHost = el;
  return el;
}

async function searchPlacesGoogle(query) {
  const maps = await withTimeout(loadGoogleMaps(), 5000, null);
  if (!maps?.places?.AutocompleteService) return null;

  const service = new maps.places.AutocompleteService();
  const predictions = await withTimeout(
    new Promise((resolve) => {
      try {
        service.getPlacePredictions(
          {
            input: query,
            componentRestrictions: { country: ['no', 'se', 'dk'] },
          },
          (result, status) => {
            if (status !== 'OK' || !result) resolve([]);
            else resolve(result);
          },
        );
      } catch {
        resolve([]);
      }
    }),
    GOOGLE_SEARCH_TIMEOUT_MS,
    [],
  );

  if (!predictions?.length) return [];

  const host = getPlacesServiceHost();
  if (!host) return [];
  const detailService = new maps.places.PlacesService(host);
  const detailed = await Promise.all(
    predictions.slice(0, 6).map(
      (p) => withTimeout(
        new Promise((resolve) => {
          try {
            detailService.getDetails(
              { placeId: p.place_id, fields: ['geometry', 'formatted_address', 'name', 'place_id'] },
              (place, status) => {
                if (status !== 'OK' || !place) {
                  resolve({
                    label: p.description,
                    lat: null,
                    lng: null,
                    placeId: p.place_id,
                    source: 'google',
                  });
                  return;
                }
                resolve({
                  label: place.formatted_address || place.name || p.description,
                  lat: place.geometry?.location?.lat?.() ?? null,
                  lng: place.geometry?.location?.lng?.() ?? null,
                  placeId: place.place_id || p.place_id,
                  source: 'google',
                });
              },
            );
          } catch {
            resolve({
              label: p.description,
              lat: null,
              lng: null,
              placeId: p.place_id,
              source: 'google',
            });
          }
        }),
        2000,
        {
          label: p.description,
          lat: null,
          lng: null,
          placeId: p.place_id,
          source: 'google',
        },
      ),
    ),
  );
  // Drop predictions that never got geometry — label-only hits break maps/weather/places.
  return detailed.filter(
    (p) => p
      && Number.isFinite(Number(p.lat))
      && Number.isFinite(Number(p.lng)),
  );
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
  const { results } = await searchKartverketAdresser(query, { treffPerSide: 6 });
  return results.map(kartverketHitToPlace);
}

/**
 * Search for places. Official Kartverket addresses first when the query looks
 * like a Nordic street address, then OSM, then Google Places.
 */
export async function searchPlaces(query, lang = 'en') {
  const q = String(query || '').trim();
  if (q.length < 2) return [];

  if (looksLikeNordicStreetAddress(q)) {
    try {
      const kvHits = await searchPlacesKartverket(q);
      if (kvHits.length) return kvHits;
    } catch {
      // fall through
    }
  }

  try {
    const osmHits = await searchPlacesOsm(q, lang);
    if (osmHits.length) return osmHits;
  } catch {
    // fall through
  }

  try {
    const googleHits = await searchPlacesGoogle(q);
    if (googleHits && googleHits.length) return googleHits;
  } catch {
    // fall through
  }

  return [];
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

async function reverseViaBigDataCloud(lat, lng, lang = 'nb') {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=${encodeURIComponent(lang || 'nb')}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = await res.json();
  const parts = [
    json.locality,
    json.city,
    json.principalSubdivision,
    json.countryName,
  ].filter(Boolean);
  const unique = [...new Set(parts.map((p) => String(p).trim()).filter(Boolean))];
  if (!unique.length) return null;
  return placeFromCoords(lat, lng, unique.join(', '), 'bigdatacloud');
}

async function reverseViaPhoton(lat, lng) {
  // Photon only supports default/de/en/fr — use English labels.
  const url = `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&lang=en`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
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

async function reverseViaNominatim(lat, lng, lang = 'nb') {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`;
  const res = await fetch(url, { headers: nominatimHeaders(lang) });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json?.display_name) return null;
  return placeFromCoords(lat, lng, json.display_name, 'osm');
}

/**
 * Reverse geocode. Prefer CORS-friendly providers on web — Nominatim reverse
 * often omits Access-Control-Allow-Origin, which breaks browser fetch.
 * Always resolves to a usable place (coords label as last resort).
 */
export async function reverseGeocode(lat, lng, lang = 'en') {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) {
    throw new Error('invalid-coords');
  }

  const providers = [
    () => reverseViaBigDataCloud(nLat, nLng, lang),
    () => reverseViaPhoton(nLat, nLng),
    () => reverseViaNominatim(nLat, nLng, lang),
  ];

  for (const run of providers) {
    try {
      const hit = await withTimeout(run(), 5000, null);
      if (hit?.label) return hit;
    } catch {
      // try next
    }
  }

  return placeFromCoords(nLat, nLng, coordsLabel(nLat, nLng), 'coords');
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
