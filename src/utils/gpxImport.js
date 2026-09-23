/**
 * Lettvekts GPX / TCX-parser for tur- og treningsimport (Garmin, Apple, Polar m.fl.).
 * Ingen ekstra npm-avhengighet — kjører i nettleser og React Native.
 */

function textOf(el, tag) {
  if (!el) return '';
  const nodes = el.getElementsByTagName(tag);
  if (!nodes?.length) return '';
  return String(nodes[0].textContent || '').trim();
}

function numOf(el, tag) {
  const t = textOf(el, tag);
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function attr(el, name) {
  try {
    return el?.getAttribute?.(name) || '';
  } catch {
    return '';
  }
}

function parseXml(xmlText) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('XML-parser mangler i dette miljøet.');
  }
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const err = doc.getElementsByTagName('parsererror')?.[0];
  if (err) throw new Error('Ugyldig GPX/TCX-fil.');
  return doc;
}

function haversineM(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function downsample(points, max = 400) {
  if (!Array.isArray(points) || points.length <= max) return points || [];
  const step = Math.ceil(points.length / max);
  const out = [];
  for (let i = 0; i < points.length; i += step) out.push(points[i]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function metricsFromTrack(track) {
  let distanceM = 0;
  let elevationGainM = 0;
  let prev = null;
  const hrs = [];
  for (const p of track) {
    if (prev && Number.isFinite(p.lat) && Number.isFinite(p.lon)) {
      distanceM += haversineM(prev, p);
      if (Number.isFinite(p.ele) && Number.isFinite(prev.ele) && p.ele > prev.ele) {
        elevationGainM += p.ele - prev.ele;
      }
    }
    if (Number.isFinite(p.hr)) hrs.push(p.hr);
    prev = p;
  }
  let durationSec = null;
  const t0 = track[0]?.time ? Date.parse(track[0].time) : NaN;
  const t1 = track[track.length - 1]?.time ? Date.parse(track[track.length - 1].time) : NaN;
  if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) {
    durationSec = Math.round((t1 - t0) / 1000);
  }
  const avgHr = hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null;
  const maxHr = hrs.length ? Math.max(...hrs) : null;
  return {
    distanceM: Math.round(distanceM),
    elevationGainM: Math.round(elevationGainM),
    durationSec,
    avgHr,
    maxHr,
    startedAt: Number.isFinite(t0) ? new Date(t0).toISOString() : null,
  };
}

function guessType(name = '', sport = '') {
  const s = `${name} ${sport}`.toLowerCase();
  if (/hik|fjell|trail/.test(s)) return 'hiking';
  if (/run|løp|jog/.test(s)) return 'loping';
  if (/cycl|syk|bike|ride/.test(s)) return 'sykling';
  if (/swim|svøm/.test(s)) return 'svomming';
  if (/walk|gå|tur|hike/.test(s)) return 'tur';
  if (/strength|styrk|weight/.test(s)) return 'styrketrening';
  return 'tur';
}

function parseGpx(doc, fileName) {
  const trk = doc.getElementsByTagName('trk')[0] || doc.documentElement;
  const name = textOf(trk, 'name') || fileName.replace(/\.(gpx|tcx)$/i, '') || 'Importert tur';
  const typeHint = textOf(trk, 'type') || textOf(doc.documentElement, 'type');
  const pts = [];
  const trkpts = doc.getElementsByTagName('trkpt');
  for (let i = 0; i < trkpts.length; i += 1) {
    const el = trkpts[i];
    const lat = Number(attr(el, 'lat'));
    const lon = Number(attr(el, 'lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ele = numOf(el, 'ele');
    const time = textOf(el, 'time') || null;
    let hr = null;
    const ext = el.getElementsByTagName('extensions')[0];
    if (ext) {
      hr = numOf(ext, 'hr') ?? numOf(ext, 'heartrate') ?? numOf(ext, 'HeartRateBpm');
      const hrTag = ext.getElementsByTagNameNS?.('*', 'hr')?.[0]
        || ext.getElementsByTagName('gpxtpx:hr')?.[0];
      if (hr == null && hrTag) {
        const n = Number(hrTag.textContent);
        if (Number.isFinite(n)) hr = n;
      }
    }
    pts.push({ lat, lon, ele, time, hr });
  }
  const track = downsample(pts);
  const m = metricsFromTrack(track);
  let calories = null;
  const meta = doc.getElementsByTagName('metadata')[0];
  if (meta) calories = numOf(meta, 'calories');
  return {
    title: name,
    type: guessType(name, typeHint),
    sourceFormat: 'gpx',
    sourceFile: fileName,
    calories,
    weightKg: null,
    track,
    ...m,
  };
}

function parseTcx(doc, fileName) {
  const activities = doc.getElementsByTagName('Activity');
  const activity = activities[0] || doc.documentElement;
  const sport = attr(activity, 'Sport') || textOf(activity, 'Sport') || '';
  const name = textOf(activity, 'Name')
    || textOf(activity, 'Notes')
    || fileName.replace(/\.(gpx|tcx)$/i, '')
    || 'Importert tur';
  const pts = [];
  const tps = doc.getElementsByTagName('Trackpoint');
  for (let i = 0; i < tps.length; i += 1) {
    const el = tps[i];
    const lat = numOf(el, 'LatitudeDegrees');
    const lon = numOf(el, 'LongitudeDegrees');
    if (lat == null || lon == null) continue;
    const ele = numOf(el, 'AltitudeMeters');
    const time = textOf(el, 'Time') || null;
    const hr = numOf(el, 'Value'); // HeartRateBpm/Value — first Value may be HR
    const hrNode = el.getElementsByTagName('HeartRateBpm')[0];
    const hrVal = hrNode ? numOf(hrNode, 'Value') : hr;
    pts.push({ lat, lon, ele, time, hr: hrVal });
  }
  const track = downsample(pts);
  const m = metricsFromTrack(track);
  const lap = doc.getElementsByTagName('Lap')[0];
  const calories = lap ? numOf(lap, 'Calories') : null;
  const distanceOverride = lap ? numOf(lap, 'DistanceMeters') : null;
  const totalTime = lap ? numOf(lap, 'TotalTimeSeconds') : null;
  return {
    title: name,
    type: guessType(name, sport),
    sourceFormat: 'tcx',
    sourceFile: fileName,
    calories,
    weightKg: null,
    track,
    ...m,
    distanceM: distanceOverride != null ? Math.round(distanceOverride) : m.distanceM,
    durationSec: totalTime != null ? Math.round(totalTime) : m.durationSec,
  };
}

/**
 * @param {string} xmlText
 * @param {string} [fileName]
 * @returns {object} normalized workout
 */
export function parseGpxOrTcx(xmlText, fileName = 'import.gpx') {
  const text = String(xmlText || '').trim();
  if (!text) throw new Error('Tom fil.');
  const doc = parseXml(text);
  const root = (doc.documentElement?.localName || doc.documentElement?.tagName || '').toLowerCase();
  if (root.includes('gpx') || text.includes('<gpx')) {
    return parseGpx(doc, fileName);
  }
  if (root.includes('trainingcenter') || root.includes('tcx') || text.includes('<TrainingCenterDatabase')) {
    return parseTcx(doc, fileName);
  }
  // Fallback: try GPX first
  try {
    return parseGpx(doc, fileName);
  } catch {
    return parseTcx(doc, fileName);
  }
}

/** Velg GPX/TCX-fil (web). Returnerer { name, text } eller null. */
export function pickGpxOrTcxFile() {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('Filimport støttes i nettleseren. Åpne ProTop på web for å laste inn GPX/TCX.'));
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,.tcx,application/gpx+xml,application/xml,text/xml';
    input.style.display = 'none';
    const cleanup = () => {
      try { input.remove(); } catch { /* ignore */ }
    };
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const text = await file.text();
        resolve({ name: file.name, text });
      } catch (e) {
        reject(e);
      } finally {
        cleanup();
      }
    };
    input.addEventListener('cancel', () => {
      cleanup();
      resolve(null);
    });
    document.body.appendChild(input);
    input.click();
  });
}

export function formatDistanceKm(meters) {
  if (meters == null || !Number.isFinite(meters)) return '—';
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(2)} km` : `${km.toFixed(1)} km`;
}

export function formatDuration(sec) {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} t ${m} min`;
  return `${m} min`;
}

export function formatCalories(kcal) {
  if (kcal == null || !Number.isFinite(kcal)) return '—';
  return `${Math.round(kcal)} kcal`;
}
