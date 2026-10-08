/** Leaflet + OpenStreetMap, uten API-nøkkel eller innlogging. */

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function decisionButtonsHtml(row) {
  const id = escapeHtml(row?.id || '');
  const aktuell = row?.kind === 'aktuell';
  const label = row?.busy ? 'Henter …' : 'Aktuell';
  return `<div class="decisions">
      <button type="button" class="mark aktuell${aktuell ? ' on' : ''}" data-mark="aktuell" data-id="${id}" aria-pressed="${aktuell ? 'true' : 'false'}" aria-label="Merk som aktuell">${label}</button>
      <button type="button" class="mark uaktuell" data-mark="forkastet" data-id="${id}" aria-pressed="false" aria-label="Merk som uaktuell">Uaktuell</button>
    </div>`;
}

export function pinPopupHtml(row, index, total) {
  const n = Number(index) || 0;
  const of = Math.max(1, Number(total) || 1);
  const kind = row?.kind === 'aktuell' ? 'Aktuell' : 'Ny';
  const meta = [
    row?.buyer ? escapeHtml(row.buyer) : '',
    row?.deadline ? `Frist ${escapeHtml(row.deadline)}` : '',
    row?.source ? escapeHtml(row.source) : '',
  ].filter(Boolean).join(' · ');
  return `<div class="bubble">
    <div class="kicker">${kind} · ${escapeHtml(row?.label || 'Sted')}</div>
    ${decisionButtonsHtml(row)}
    <button type="button" class="jump" data-open="${escapeHtml(row?.id || '')}">${escapeHtml(row?.title || 'Kunngjøring')}</button>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    <div class="row">
      <button type="button" class="nav" data-act="prev" aria-label="Forrige sted">Forrige</button>
      <span class="count">${n + 1} / ${of}</span>
      <button type="button" class="nav" data-act="next" aria-label="Neste sted">Neste</button>
    </div>
    <button type="button" class="open" data-open="${escapeHtml(row?.id || '')}">Åpne i listen</button>
  </div>`;
}

export function tenderMapDocument(pins, { selectedId = '', brand = '#3D6B8A', danger = '#dc2626', compact = false } = {}) {
  const rows = (Array.isArray(pins) ? pins : []).filter((row) => (
    Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lng))
  ));
  const payload = JSON.stringify(rows.map((row) => ({
    id: String(row.id || ''),
    title: String(row.title || '').slice(0, 120),
    buyer: String(row.buyer || '').slice(0, 80),
    deadline: String(row.deadline || ''),
    source: String(row.source || ''),
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
  .bar {
    position: absolute; left: 44px; right: 8px; top: 8px; z-index: 1000;
    display: flex; gap: 6px; align-items: center;
    background: #fff; border-radius: 10px; padding: 6px; box-shadow: 0 1px 6px rgba(15,23,42,.18);
  }
  .bar button, .bubble button {
    border: 0; background: #f1f5f9; color: #1a2744; border-radius: 8px;
    padding: 6px 8px; font: 12px/1.2 system-ui, sans-serif; cursor: pointer;
  }
  .bar .where { flex: 1; min-width: 0; font: 12px/1.3 system-ui, sans-serif; color: #1a2744; }
  .bar .where b { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar .where span { color: #5b6b82; }
  .leaflet-popup-content { margin: 10px 12px; min-width: 180px; max-height: 250px; overflow-y: auto; }
  .bubble { display: flex; flex-direction: column; gap: 6px; max-width: 240px; }
  .bubble button, .decisions .mark { touch-action: manipulation; }
  .kicker { font-size: 11px; color: #5b6b82; font-weight: 600; }
  .jump { text-align: left; background: transparent !important; padding: 0 !important; font-weight: 700; color: ${escapeHtml(brand)} !important; }
  .meta { font-size: 12px; color: #5b6b82; }
  .row { display: flex; gap: 6px; align-items: center; }
  .count { font-size: 12px; color: #5b6b82; flex: 1; text-align: center; }
  .decisions { display: flex; gap: 6px; }
  .decisions .mark { flex: 1; font-weight: 600; min-height: 44px; font-size: 14px; padding: 10px 8px; }
  .bubble .nav, .bubble .open { min-height: 40px; }
  .mark.aktuell.on { background: ${escapeHtml(brand)} !important; color: #fff !important; }
  .mark.uaktuell.on { background: ${escapeHtml(danger)} !important; color: #fff !important; }
  .open { background: ${escapeHtml(brand)} !important; color: #fff !important; font-weight: 600; }
  ${compact ? '.bar { display: none; }' : ''}
</style>
</head>
<body>
<div id="map"></div>
<div class="bar">
  <button type="button" data-act="prev" aria-label="Forrige sted">Forrige</button>
  <div class="where"><b id="barTitle">Velg en nål</b><span id="barMeta"></span></div>
  <button type="button" data-act="next" aria-label="Neste sted">Neste</button>
</div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const pins = ${payload};
const selected = ${JSON.stringify(String(selectedId || ''))};
const map = L.map('map', { zoomControl: true, attributionControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
function esc(value) {
  return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function decisionRow(row) {
  const on = row.kind === 'aktuell';
  const label = row.busy ? 'Henter …' : 'Aktuell';
  return '<div class="decisions">'
    + '<button type="button" class="mark aktuell' + (on ? ' on' : '') + '" data-mark="aktuell" data-id="' + esc(row.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="Merk som aktuell">' + label + '</button>'
    + '<button type="button" class="mark uaktuell" data-mark="forkastet" data-id="' + esc(row.id) + '" aria-pressed="false" aria-label="Merk som uaktuell">Uaktuell</button>'
    + '</div>';
}
function popupHtml(row, index) {
  const kind = row.kind === 'aktuell' ? 'Aktuell' : 'Ny';
  const meta = [row.buyer, row.deadline ? ('Frist ' + row.deadline) : '', row.source].filter(Boolean).join(' · ');
  return '<div class="bubble">'
    + '<div class="kicker">' + kind + ' · ' + esc(row.label || 'Sted') + '</div>'
    + decisionRow(row)
    + '<button type="button" class="jump" data-open="' + esc(row.id) + '">' + esc(row.title) + '</button>'
    + (meta ? '<div class="meta">' + esc(meta) + '</div>' : '')
    + '<div class="row">'
    + '<button type="button" class="nav" data-act="prev" aria-label="Forrige sted">Forrige</button>'
    + '<span class="count">' + (index + 1) + ' / ' + pins.length + '</span>'
    + '<button type="button" class="nav" data-act="next" aria-label="Neste sted">Neste</button></div>'
    + '<button type="button" class="open" data-open="' + esc(row.id) + '">Åpne i listen</button></div>';
}
const layer = L.featureGroup();
const markers = [];
let current = 0;
let fitted = false;
const popupPad = ${compact ? '[8, 12]' : '[12, 64]'};
const icon = (kind, on) => L.divIcon({
  className: '',
  html: '<div class="pin ' + kind + (on ? ' on' : '') + '"></div>',
  iconSize: [on ? 18 : 14, on ? 18 : 14],
  iconAnchor: [on ? 9 : 7, on ? 9 : 7],
});
function paint() {
  markers.forEach((marker, i) => marker.setIcon(icon(pins[i].kind, i === current)));
  const row = pins[current];
  const title = document.getElementById('barTitle');
  const meta = document.getElementById('barMeta');
  if (row && title) title.textContent = row.title;
  if (meta) meta.textContent = row ? ((current + 1) + ' / ' + pins.length + ' · ' + (row.label || '')) : '';
}
function tell(type, id, extra) {
  if (window.parent) window.parent.postMessage(Object.assign({ type: type, tenderId: id }, extra || {}), '*');
}
function show(index, { jump, pan } = {}) {
  if (!pins.length) return;
  current = (index + pins.length) % pins.length;
  const marker = markers[current];
  const row = pins[current];
  paint();
  if (pan !== false && marker) map.panTo(marker.getLatLng());
  if (marker) marker.openPopup();
  tell('preview', row.id);
  if (jump) tell('open', row.id);
}
function normalizePin(row) {
  return {
    id: String((row && row.id) || ''),
    title: String((row && row.title) || '').slice(0, 120),
    buyer: String((row && row.buyer) || '').slice(0, 80),
    deadline: String((row && row.deadline) || ''),
    source: String((row && row.source) || ''),
    label: String((row && row.label) || ''),
    lat: Number(row && row.lat),
    lng: Number(row && row.lng),
    kind: row && row.kind === 'aktuell' ? 'aktuell' : 'ny',
    busy: !!(row && row.busy),
  };
}
function sameIds(next) {
  if (next.length !== pins.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (pins[i].id !== next[i].id) return false;
  }
  return true;
}
function bindMarker(row) {
  const marker = L.marker([row.lat, row.lng], { icon: icon(row.kind, false), title: row.title });
  marker.bindPopup(() => {
    const index = Math.max(0, pins.findIndex((item) => item.id === row.id));
    return popupHtml(pins[index] || row, index);
  }, { maxWidth: 280, maxHeight: 300, autoPanPadding: popupPad, keepInView: false });
  marker.on('click', () => {
    const at = pins.findIndex((item) => item.id === row.id);
    if (at < 0) return;
    current = at;
    paint();
    marker.openPopup();
    tell('preview', row.id);
  });
  return marker;
}
function rebuild(next, focusId) {
  const prevId = pins[current] ? pins[current].id : '';
  const wasOpen = !!(markers[current] && markers[current].isPopupOpen && markers[current].isPopupOpen());
  const growing = next.length > pins.length;
  markers.forEach((marker) => layer.removeLayer(marker));
  markers.length = 0;
  pins.length = 0;
  next.forEach((row) => {
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng) || !row.id) return;
    pins.push(row);
  });
  pins.forEach((row) => {
    const marker = bindMarker(row);
    marker.addTo(layer);
    markers.push(marker);
  });
  if (pins.length && !layer._map) layer.addTo(map);
  if (pins.length && (!fitted || growing)) {
    map.fitBounds(layer.getBounds().pad(0.2), { maxZoom: 10 });
    fitted = true;
  }
  if (!pins.length) {
    current = 0;
    map.closePopup();
    paint();
    return;
  }
  let index = focusId ? pins.findIndex((row) => row.id === focusId) : -1;
  if (index < 0 && prevId) index = pins.findIndex((row) => row.id === prevId);
  const lost = !!(prevId && index < 0);
  if (index < 0) index = Math.min(Math.max(current, 0), pins.length - 1);
  current = index;
  paint();
  const marker = markers[current];
  if (!marker) return;
  if (lost || (focusId && pins[current] && pins[current].id === focusId)) {
    map.panTo(marker.getLatLng());
    marker.openPopup();
    return;
  }
  if (wasOpen) marker.openPopup();
}
let lastMarkKey = '';
let lastMarkAt = 0;
document.addEventListener('click', (event) => {
  const mark = event.target.closest('[data-mark]');
  if (mark) {
    event.preventDefault();
    event.stopPropagation();
    const id = mark.getAttribute('data-id') || (pins[current] && pins[current].id);
    const decision = mark.getAttribute('data-mark');
    if (id && (decision === 'aktuell' || decision === 'forkastet')) {
      const key = id + '\0' + decision;
      const now = Date.now();
      if (!(lastMarkKey === key && now - lastMarkAt < 800)) {
        lastMarkKey = key;
        lastMarkAt = now;
        tell('mark', id, { decision: decision });
      }
    }
    if (mark.blur) mark.blur();
    return;
  }
  const open = event.target.closest('[data-open]');
  if (open && open.getAttribute('data-open')) {
    event.preventDefault();
    tell('open', open.getAttribute('data-open'));
    return;
  }
  const act = event.target.closest('[data-act]');
  if (!act) return;
  event.preventDefault();
  show(current + (act.getAttribute('data-act') === 'next' ? 1 : -1), { pan: true });
});
window.addEventListener('message', (event) => {
  if (event?.data?.type === 'sync' && Array.isArray(event.data.pins)) {
    const next = event.data.pins.map(normalizePin);
    if (!sameIds(next)) {
      rebuild(next, String(event.data.focusId || ''));
      return;
    }
    const busyId = String(event.data.busyId || '');
    let changed = false;
    pins.forEach((row, i) => {
      const src = next[i] || row;
      const kind = src.kind === 'aktuell' ? 'aktuell' : 'ny';
      const busy = row.id === busyId;
      if (row.lat !== src.lat || row.lng !== src.lng) {
        row.lat = src.lat;
        row.lng = src.lng;
        markers[i].setLatLng([src.lat, src.lng]);
        changed = true;
      }
      if (row.kind !== kind || !!row.busy !== busy || row.title !== src.title) {
        row.kind = kind;
        row.busy = busy;
        row.title = src.title;
        row.buyer = src.buyer;
        row.deadline = src.deadline;
        row.source = src.source;
        row.label = src.label;
        changed = true;
      }
    });
    if (changed) {
      paint();
      const marker = markers[current];
      if (marker && marker.isPopupOpen()) marker.setPopupContent(popupHtml(pins[current], current));
    }
    return;
  }
  const id = event?.data?.id || event?.data?.tenderId;
  if (event?.data?.type === 'show' && id) {
    const index = pins.findIndex((row) => row.id === id);
    if (index >= 0) show(index, { pan: true });
  }
});
if (pins.length) {
  const initial = pins.slice();
  rebuild(initial, selected || '');
} else {
  map.setView([64.5, 11.5], 4);
}
</script>
</body>
</html>`;
}
