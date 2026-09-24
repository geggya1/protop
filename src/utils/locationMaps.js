/** ~1.1 km at equator — used for OSM embed framing. */
const EMBED_DELTA = 0.01;

export function mapsUrl(loc) {
  if (!loc) return 'https://www.google.com/maps';
  if (loc.lat != null && loc.lng != null && Number.isFinite(Number(loc.lat)) && Number.isFinite(Number(loc.lng))) {
    return `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(loc.label || '')}`;
}

/**
 * In-app map preview. Google's legacy `output=embed` URLs now 404, and the
 * Maps Embed API requires a billed project — use OpenStreetMap instead.
 * Returns null when coordinates are missing (label-only places).
 */
export function mapsEmbed(loc, { zoomDelta = EMBED_DELTA } = {}) {
  const lat = Number(loc?.lat);
  const lng = Number(loc?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const d = Math.max(Number(zoomDelta) || EMBED_DELTA, 0.002);
  const minLon = lng - d;
  const minLat = lat - d;
  const maxLon = lng + d;
  const maxLat = lat + d;
  const bbox = [minLon, minLat, maxLon, maxLat]
    .map((n) => encodeURIComponent(String(n)))
    .join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${encodeURIComponent(lat)}%2C${encodeURIComponent(lng)}`;
}
