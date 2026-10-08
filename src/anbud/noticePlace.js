/** Sted for anbudstreff: fylke, kommune og land — uten innlogging. */

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9æøå]+/g, ' ')
    .trim();
}

function token(value) {
  return fold(value).replace(/ /g, '');
}

const FYLKER = [
  { id: 'NO081', name: 'Oslo', aliases: ['oslove'], lat: 59.9139, lng: 10.7522 },
  { id: 'NO084', name: 'Akershus', aliases: [], lat: 59.928, lng: 11.16 },
  { id: 'NO083', name: 'Østfold', aliases: ['ostfold'], lat: 59.27, lng: 11.11 },
  { id: 'NO085', name: 'Buskerud', aliases: [], lat: 59.74, lng: 9.91 },
  { id: 'NO020', name: 'Innlandet', aliases: ['hedmark', 'oppland'], lat: 61.12, lng: 10.47 },
  { id: 'NO093', name: 'Vestfold', aliases: [], lat: 59.27, lng: 10.41 },
  { id: 'NO094', name: 'Telemark', aliases: [], lat: 59.21, lng: 9.61 },
  { id: 'NO092', name: 'Agder', aliases: ['aust agder', 'vest agder'], lat: 58.34, lng: 8.08 },
  { id: 'NO0A1', name: 'Rogaland', aliases: [], lat: 58.97, lng: 5.73 },
  { id: 'NO0A2', name: 'Vestland', aliases: ['hordaland', 'sogn og fjordane'], lat: 60.39, lng: 5.32 },
  { id: 'NO0A3', name: 'Møre og Romsdal', aliases: ['more og romsdal', 'more'], lat: 62.74, lng: 7.16 },
  { id: 'NO060', name: 'Trøndelag', aliases: ['trondelag', 'troondelage', 'sor trondelag', 'nord trondelag'], lat: 63.43, lng: 10.39 },
  { id: 'NO071', name: 'Nordland', aliases: ['nordlannda'], lat: 67.28, lng: 14.40 },
  { id: 'NO072', name: 'Troms', aliases: ['romsa', 'tromssa'], lat: 69.65, lng: 18.96 },
  { id: 'NO073', name: 'Finnmark', aliases: ['finnmarku', 'finnmarcu'], lat: 70.07, lng: 24.93 },
];

const LAND = [
  { codes: ['nor', 'no', 'norge', 'norway'], label: 'Norge', lat: 64.0, lng: 12.5 },
  { codes: ['swe', 'se', 'sverige', 'sweden', 'sverja'], label: 'Sverige', lat: 62.0, lng: 15.0 },
  { codes: ['dnk', 'dk', 'danmark', 'denmark'], label: 'Danmark', lat: 56.26, lng: 9.5 },
  { codes: ['fin', 'fi', 'finland', 'suomi'], label: 'Finland', lat: 64.0, lng: 26.0 },
  { codes: ['deu', 'de', 'tyskland', 'germany'], label: 'Tyskland', lat: 51.16, lng: 10.45 },
  { codes: ['nld', 'nl', 'nederland', 'netherlands'], label: 'Nederland', lat: 52.13, lng: 5.29 },
  { codes: ['gbr', 'gb', 'uk', 'storbritannia'], label: 'Storbritannia', lat: 54.5, lng: -2.5 },
  { codes: ['eu', 'europe', 'europa'], label: 'Europa', lat: 50.0, lng: 10.0 },
];

/** Vanlige utførelsessteder i Doffin/TED. Koordinater er kommunesentrum. */
const STEDER = [
  ['Oslo', 59.9139, 10.7522],
  ['Bergen', 60.3913, 5.3221],
  ['Trondheim', 63.4305, 10.3951],
  ['Stavanger', 58.9700, 5.7331],
  ['Kristiansand', 58.1599, 8.0182],
  ['Drammen', 59.7440, 10.2045],
  ['Tromsø', 69.6492, 18.9553],
  ['Fredrikstad', 59.2181, 10.9298],
  ['Sandnes', 58.8526, 5.7352],
  ['Asker', 59.8330, 10.4350],
  ['Bærum', 59.8945, 10.5260],
  ['Ålesund', 62.4722, 6.1549],
  ['Sandefjord', 59.1310, 10.2166],
  ['Bodø', 67.2804, 14.4049],
  ['Larvik', 59.0535, 10.0352],
  ['Lillestrøm', 59.9550, 11.0490],
  ['Sarpsborg', 59.2839, 11.1096],
  ['Tønsberg', 59.2676, 10.4076],
  ['Skien', 59.2096, 9.6090],
  ['Porsgrunn', 59.1405, 9.6561],
  ['Arendal', 58.4615, 8.7724],
  ['Haugesund', 59.4138, 5.2680],
  ['Moss', 59.4340, 10.6577],
  ['Sandvika', 59.8920, 10.5270],
  ['Lørenskog', 59.8330, 10.9590],
  ['Ullensaker', 60.1440, 11.1730],
  ['Nordre Follo', 59.7330, 10.8660],
  ['Kongsberg', 59.6689, 9.6502],
  ['Hamar', 60.7945, 11.0680],
  ['Gjøvik', 60.7957, 10.6915],
  ['Lillehammer', 61.1153, 10.4662],
  ['Molde', 62.7375, 7.1607],
  ['Kristiansund', 63.1105, 7.7280],
  ['Steinkjer', 64.0149, 11.4953],
  ['Stjørdal', 63.4712, 10.9189],
  ['Levanger', 63.7460, 11.2996],
  ['Namsos', 64.4664, 11.4958],
  ['Harstad', 68.7983, 16.5417],
  ['Narvik', 68.4384, 17.4272],
  ['Mo i Rana', 66.3128, 14.1428],
  ['Mosjøen', 65.8360, 13.1930],
  ['Fauske', 67.2588, 15.3918],
  ['Vefsn', 65.8400, 13.2000],
  ['Rana', 66.3128, 14.1428],
  ['Alta', 69.9689, 23.2717],
  ['Hammerfest', 70.6632, 23.6821],
  ['Kirkenes', 69.7271, 30.0458],
  ['Vadsø', 70.0735, 29.7497],
  ['Sør-Varanger', 69.7271, 30.0458],
  ['Halden', 59.1248, 11.3878],
  ['Indre Østfold', 59.5510, 11.3330],
  ['Karmøy', 59.2800, 5.2500],
  ['Sola', 58.8885, 5.6520],
  ['Time', 58.7350, 5.6500],
  ['Klepp', 58.7770, 5.6320],
  ['Eigersund', 58.4513, 5.9990],
  ['Grimstad', 58.3405, 8.5934],
  ['Mandal', 58.0274, 7.4533],
  ['Farsund', 58.0948, 6.8047],
  ['Lindesnes', 58.0274, 7.4533],
  ['Horten', 59.4174, 10.4834],
  ['Holmestrand', 59.4876, 10.3176],
  ['Kongsvinger', 60.1905, 12.0078],
  ['Elverum', 60.8819, 11.5623],
  ['Ringsaker', 60.8820, 10.9500],
  ['Ullensvang', 60.3260, 6.6540],
  ['Voss', 60.6280, 6.4150],
  ['Askøy', 60.4610, 5.1820],
  ['Øygarden', 60.5000, 4.9000],
  ['Bjørnafjorden', 60.1800, 5.4700],
  ['Alver', 60.6200, 5.2600],
  ['Sogndal', 61.2290, 7.1000],
  ['Førde', 61.4522, 5.8570],
  ['Florø', 61.5996, 5.0328],
  ['Sunndal', 62.6750, 8.5630],
  ['Åndalsnes', 62.5670, 7.6870],
  ['Rauma', 62.5670, 7.6870],
  ['Aure', 63.2640, 8.5290],
  ['Kristiansund', 63.1105, 7.7280],
  ['Orkanger', 63.3060, 9.8500],
  ['Orkland', 63.3060, 9.8500],
  ['Melhus', 63.2840, 10.2780],
  ['Malvik', 63.4330, 10.7550],
  ['Verdal', 63.7930, 11.4820],
  ['Røros', 62.5747, 11.3842],
  ['Oppdal', 62.5940, 9.6910],
  ['Nærøysund', 64.8620, 11.2390],
  ['Brønnøysund', 65.4681, 12.2077],
  ['Brønnøy', 65.4681, 12.2077],
  ['Sandnessjøen', 66.0217, 12.6316],
  ['Alstahaug', 66.0217, 12.6316],
  ['Sortland', 68.6960, 15.4120],
  ['Svolvær', 68.2340, 14.5630],
  ['Vågan', 68.2340, 14.5630],
  ['Leknes', 68.1470, 13.6110],
  ['Vestvågøy', 68.1470, 13.6110],
  ['Finnsnes', 69.2290, 17.9810],
  ['Senja', 69.2290, 17.9810],
  ['Bardufoss', 69.0640, 18.5150],
  ['Målselv', 69.0640, 18.5150],
  ['Lakselv', 70.0510, 24.9720],
  ['Porsanger', 70.0510, 24.9720],
  ['Karasjok', 69.4720, 25.5110],
  ['Kautokeino', 69.0120, 23.0410],
  ['Ås', 59.6640, 10.7940],
  ['Ski', 59.7190, 10.8370],
  ['Nesodden', 59.8000, 10.6500],
  ['Nittedal', 60.0730, 10.8720],
  ['Rælingen', 59.9250, 11.0660],
  ['Enebakk', 59.7640, 11.1440],
  ['Vestby', 59.6030, 10.7500],
  ['Frogn', 59.6690, 10.6350],
  ['Nannestad', 60.2160, 11.0230],
  ['Eidsvoll', 60.3280, 11.2080],
  ['Nes', 60.1220, 11.3900],
  ['Kongsvinger', 60.1905, 12.0078],
  ['Elverum', 60.8819, 11.5623],
  ['Ringerike', 60.1680, 10.2560],
  ['Hønefoss', 60.1680, 10.2560],
  ['Modum', 59.9700, 9.9800],
  ['Øvre Eiker', 59.7700, 9.9100],
  ['Kongsberg', 59.6689, 9.6502],
  ['Notodden', 59.5590, 9.2590],
  ['Bamble', 59.0000, 9.6700],
  ['Kragerø', 58.8690, 9.4150],
  ['Risør', 58.7210, 9.2340],
  ['Tvedestrand', 58.6220, 8.9310],
  ['Lillesand', 58.2490, 8.3770],
  ['Vennesla', 58.2690, 7.9730],
  ['Søgne', 58.0960, 7.8140],
  ['Flekkefjord', 58.2970, 6.6600],
  ['Egersund', 58.4513, 5.9990],
  ['Bryne', 58.7350, 5.6470],
  ['Jæren', 58.7350, 5.6500],
  ['Randaberg', 59.0010, 5.6200],
  ['Strand', 59.0630, 6.0460],
  ['Sauda', 59.6500, 6.3540],
  ['Odda', 60.0690, 6.5460],
  ['Ulvik', 60.5670, 6.9170],
  ['Kvinnherad', 59.9840, 6.0070],
  ['Stord', 59.7790, 5.5000],
  ['Fitjar', 59.9170, 5.3170],
  ['Os', 60.1860, 5.4730],
  ['Førde', 61.4522, 5.8570],
  ['Stryn', 61.9040, 6.7230],
  ['Nordfjordeid', 61.9060, 5.9850],
  ['Stad', 61.9110, 5.2700],
  ['Ålesund', 62.4722, 6.1549],
  ['Ulstein', 62.3440, 5.8480],
  ['Hareid', 62.3700, 6.0300],
  ['Ørsta', 62.1990, 6.1320],
  ['Volda', 62.1460, 6.0710],
  ['Åndalsnes', 62.5670, 7.6870],
  ['Kristiansund', 63.1105, 7.7280],
];

const FYLKE_BY_ID = new Map(FYLKER.map((row) => [row.id, row]));
const FYLKE_BY_KEY = new Map();
for (const row of FYLKER) {
  FYLKE_BY_KEY.set(token(row.name), row);
  for (const alias of row.aliases) FYLKE_BY_KEY.set(token(alias), row);
}

const STED_BY_KEY = new Map();
for (const [name, lat, lng] of STEDER) {
  const key = token(name);
  if (!STED_BY_KEY.has(key)) STED_BY_KEY.set(key, { name, lat, lng, precision: 'sted' });
}
for (const [alias, name] of [['aura', 'Aure'], ['trondhjem', 'Trondheim'], ['kristiania', 'Oslo'], ['tromso', 'Tromsø']]) {
  const hit = STED_BY_KEY.get(token(name));
  if (hit) STED_BY_KEY.set(alias, hit);
}

const LAND_BY_KEY = new Map();
for (const row of LAND) {
  for (const code of row.codes) LAND_BY_KEY.set(token(code), row);
}

function partsFrom(values) {
  const out = [];
  for (const value of Array.isArray(values) ? values : [values]) {
    String(value || '')
      .split(/[,;/|]+/)
      .map((part) => part.replace(/\([^)]*\)/g, ' ').trim())
      .filter((part) => part.length >= 2)
      .forEach((part) => out.push(part));
  }
  return out;
}

function lookupKey(raw) {
  const key = token(raw);
  if (!key || key.length < 2) return null;
  if (STED_BY_KEY.has(key)) {
    const hit = STED_BY_KEY.get(key);
    return { lat: hit.lat, lng: hit.lng, label: hit.name, precision: 'sted', source: 'oppslag' };
  }
  if (FYLKE_BY_KEY.has(key)) {
    const hit = FYLKE_BY_KEY.get(key);
    return { lat: hit.lat, lng: hit.lng, label: hit.name, precision: 'fylke', source: 'oppslag' };
  }
  if (LAND_BY_KEY.has(key)) {
    const hit = LAND_BY_KEY.get(key);
    return { lat: hit.lat, lng: hit.lng, label: hit.label, precision: 'land', source: 'oppslag' };
  }
  return null;
}

function lookupInText(raw) {
  const text = fold(raw);
  if (!text) return null;
  let best = null;
  for (const [key, hit] of STED_BY_KEY) {
    if (key.length < 4 && text !== key) continue;
    if (text === key || text.includes(` ${key} `) || text.startsWith(`${key} `) || text.endsWith(` ${key}`)) {
      if (!best || key.length > token(best.label).length) {
        best = { lat: hit.lat, lng: hit.lng, label: hit.name, precision: 'sted', source: 'tekst' };
      }
    }
  }
  if (best) return best;
  for (const [key, hit] of FYLKE_BY_KEY) {
    if (key.length < 5) continue;
    if (text.includes(fold(hit.name)) || (hit.aliases || []).some((alias) => text.includes(fold(alias)))) {
      return { lat: hit.lat, lng: hit.lng, label: hit.name, precision: 'fylke', source: 'tekst' };
    }
  }
  return null;
}

export function locateNotice(notice) {
  const stored = notice?.geo;
  const lat = Number(stored?.lat);
  const lng = Number(stored?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return {
      lat,
      lng,
      label: String(stored.label || '').trim() || 'Sted',
      precision: stored.precision || 'sted',
      source: stored.source || 'lagret',
    };
  }
  for (const id of Array.isArray(notice?.locationIds) ? notice.locationIds : []) {
    const fylke = FYLKE_BY_ID.get(String(id || '').trim());
    if (fylke) return { lat: fylke.lat, lng: fylke.lng, label: fylke.name, precision: 'fylke', source: 'nuts' };
  }
  for (const part of partsFrom(notice?.places)) {
    const hit = lookupKey(part);
    if (hit && hit.precision !== 'land') return hit;
  }
  const fromTitle = lookupInText(notice?.title);
  if (fromTitle) return fromTitle;
  const fromBuyer = lookupInText(notice?.buyer);
  if (fromBuyer) return fromBuyer;
  for (const part of partsFrom(notice?.places)) {
    const hit = lookupKey(part);
    if (hit) return hit;
  }
  return null;
}

export function geocodeQuery(notice) {
  const parts = partsFrom(notice?.places).filter((part) => {
    const key = token(part);
    return key.length >= 3 && !LAND_BY_KEY.has(key) && !/^no[0-9a-z]+$/i.test(part);
  });
  return parts[0] || '';
}

function offset(lat, lng, index) {
  const angle = index * 2.399;
  const radius = 0.06 * Math.sqrt(index);
  return {
    lat: lat + Math.cos(angle) * radius,
    lng: lng + Math.sin(angle) * radius * 1.6,
  };
}

export function nextMapPinIndex(count, previousIndex) {
  const total = Number(count) || 0;
  if (total <= 0) return -1;
  const index = Number(previousIndex);
  const safe = Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
  return Math.min(safe, total - 1);
}

export function mapCandidateNotices(notices, expired) {
  return (Array.isArray(notices) ? notices : []).filter((row) => {
    const decision = row?.decision || 'ubestemt';
    if (decision === 'forkastet' || decision === 'arkiv' || decision === 'ikke' || decision === 'tilbud') return false;
    if (decision === 'aktuell') return true;
    if (decision !== 'ubestemt') return false;
    return typeof expired === 'function' ? !expired(row) : true;
  });
}

function dayLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

export function mapPinsForNotices(notices, { expired } = {}) {
  const rows = mapCandidateNotices(notices, expired);
  const counts = new Map();
  const pins = [];
  for (const row of rows) {
    const hit = locateNotice(row);
    if (!hit) continue;
    const bucket = `${hit.lat.toFixed(3)},${hit.lng.toFixed(3)}`;
    const n = counts.get(bucket) || 0;
    counts.set(bucket, n + 1);
    const point = n ? offset(hit.lat, hit.lng, n) : hit;
    pins.push({
      id: row.id,
      title: String(row.title || 'Kunngjøring').slice(0, 120),
      buyer: String(row.buyer || '').slice(0, 80),
      deadline: dayLabel(row.deadline),
      source: row.source === 'ted' ? 'TED' : 'Doffin',
      label: hit.label,
      lat: point.lat,
      lng: point.lng,
      precision: hit.precision,
      kind: (row.decision || 'ubestemt') === 'aktuell' ? 'aktuell' : 'ny',
    });
  }
  pins.sort((a, b) => b.lat - a.lat || a.lng - b.lng);
  return pins;
}

export { FYLKER };
