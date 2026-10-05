/** Leaflet + OpenStreetMap, uten API-nøkkel eller innlogging. */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function tenderMapDocument(pins, { selectedId = '', brand = '#3D6B8A' } = {}) {
  const rows = (Array.isArray(pins) ? pins : []).filter((row) => (
    Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lng))
  ));
  const payload = JSON.stringify(rows.map((row) => ({
    id: String(row.id || ''),
    title: String(row.title || '').slice(0, 120),
    label: String(row.label || ''),
    lat: Number(row.lat),
    lng: Number(row.lng),
    kind: row.kind === 'aktuell' ? 'aktuell' : 'ny',
  }))).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
  html, body, #map { height: 100%; margin: 0; background: #e8eef4; }
  .leaflet-container { font: 13px/1.35 system-ui, sans-serif; }
  .pin { width: 14px; height: 14px; border-radius: 999px; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(15,23,42,.35); }
  .pin.ny { background: #64748b; }
  .pin.aktuell { background: ${escapeHtml(brand)}; }
  .pin.on { width: 18px; height: 18px; box-shadow: 0 0 0 3px rgba(61,107,138,.35); }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const pins = ${payload};
const selected = ${JSON.stringify(String(selectedId || ''))};
const map = L.map('map', { zoomControl: true, attributionControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
const layer = L.featureGroup();
const icon = (kind, on) => L.divIcon({
  className: '',
  html: '<div class="pin ' + kind + (on ? ' on' : '') + '"></div>',
  iconSize: [on ? 18 : 14, on ? 18 : 14],
  iconAnchor: [on ? 9 : 7, on ? 9 : 7],
});
pins.forEach((row) => {
  const marker = L.marker([row.lat, row.lng], { icon: icon(row.kind, row.id === selected), title: row.title });
  marker.bindPopup('<strong>' + row.title.replace(/</g, '') + '</strong><br/>' + row.label.replace(/</g, '') +
    (row.kind === 'aktuell' ? '<br/>Aktuell' : '<br/>Ny'));
  marker.on('click', () => {
    if (window.parent) window.parent.postMessage({ tenderId: row.id }, '*');
  });
  marker.addTo(layer);
});
if (pins.length) {
  layer.addTo(map);
  map.fitBounds(layer.getBounds().pad(0.2), { maxZoom: 10 });
} else {
  map.setView([64.5, 11.5], 4);
}
</script>
</body>
</html>`;
}
