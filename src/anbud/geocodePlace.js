/** Gratis geokoding uten nøkkel: Kartverket stedsnavn, deretter Photon (OSM). */

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
    const raw = localStorage.getItem(`anbud-geo:${key}`);
    if (!raw) return null;
    const row = JSON.parse(raw);
    const lat = Number(row?.lat);
    const lng = Number(row?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng, label: String(row.label || ''), precision: 'sted', source: row.source || 'photon' };
  } catch {
    return null;
  }
}

function writeStore(key, hit) {
  cache.set(key, hit);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`anbud-geo:${key}`, JSON.stringify({
      lat: hit.lat,
      lng: hit.lng,
      label: hit.label,
      source: hit.source,
    }));
  } catch {
    // kvote
  }
}

async function kartverket(query) {
  const url = `https://ws.geonorge.no/stedsnavn/v1/navn?sok=${encodeURIComponent(query)}*&treffPerSide=5&eksakteForst=true`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const navn = (Array.isArray(data?.navn) ? data.navn : []).find((row) => {
    const punkt = row?.representasjonspunkt || row?.stedsnavn?.[0]?.representasjonspunkt;
    const lat = Number(punkt?.nord ?? punkt?.lat);
    const lng = Number(punkt?.ost ?? punkt?.øst ?? punkt?.lon ?? punkt?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
  });
  const punkt = navn?.representasjonspunkt || navn?.stedsnavn?.[0]?.representasjonspunkt;
  if (!punkt) return null;
  const lat = Number(punkt.nord ?? punkt.lat);
  const lng = Number(punkt.ost ?? punkt.øst ?? punkt.lon ?? punkt.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = navn?.skrivemåte || navn?.stedsnavn?.[0]?.skrivemåte || query;
  return {
    lat,
    lng,
    label: String(label),
    precision: 'sted',
    source: 'kartverket',
  };
}

async function photon(query) {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = await res.json();
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const props = feature.properties || {};
  const label = [props.name, props.city, props.county, props.country].filter(Boolean).join(', ') || query;
  return {
    lat: Number(coords[1]),
    lng: Number(coords[0]),
    label,
    precision: 'sted',
    source: 'photon',
  };
}

export async function geocodePlaceName(query) {
  const q = String(query || '').trim();
  if (q.length < 3) return null;
  const key = fold(q);
  if (cache.has(key)) return cache.get(key);
  const stored = readStore(key);
  if (stored) {
    cache.set(key, stored);
    return stored;
  }
  const norwegian = /[æøå]/i.test(q) || /\b(kommune|fylke|norge)\b/i.test(q);
  if (norwegian) {
    try {
      const kv = await kartverket(q);
      if (kv) {
        writeStore(key, kv);
        return kv;
      }
    } catch {
      // Photon
    }
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
