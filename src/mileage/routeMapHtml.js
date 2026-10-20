/**
 * Leaflet + OpenStreetMap-preview for én kjøretur (fra → til + polyline).
 * Samme mønster som anbudskartet, uten API-nøkkel.
 */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Begrens antall punkter så iframe-payloaden holder seg liten. */
export function downsampleRoutePoints(points, maxPoints = 120) {
  const rows = (Array.isArray(points) ? points : []).filter((row) => (
    Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lng))
  ));
  if (rows.length <= maxPoints) return rows.map((row) => ({ lat: Number(row.lat), lng: Number(row.lng) }));
  const step = (rows.length - 1) / (maxPoints - 1);
  const out = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const row = rows[Math.round(i * step)];
    out.push({ lat: Number(row.lat), lng: Number(row.lng) });
  }
  return out;
}

export function routeMapDocument({
  from = null,
  to = null,
  points = [],
  brand = '#3D6B8A',
  fromLabel = 'Fra',
  toLabel = 'Til',
} = {}) {
  const path = downsampleRoutePoints(points);
  const start = Number.isFinite(Number(from?.lat)) && Number.isFinite(Number(from?.lng))
    ? { lat: Number(from.lat), lng: Number(from.lng), label: from.label || fromLabel }
    : null;
  const end = Number.isFinite(Number(to?.lat)) && Number.isFinite(Number(to?.lng))
    ? { lat: Number(to.lat), lng: Number(to.lng), label: to.label || toLabel }
    : null;
  if (!start && !end && path.length < 2) return '';

  const payload = JSON.stringify({
    brand,
    from: start,
    to: end,
    fromLabel,
    toLabel,
    path,
  });

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html, body, #map { height: 100%; margin: 0; }
  body { background: #e8eef3; }
  .leaflet-container { font: 13px/1.35 system-ui, sans-serif; }
  .pin {
    width: 28px; height: 28px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-weight: 700; font-size: 12px;
    border: 2px solid #fff; box-shadow: 0 1px 4px rgba(15,23,42,.35);
  }
</style>
</head>
<body>
<div id="map" role="img" aria-label="Kart over kjøreturen"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const data = ${payload};
const map = L.map('map', { zoomControl: true, attributionControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
const bounds = [];
function addPin(place, letter, color) {
  if (!place) return;
  const icon = L.divIcon({
    className: '',
    html: '<div class="pin" style="background:' + color + '">' + letter + '</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
  L.marker([place.lat, place.lng], { icon })
    .addTo(map)
    .bindTooltip(place.label || letter, { permanent: false, direction: 'top' });
  bounds.push([place.lat, place.lng]);
}
addPin(data.from, 'A', data.brand || '#3D6B8A');
addPin(data.to, 'B', '#0f766e');
if (Array.isArray(data.path) && data.path.length >= 2) {
  const latlngs = data.path.map((row) => [row.lat, row.lng]);
  const line = L.polyline(latlngs, {
    color: data.brand || '#3D6B8A',
    weight: 4,
    opacity: 0.9,
    lineJoin: 'round',
  }).addTo(map);
  bounds.push(...latlngs);
  map.fitBounds(line.getBounds().pad(0.18));
} else if (bounds.length >= 2) {
  map.fitBounds(L.latLngBounds(bounds).pad(0.25));
} else if (bounds.length === 1) {
  map.setView(bounds[0], 13);
} else {
  map.setView([64.5, 11], 4);
}
</script>
</body>
</html>`;
}
