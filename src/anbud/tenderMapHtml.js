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

function placeLine(row) {
  if (row?.coverage === 'land') return 'Hele Norge · ikke stedbunden';
  return row?.label || 'Sted';
}

export function pinPopupHtml(row, index, total, { showMark = true, openLabel = 'Åpne i listen', kindLabel = '' } = {}) {
  const n = Number(index) || 0;
  const of = Math.max(1, Number(total) || 1);
  const kind = kindLabel || (row?.kind === 'aktuell' ? 'Aktuell' : row?.kind === 'uaktuell' ? 'Uaktuell' : 'Ny');
  const no = Number(row?.mapNo) > 0 ? `${row.mapNo} · ` : '';
  const meta = [
    row?.buyer ? escapeHtml(row.buyer) : '',
    row?.deadline ? `Frist ${escapeHtml(row.deadline)}` : '',
    row?.source ? escapeHtml(row.source) : '',
  ].filter(Boolean).join(' · ');
  return `<div class="bubble">
    <div class="kicker">${no}${kind} · ${escapeHtml(placeLine(row))}</div>
    ${showMark ? decisionButtonsHtml(row) : ''}
    <button type="button" class="jump" data-open="${escapeHtml(row?.id || '')}">${escapeHtml(row?.title || 'Kunngjøring')}</button>
    ${meta ? `<div class="meta">${meta}</div>` : ''}
    <div class="row">
      <button type="button" class="nav" data-act="prev" aria-label="Forrige sted">Forrige</button>
      <span class="count">${n + 1} / ${of}</span>
      <button type="button" class="nav" data-act="next" aria-label="Neste sted">Neste</button>
    </div>
    <button type="button" class="open" data-open="${escapeHtml(row?.id || '')}">${escapeHtml(openLabel)}</button>
  </div>`;
}

export function tenderMapDocument(pins, {
  selectedId = '',
  brand = '#3D6B8A',
  danger = '#dc2626',
  compact = false,
  showMark = true,
  openLabel = 'Åpne i listen',
  kindLabel = '',
} = {}) {
  const rows = (Array.isArray(pins) ? pins : []).filter((row) => (
    Number.isFinite(Number(row?.lat)) && Number.isFinite(Number(row?.lng))
  ));
  const payload = JSON.stringify(rows.map((row) => ({
    id: String(row.id || ''),
    title: String(row.title || '').slice(0, 120),
    buyer: String(row.buyer || '').slice(0, 80),
    deadline: String(row.deadline || ''),
    source: String(row.source || ''),
    label: String(row.coverage === 'land' ? 'Hele Norge' : (row.label || '')),
    lat: Number(row.lat),
    lng: Number(row.lng),
    coverage: row.coverage === 'land' ? 'land' : '',
    kind: row.kind === 'aktuell' || row.kind === 'uaktuell' ? row.kind : 'ny',
    ...(Number(row.mapNo) > 0 ? { mapNo: Number(row.mapNo) } : {}),
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
  .pin { width: 14px; height: 14px; border-radius: 999px; border: 2px solid #fff; box-shadow: 0 1px 4px rgba(15,23,42,.35); display: flex; align-items: center; justify-content: center; color: #fff; font: 700 11px/1 system-ui, sans-serif; box-sizing: border-box; cursor: pointer; }
  .pin.ny { background: #64748b; }
  .pin.aktuell { background: ${escapeHtml(brand)}; }
  .pin.uaktuell { background: ${escapeHtml(danger)}; }
  .pin.num { width: 22px; height: 22px; }
  .pin.dim { opacity: 0.38; }
  .pin.on { width: 30px; height: 30px; font-size: 14px; opacity: 1; outline: 3px solid #fff; box-shadow: 0 0 0 6px ${escapeHtml(brand)}; animation: pinpulse 1.2s ease-out infinite; }
  @keyframes pinpulse {
    0% { box-shadow: 0 0 0 6px ${escapeHtml(brand)}; }
    70% { box-shadow: 0 0 0 6px ${escapeHtml(brand)}, 0 0 0 14px transparent; }
    100% { box-shadow: 0 0 0 6px ${escapeHtml(brand)}; }
  }
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
  .land-tip {
    background: #fff; border: 0; border-radius: 8px; color: #1a2744; font-weight: 700;
    padding: 4px 8px; box-shadow: 0 1px 4px rgba(15,23,42,.25);
  }
  .leaflet-tooltip-center.land-tip::before { display: none; }
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
const brandColor = ${JSON.stringify(String(brand || '#3D6B8A'))};
const showMark = ${showMark === false ? 'false' : 'true'};
const openLabel = ${JSON.stringify(String(openLabel || 'Åpne i listen'))};
const kindLabel = ${JSON.stringify(String(kindLabel || ''))};
const NORWAY = [[71.1855,28.1655],[70.4538,31.2934],[70.1863,30.0054],[69.5581,31.1011],[69.1569,29.3996],[69.0648,28.5919],[69.7665,29.0156],[70.1642,27.7323],[69.8253,26.1796],[69.0921,25.6892],[68.6496,24.7357],[68.8912,23.6621],[68.8417,22.3562],[69.3704,21.2449],[69.1062,20.6456],[69.0651,20.0253],[68.4072,19.8786],[68.5674,17.9939],[68.0106,17.7292],[68.0139,16.7689],[67.3025,16.1087],[66.1939,15.1084],[64.787,13.5557],[64.4454,13.9199],[64.0491,13.5719],[64.0662,12.5799],[63.1283,11.9306],[61.8004,11.9921],[61.2936,12.6311],[60.1179,12.3004],[59.4324,11.4683],[58.8561,11.0274],[59.4698,10.3566],[58.3133,8.382],[58.0789,7.0487],[58.5882,5.6658],[59.6632,5.3082],[61.971,4.9921],[62.6145,5.9129],[63.454,8.5534],[64.486,10.5277],[65.8797,12.3583],[67.8106,14.7611],[68.5632,16.4359],[69.8174,19.184],[70.2552,21.3784],[70.2021,23.0237],[71.0305,24.5465],[70.9863,26.37],[71.1855,28.1655]];
const map = L.map('map', { zoomControl: true, attributionControl: true });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);
function esc(value) {
  return String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function decisionRow(row) {
  if (!showMark) return '';
  const on = row.kind === 'aktuell';
  const label = row.busy ? 'Henter …' : 'Aktuell';
  return '<div class="decisions">'
    + '<button type="button" class="mark aktuell' + (on ? ' on' : '') + '" data-mark="aktuell" data-id="' + esc(row.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="Merk som aktuell">' + label + '</button>'
    + '<button type="button" class="mark uaktuell" data-mark="forkastet" data-id="' + esc(row.id) + '" aria-pressed="false" aria-label="Merk som uaktuell">Uaktuell</button>'
    + '</div>';
}
function popupHtml(row, index) {
  const kind = kindLabel || (row.kind === 'aktuell' ? 'Aktuell' : row.kind === 'uaktuell' ? 'Uaktuell' : 'Ny');
  const no = Number(row.mapNo) > 0 ? (row.mapNo + ' · ') : '';
  const where = row.coverage === 'land' ? 'Hele Norge · ikke stedbunden' : (row.label || 'Sted');
  const meta = [row.buyer, row.deadline ? ('Frist ' + row.deadline) : '', row.source].filter(Boolean).join(' · ');
  return '<div class="bubble">'
    + '<div class="kicker">' + no + kind + ' · ' + esc(where) + '</div>'
    + decisionRow(row)
    + '<button type="button" class="jump" data-open="' + esc(row.id) + '">' + esc(row.title) + '</button>'
    + (meta ? '<div class="meta">' + esc(meta) + '</div>' : '')
    + '<div class="row">'
    + '<button type="button" class="nav" data-act="prev" aria-label="Forrige sted">Forrige</button>'
    + '<span class="count">' + (index + 1) + ' / ' + pins.length + '</span>'
    + '<button type="button" class="nav" data-act="next" aria-label="Neste sted">Neste</button></div>'
    + '<button type="button" class="open" data-open="' + esc(row.id) + '">' + esc(openLabel) + '</button></div>';
}
const layer = L.featureGroup();
const markers = [];
let current = 0;
let picked = false;
let fitted = false;
let country = null;
let countryOn = false;
const popupPad = ${compact ? '[8, 12]' : '[12, 64]'};
const icon = (kind, on, mapNo) => {
  const n = Number(mapNo) || 0;
  const w = on ? 30 : (n ? 22 : 14);
  return L.divIcon({
    className: '',
    html: '<div class="pin ' + kind + (on ? ' on' : '') + (n ? ' num' : '') + (picked && !on ? ' dim' : '') + '">' + (n ? esc(String(n)) : '') + '</div>',
    iconSize: [w, w],
    iconAnchor: [Math.round(w / 2), Math.round(w / 2)],
  });
};
function paint() {
  markers.forEach((marker, i) => {
    if (!marker) return;
    const on = picked && i === current;
    marker.setIcon(icon(pins[i].kind, on, pins[i].mapNo));
    if (marker.setZIndexOffset) marker.setZIndexOffset(on ? 1200 : 0);
  });
  const row = pins[current];
  const title = document.getElementById('barTitle');
  const meta = document.getElementById('barMeta');
  if (row && title) title.textContent = (row.mapNo ? (row.mapNo + '  ') : '') + row.title;
  const where = row && row.coverage === 'land' ? 'Hele Norge · ikke stedbunden' : (row && row.label) || '';
  if (meta) meta.textContent = row ? ((current + 1) + ' / ' + pins.length + (where ? ' · ' + where : '')) : '';
}
function hideCountry() {
  if (country) map.removeLayer(country);
  country = null;
  countryOn = false;
}
function showCountry(index, refit) {
  const row = pins[index];
  if (!row) return;
  hideCountry();
  country = L.polygon(NORWAY, {
    color: brandColor,
    weight: 2,
    fillColor: brandColor,
    fillOpacity: 0.22,
    dashArray: '7 5',
  }).addTo(map);
  country.bindPopup(() => popupHtml(pins[index] || row, index), {
    maxWidth: 280, maxHeight: 300, autoPanPadding: popupPad, keepInView: false,
  });
  country.bindTooltip((row.mapNo ? row.mapNo + ' · ' : '') + 'Hele Norge · ikke stedbunden', {
    permanent: true, direction: 'center', className: 'land-tip',
  });
  country.on('click', () => {
    current = index;
    picked = true;
    paint();
    tell('preview', row.id);
  });
  if (refit) map.fitBounds(country.getBounds().pad(0.04), { maxZoom: 5, animate: false });
  countryOn = true;
  country.openPopup();
}
function tell(type, id, extra) {
  if (window.parent) window.parent.postMessage(Object.assign({ type: type, tenderId: id }, extra || {}), '*');
}
function show(index, { jump, pan, silent } = {}) {
  if (!pins.length) return;
  const prev = pins[current];
  current = (index + pins.length) % pins.length;
  const row = pins[current];
  picked = true;
  paint();
  if (row.coverage === 'land') {
    markers.forEach((marker) => { if (marker) marker.closePopup(); });
    showCountry(current, !(prev && prev.coverage === 'land'));
  } else {
    hideCountry();
    const marker = markers[current];
    if (marker && prev && prev.coverage === 'land') map.setView(marker.getLatLng(), 8);
    else if (pan !== false && marker) map.panTo(marker.getLatLng());
    if (marker) marker.openPopup();
  }
  if (!silent) tell('preview', row.id);
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
    coverage: row && row.coverage === 'land' ? 'land' : '',
    kind: row && (row.kind === 'aktuell' || row.kind === 'uaktuell') ? row.kind : 'ny',
    busy: !!(row && row.busy),
    mapNo: Number(row && row.mapNo) > 0 ? Number(row.mapNo) : 0,
  };
}
function sameIds(next) {
  if (next.length !== pins.length) return false;
  for (let i = 0; i < next.length; i += 1) {
    if (pins[i].id !== next[i].id) return false;
    if ((pins[i].coverage || '') !== (next[i].coverage || '')) return false;
  }
  return true;
}
function bindMarker(row) {
  const marker = L.marker([row.lat, row.lng], { icon: icon(row.kind, false, row.mapNo), title: row.mapNo ? (row.mapNo + ' ' + row.title) : row.title });
  marker.bindPopup(() => {
    const index = Math.max(0, pins.findIndex((item) => item.id === row.id));
    return popupHtml(pins[index] || row, index);
  }, { maxWidth: 280, maxHeight: 300, autoPanPadding: popupPad, keepInView: false });
  marker.on('click', () => {
    const at = pins.findIndex((item) => item.id === row.id);
    if (at < 0) return;
    current = at;
    picked = true;
    hideCountry();
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
  const prevIds = pins.map((row) => row.id);
  let shared = 0;
  next.forEach((row) => { if (prevIds.indexOf(row.id) >= 0) shared += 1; });
  const viewChanged = prevIds.length > 0 && shared === 0;
  hideCountry();
  markers.forEach((marker) => { if (marker) layer.removeLayer(marker); });
  markers.length = 0;
  pins.length = 0;
  next.forEach((row) => {
    if (!row.id) return;
    if (row.coverage !== 'land' && (!Number.isFinite(row.lat) || !Number.isFinite(row.lng))) return;
    pins.push(row);
  });
  pins.forEach((row) => {
    if (row.coverage === 'land') {
      markers.push(null);
      return;
    }
    const marker = bindMarker(row);
    marker.addTo(layer);
    markers.push(marker);
  });
  const placed = markers.filter(Boolean);
  if (placed.length && !layer._map) layer.addTo(map);
  if (placed.length && (!fitted || growing || viewChanged)) {
    map.fitBounds(layer.getBounds().pad(0.2), { maxZoom: 10 });
    fitted = true;
  }
  if (!pins.length) {
    current = 0;
    map.closePopup();
    paint();
    if (prevIds.length) {
      map.setView([64.5, 11.5], 4);
      fitted = false;
    }
    return;
  }
  let index = focusId ? pins.findIndex((row) => row.id === focusId) : -1;
  if (index < 0 && prevId) index = pins.findIndex((row) => row.id === prevId);
  const lost = !!(prevId && index < 0);
  if (index < 0) index = Math.min(Math.max(current, 0), pins.length - 1);
  if (focusId && pins[index] && pins[index].id === focusId) picked = true;
  current = index;
  paint();
  const row = pins[current];
  if (row && row.coverage === 'land') {
    showCountry(current, true);
    return;
  }
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
      const kind = src.kind === 'aktuell' || src.kind === 'uaktuell' ? src.kind : 'ny';
      const busy = row.id === busyId;
      if (row.lat !== src.lat || row.lng !== src.lng) {
        row.lat = src.lat;
        row.lng = src.lng;
        if (markers[i]) markers[i].setLatLng([src.lat, src.lng]);
        changed = true;
      }
      if (row.kind !== kind || !!row.busy !== busy || row.title !== src.title || row.mapNo !== src.mapNo) {
        row.kind = kind;
        row.busy = busy;
        row.mapNo = src.mapNo;
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
      if (pins[current] && pins[current].coverage === 'land' && country && country.isPopupOpen()) {
        country.setPopupContent(popupHtml(pins[current], current));
      }
    }
    return;
  }
  const id = event?.data?.id || event?.data?.tenderId;
  if (event?.data?.type === 'show' && id) {
    const index = pins.findIndex((row) => row.id === id);
    if (index >= 0) show(index, { pan: true, silent: !!event.data.silent });
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
