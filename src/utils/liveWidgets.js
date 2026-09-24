/**
 * Åpne widget-kilder for voksne på hjemskjermen.
 * Nyheter, aksje, strøm, valuta, helligdag og luftkvalitet.
 * Rene funksjoner + fetch med injiserbar fetch/proxy (ingen React).
 */

export const LIVE_WIDGET_KEY = 'weekplan.liveWidgets.v1';

export const LIVE_WIDGETS = [
  { id: 'news', title: 'Siste nytt', icon: 'newspaper-outline' },
  { id: 'stocks', title: 'Aksje', icon: 'trending-up-outline' },
  { id: 'power', title: 'Strømpris', icon: 'flash-outline' },
  { id: 'fx', title: 'Valuta', icon: 'cash-outline' },
  { id: 'holiday', title: 'Helligdag', icon: 'flag-outline' },
  { id: 'air', title: 'Luft', icon: 'leaf-outline' },
];

export const LIVE_WIDGET_IDS = LIVE_WIDGETS.map((w) => w.id);

export const NEWS_SOURCES = [
  {
    id: 'vg',
    name: 'VG',
    kind: 'vg-json',
    url: 'https://www.vg.no/rss/feed/?format=json&limit=6',
    home: 'https://www.vg.no/',
  },
  {
    id: 'dn',
    name: 'DN',
    kind: 'rss',
    url: 'https://services.dn.no/api/feed/rss/nyheter',
    home: 'https://www.dn.no/',
  },
  {
    id: 'nrk',
    name: 'NRK',
    kind: 'rss',
    url: 'https://www.nrk.no/toppsaker.rss',
    home: 'https://www.nrk.no/',
  },
  {
    id: 'ap',
    name: 'Aftenposten',
    kind: 'rss',
    url: 'https://www.aftenposten.no/rss',
    home: 'https://www.aftenposten.no/',
  },
  {
    id: 'e24',
    name: 'E24',
    kind: 'rss',
    url: 'https://e24.no/rss',
    home: 'https://e24.no/',
  },
];

export const POWER_ZONES = [
  { id: 'NO1', label: 'Øst' },
  { id: 'NO2', label: 'Sør' },
  { id: 'NO3', label: 'Midt' },
  { id: 'NO4', label: 'Nord' },
  { id: 'NO5', label: 'Vest' },
];

export const POPULAR_STOCKS = [
  { symbol: 'EQNR.OL', name: 'Equinor' },
  { symbol: 'DNB.OL', name: 'DNB' },
  { symbol: 'TEL.OL', name: 'Telenor' },
  { symbol: 'NHY.OL', name: 'Norsk Hydro' },
  { symbol: 'MOWI.OL', name: 'Mowi' },
  { symbol: 'ORK.OL', name: 'Orkla' },
  { symbol: 'KOG.OL', name: 'Kongsberg' },
  { symbol: 'YAR.OL', name: 'Yara' },
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
];

export const FX_CURRENCIES = [
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Pund' },
  { code: 'SEK', name: 'Svenske kroner' },
  { code: 'DKK', name: 'Danske kroner' },
  { code: 'ISK', name: 'Islandske kroner' },
  { code: 'CHF', name: 'Franc' },
  { code: 'JPY', name: 'Yen' },
  { code: 'AUD', name: 'Australske dollar' },
  { code: 'CAD', name: 'Canadiske dollar' },
  { code: 'PLN', name: 'Zloty' },
];

export const FX_CURRENCY_CODES = FX_CURRENCIES.map((c) => c.code);
export const MAX_FOLLOWED_STOCKS = 8;
export const MAX_FOLLOWED_FX = 8;

export const DEFAULT_LIVE_PREFS = {
  enabled: ['news', 'stocks', 'power', 'fx'],
  newsSource: 'vg',
  stockSymbol: 'EQNR.OL',
  stockSymbols: ['EQNR.OL'],
  powerZone: 'NO1',
  powerZoneAuto: true,
  fxCodes: ['USD', 'EUR', 'GBP', 'SEK'],
};

const TTL = {
  news: 5 * 60 * 1000,
  stocks: 2 * 60 * 1000,
  power: 20 * 60 * 1000,
  fx: 6 * 60 * 60 * 1000,
  holiday: 12 * 60 * 60 * 1000,
  air: 30 * 60 * 1000,
};

const PROXY_HOSTS = new Set([
  'www.vg.no',
  'vg.no',
  'services.dn.no',
  'e24.no',
  'www.e24.no',
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
]);

const cache = new Map();
const inflight = new Map();

export function clearLiveWidgetCache() {
  cache.clear();
  inflight.clear();
}

export function hostNeedsProxy(url) {
  try {
    return PROXY_HOSTS.has(new URL(String(url)).hostname);
  } catch {
    return false;
  }
}

export function newsSourceById(id) {
  return NEWS_SOURCES.find((s) => s.id === id) || NEWS_SOURCES[0];
}

export function normalizeStockSymbol(value) {
  const sym = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!/^[A-Z0-9][A-Z0-9.^=-]{0,14}$/.test(sym)) return '';
  return sym;
}

export function normalizeStockSymbols(list, fallbackSymbol, { allowEmpty = false } = {}) {
  const raw = [
    ...(Array.isArray(list) ? list : []),
    fallbackSymbol,
  ].map(normalizeStockSymbol).filter(Boolean);
  const symbols = [...new Set(raw)].slice(0, MAX_FOLLOWED_STOCKS);
  if (symbols.length) return symbols;
  return allowEmpty ? [] : [...DEFAULT_LIVE_PREFS.stockSymbols];
}

export function normalizeFxCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return FX_CURRENCY_CODES.includes(code) ? code : '';
}

export function normalizeFxCodes(list) {
  const codes = [...new Set((Array.isArray(list) ? list : []).map(normalizeFxCode).filter(Boolean))]
    .slice(0, MAX_FOLLOWED_FX);
  return codes.length ? codes : [...DEFAULT_LIVE_PREFS.fxCodes];
}

export function stockDisplayName(symbol) {
  const sym = normalizeStockSymbol(symbol);
  return POPULAR_STOCKS.find((s) => s.symbol === sym)?.name || sym;
}

export function fxUrl(codes) {
  const safe = normalizeFxCodes(codes);
  return `https://data.norges-bank.no/api/data/EXR/B.${safe.join('+')}.NOK.SP?lastNObservations=2&format=csv&locale=no`;
}

export function normalizeLivePrefs(raw, { zone } = {}) {
  const base = {
    ...DEFAULT_LIVE_PREFS,
    powerZone: POWER_ZONES.some((z) => z.id === zone) ? zone : DEFAULT_LIVE_PREFS.powerZone,
  };
  if (!raw || typeof raw !== 'object') return { ...base, stockSymbols: [...base.stockSymbols], fxCodes: [...base.fxCodes] };
  const enabled = Array.isArray(raw.enabled)
    ? [...new Set(raw.enabled.filter((id) => LIVE_WIDGET_IDS.includes(id)))]
    : base.enabled;
  const newsSource = NEWS_SOURCES.some((s) => s.id === raw.newsSource) ? raw.newsSource : base.newsSource;
  const stockSymbols = normalizeStockSymbols(raw.stockSymbols, raw.stockSymbol, { allowEmpty: true });
  const stockSymbol = stockSymbols[0] || base.stockSymbol;
  const powerZone = POWER_ZONES.some((z) => z.id === raw.powerZone) ? raw.powerZone : base.powerZone;
  const powerZoneAuto = raw.powerZoneAuto !== false;
  const fxCodes = normalizeFxCodes(raw.fxCodes);
  return { enabled, newsSource, stockSymbol, stockSymbols, powerZone, powerZoneAuto, fxCodes };
}

/**
 * Grovt prisområde ut fra koordinat. Brukeren kan overstyre.
 * Oslo → NO1, Stavanger → NO2, Trondheim → NO3, Tromsø → NO4, Bergen → NO5.
 */
export function suggestPowerZone(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'NO1';
  if (la >= 66.5) return 'NO4';
  if (la >= 62.5) return 'NO3';
  if (ln < 7.2 && la >= 59 && la < 62.5) return 'NO5';
  if (la < 59.6 && ln < 9.2) return 'NO2';
  if (ln < 6.2) return 'NO2';
  return 'NO1';
}

/** Strømpris følger stedet ditt inntil brukeren velger et område selv. */
export function effectivePowerZone(prefs, { lat, lng } = {}) {
  const safe = prefs && typeof prefs === 'object' ? prefs : {};
  if (safe.powerZoneAuto !== false) return suggestPowerZone(lat, lng);
  return POWER_ZONES.some((z) => z.id === safe.powerZone) ? safe.powerZone : suggestPowerZone(lat, lng);
}

export function formatNb(value, digits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return n.toLocaleString('nb-NO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  } catch {
    return n.toFixed(digits).replace('.', ',');
  }
}

export function formatSignedPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const body = formatNb(Math.abs(n), 1);
  if (n > 0) return `+${body} %`;
  if (n < 0) return `-${body} %`;
  return `${body} %`;
}

function osloDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Oslo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const bag = {};
  fmt.formatToParts(date).forEach((p) => {
    if (p.type !== 'literal') bag[p.type] = p.value;
  });
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    date: `${bag.year}-${bag.month}-${bag.day}`,
    hour: Number.isFinite(hour) ? hour : 0,
  };
}

export function powerPriceUrl(zone, date = new Date()) {
  const z = POWER_ZONES.some((item) => item.id === zone) ? zone : 'NO1';
  const { date: day } = osloDateParts(date);
  const [y, m, d] = day.split('-');
  return `https://www.hvakosterstrommen.no/api/v1/prices/${y}/${m}-${d}_${z}.json`;
}

export function stockChartUrl(symbol, { host = 'query1.finance.yahoo.com' } = {}) {
  const sym = normalizeStockSymbol(symbol);
  if (!sym) {
    const err = new Error('Ugyldig aksjesymbol');
    err.code = 'invalid-symbol';
    throw err;
  }
  const safeHost = host === 'query2.finance.yahoo.com' ? host : 'query1.finance.yahoo.com';
  return `https://${safeHost}/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
}

export const FX_URL = fxUrl(DEFAULT_LIVE_PREFS.fxCodes);
export const HOLIDAY_URL = 'https://date.nager.at/api/v3/NextPublicHolidays/NO';

export function airQualityUrl(lat, lng) {
  const params = new URLSearchParams({
    latitude: Number(lat).toFixed(3),
    longitude: Number(lng).toFixed(3),
    current: 'european_aqi,pm2_5',
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${params.toString()}`;
}

export function widgetRequests(prefs, { lat, lng, now = new Date() } = {}) {
  const safe = normalizeLivePrefs(prefs);
  const enabled = new Set(safe.enabled);
  const reqs = [];
  if (enabled.has('news')) {
    const src = newsSourceById(safe.newsSource);
    reqs.push({ id: 'news', url: src.url });
  }
  if (enabled.has('stocks')) {
    safe.stockSymbols.forEach((symbol) => {
      try {
        reqs.push({ id: `stocks:${symbol}`, url: stockChartUrl(symbol) });
      } catch { /* skip invalid */ }
    });
  }
  if (enabled.has('power')) {
    reqs.push({ id: 'power', url: powerPriceUrl(effectivePowerZone(safe, { lat, lng }), now) });
  }
  if (enabled.has('fx')) reqs.push({ id: 'fx', url: fxUrl(safe.fxCodes) });
  if (enabled.has('holiday')) reqs.push({ id: 'holiday', url: HOLIDAY_URL });
  if (enabled.has('air') && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    reqs.push({ id: 'air', url: airQualityUrl(lat, lng) });
  }
  return reqs;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function tagText(block, name) {
  const re = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  const m = re.exec(block);
  return m ? m[1] : '';
}

export function formatFeedTime(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 24);
  try {
    return d.toLocaleString('nb-NO', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value).slice(0, 16);
  }
}

export function parseVgNews(json, { limit = 5 } = {}) {
  const list = Array.isArray(json) ? json : (Array.isArray(json?.items) ? json.items : []);
  return list.slice(0, limit).map((item) => ({
    id: String(item?.id || item?.url || item?.title || ''),
    title: String(item?.title || '').trim(),
    summary: String(item?.preamble || '').trim(),
    url: String(item?.url || item?.persistentUrl || ''),
    source: 'VG',
    time: item?.published?.niceformat || formatFeedTime(item?.published?.timestamp),
  })).filter((item) => item.title && /^https:\/\//.test(item.url));
}

export function parseRssItems(xml, { limit = 5, source = '' } = {}) {
  const items = [];
  const re = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match = re.exec(String(xml || ''));
  while (match && items.length < limit) {
    const block = match[1];
    const title = decodeXml(tagText(block, 'title'));
    const link = decodeXml(tagText(block, 'link') || tagText(block, 'guid'));
    const summary = decodeXml(tagText(block, 'description')).slice(0, 180);
    const pub = decodeXml(tagText(block, 'pubDate') || tagText(block, 'dc:date'));
    if (title && /^https?:\/\//.test(link)) {
      items.push({
        id: link,
        title,
        summary,
        url: link.replace(/^http:\/\//i, 'https://'),
        source,
        time: formatFeedTime(pub),
      });
    }
    match = re.exec(String(xml || ''));
  }
  return items;
}

export function parseYahooChart(json) {
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const price = Number(meta?.regularMarketPrice);
  if (!meta || !Number.isFinite(price)) return null;
  const prev = Number(meta.chartPreviousClose ?? meta.previousClose);
  const change = Number.isFinite(prev) ? price - prev : null;
  const changePct = Number.isFinite(prev) && prev !== 0 ? (change / prev) * 100 : null;
  const closes = Array.isArray(result?.indicators?.quote?.[0]?.close)
    ? result.indicators.quote[0].close.map(Number).filter((n) => Number.isFinite(n)).slice(-8)
    : [];
  return {
    symbol: meta.symbol || '',
    name: meta.shortName || meta.longName || meta.symbol || '',
    price,
    currency: meta.currency || '',
    change,
    changePct: Number.isFinite(changePct) ? changePct : null,
    exchange: meta.exchangeName || '',
    closes,
  };
}

export function stockQuotesFromData(data) {
  if (!data) return [];
  if (Array.isArray(data.quotes)) return data.quotes.filter(Boolean);
  if (Number.isFinite(Number(data.price))) return [data];
  return [];
}

export function parsePowerPrices(rows, { now = new Date() } = {}) {
  const list = (Array.isArray(rows) ? rows : []).map((row) => ({
    start: new Date(row?.time_start),
    end: new Date(row?.time_end),
    nok: Number(row?.NOK_per_kWh),
  })).filter((row) => Number.isFinite(row.nok) && !Number.isNaN(row.start.getTime()));
  if (!list.length) return null;
  const current = list.find((row) => now >= row.start && now < row.end) || null;
  const noks = list.map((row) => row.nok);
  const min = Math.min(...noks);
  const max = Math.max(...noks);
  const avg = noks.reduce((sum, n) => sum + n, 0) / noks.length;
  const cheap = [...list].sort((a, b) => a.nok - b.nok)[0];
  const toOre = (nok) => Math.round(nok * 1000) / 10;
  const hourLabel = (date) => {
    const parts = osloDateParts(date);
    return String(parts.hour).padStart(2, '0');
  };
  return {
    currentOre: current ? toOre(current.nok) : null,
    minOre: toOre(min),
    maxOre: toOre(max),
    avgOre: toOre(avg),
    cheapHour: cheap ? hourLabel(cheap.start) : null,
    hours: list.map((row) => ({
      hour: hourLabel(row.start),
      ore: toOre(row.nok),
      active: !!(current && row.start.getTime() === current.start.getTime()),
    })),
    zoneNote: 'Spotpris uten nettleie og avgifter',
  };
}

export function parseNorgesBankCsv(csv) {
  const lines = String(csv || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(';');
  const idx = (name) => header.indexOf(name);
  const base = idx('BASE_CUR');
  const baseName = idx('Basisvaluta');
  const mult = idx('UNIT_MULT');
  const period = idx('TIME_PERIOD');
  const value = idx('OBS_VALUE');
  if (base < 0 || period < 0 || value < 0) return [];
  const byCode = new Map();
  lines.slice(1).forEach((line) => {
    const cols = line.split(';');
    const code = cols[base];
    const nok = Number(String(cols[value] || '').replace(',', '.'));
    if (!code || !Number.isFinite(nok)) return;
    const unitMult = Number(cols[mult]);
    const per = unitMult >= 2 ? 100 : 1;
    const row = {
      code,
      name: baseName >= 0 ? cols[baseName] : code,
      date: cols[period],
      nok,
      per,
    };
    const prev = byCode.get(code) || [];
    prev.push(row);
    byCode.set(code, prev);
  });
  return [...byCode.entries()].map(([code, rows]) => {
    const sorted = rows.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const last = sorted[sorted.length - 1];
    const before = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    const change = before ? last.nok - before.nok : null;
    return { ...last, code, change };
  });
}

export function parseNextHoliday(list, { todayKey } = {}) {
  const today = todayKey || osloDateParts(new Date()).date;
  const upcoming = (Array.isArray(list) ? list : [])
    .filter((item) => item?.date && item.date >= today && item.localName)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const next = upcoming[0];
  if (!next) return null;
  const days = Math.round(
    (new Date(`${next.date}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000,
  );
  let when = `om ${days} dager`;
  if (days <= 0) when = 'I dag';
  else if (days === 1) when = 'I morgen';
  return {
    name: next.localName,
    date: next.date,
    days: Math.max(0, days),
    when,
  };
}

export function aqiBand(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return { label: 'Ukjent', tone: 'muted' };
  if (n <= 20) return { label: 'Veldig god', tone: 'good' };
  if (n <= 40) return { label: 'God', tone: 'good' };
  if (n <= 60) return { label: 'Middels', tone: 'ok' };
  if (n <= 80) return { label: 'Dårlig', tone: 'bad' };
  if (n <= 100) return { label: 'Veldig dårlig', tone: 'bad' };
  return { label: 'Ekstremt dårlig', tone: 'bad' };
}

export function parseAirQuality(json) {
  const current = json?.current;
  const aqi = Number(current?.european_aqi);
  if (!Number.isFinite(aqi)) return null;
  const band = aqiBand(aqi);
  return {
    aqi: Math.round(aqi),
    label: band.label,
    tone: band.tone,
    pm25: Number.isFinite(Number(current?.pm2_5)) ? Math.round(Number(current.pm2_5) * 10) / 10 : null,
  };
}

async function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  if (inflight.has(key)) return inflight.get(key);
  const pending = Promise.resolve()
    .then(fn)
    .then((data) => {
      cache.set(key, { at: Date.now(), data });
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });
  inflight.set(key, pending);
  return pending;
}

export async function fetchPublicText(url, {
  fetchImpl = fetch,
  proxyImpl,
  headers,
  preferProxy = false,
} = {}) {
  const direct = async () => {
    const res = await fetchImpl(url, { headers });
    if (!res?.ok) {
      const err = new Error(`HTTP ${res?.status || 0}`);
      err.status = res?.status;
      throw err;
    }
    const text = typeof res.text === 'function' ? await res.text() : String(res.body || '');
    const head = text.slice(0, 240);
    const looksLikeHtml = /<!doctype|<html/i.test(head) && !/<rss|<item/i.test(head);
    if (!text || looksLikeHtml) {
      throw new Error('Kilden svarte med en nettside, ikke data');
    }
    return text;
  };

  if (hostNeedsProxy(url) && proxyImpl) {
    // Web: never hit VG/Yahoo directly — the browser logs a CORS error even
    // when the failure is caught and we fall back to fetchOpenFeed.
    if (preferProxy) {
      const via = await proxyImpl(url);
      if (typeof via !== 'string' || !via) throw new Error('Tomt svar fra kilden');
      return via;
    }
    try {
      return await direct();
    } catch (err) {
      try {
        const via = await proxyImpl(url);
        if (typeof via !== 'string' || !via) throw err;
        return via;
      } catch (proxyErr) {
        const wrapped = new Error(proxyErr?.message || err?.message || 'Kunne ikke hente kilden');
        wrapped.cause = proxyErr;
        throw wrapped;
      }
    }
  }
  return direct();
}

export function friendlyLiveError(err, name) {
  const msg = String(err?.message || err?.code || '');
  if (/invalid-symbol|Ugyldig aksjesymbol/.test(msg)) return 'Ugyldig aksjesymbol';
  if (/HTTP 429/.test(msg)) return `${name} har for mange forespørsler. Prøv igjen om litt.`;
  if (/internal|deadline|unauthenticated|permission-denied|not-found|Failed to fetch|Network|CORS|Load failed|unavailable|Tomt svar|nettside|functions\//i.test(msg)) {
    return `Kunne ikke hente ${name} nå. Prøv igjen, eller tilpass i Tilpass.`;
  }
  return msg || `Kunne ikke hente ${name}`;
}

function friendly(err, name) {
  return friendlyLiveError(err, name);
}

async function fetchNewsOnce(sourceId, opts) {
  const source = newsSourceById(sourceId);
  const text = await fetchPublicText(source.url, opts);
  const items = source.kind === 'vg-json'
    ? parseVgNews(JSON.parse(text))
    : parseRssItems(text, { source: source.name });
  if (!items.length) throw new Error(`Ingen saker fra ${source.name}`);
  return { sourceId: source.id, sourceName: source.name, home: source.home, items };
}

async function fetchNews(sourceId, opts) {
  const source = newsSourceById(sourceId);
  try {
    return await fetchNewsOnce(source.id, opts);
  } catch (err) {
    if (source.id !== 'nrk' && hostNeedsProxy(source.url)) {
      try {
        const fallback = await fetchNewsOnce('nrk', opts);
        return { ...fallback, fallbackFrom: source.name };
      } catch { /* behold opprinnelig feil */ }
    }
    throw err;
  }
}

async function fetchStockOnce(url, opts) {
  const text = await fetchPublicText(url, opts);
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Kilden svarte med en nettside, ikke data');
  }
  const quote = parseYahooChart(json);
  if (!quote) throw new Error(json?.chart?.error?.description || 'Fant ikke kursen');
  return quote;
}

async function fetchStock(symbol, opts) {
  try {
    return await fetchStockOnce(stockChartUrl(symbol), opts);
  } catch (err) {
    try {
      return await fetchStockOnce(stockChartUrl(symbol, { host: 'query2.finance.yahoo.com' }), opts);
    } catch {
      throw err;
    }
  }
}

async function fetchStocks(symbols, opts) {
  const list = normalizeStockSymbols(symbols);
  const quotes = [];
  const errors = {};
  await Promise.all(list.map(async (symbol) => {
    try {
      const quote = await cached(`stock:${symbol}`, TTL.stocks, () => fetchStock(symbol, opts));
      quotes.push(quote);
    } catch (err) {
      errors[symbol] = friendly(err, symbol);
    }
  }));
  quotes.sort((a, b) => list.indexOf(a.symbol) - list.indexOf(b.symbol));
  if (!quotes.length) {
    throw new Error(Object.values(errors)[0] || 'Fant ikke kursen');
  }
  return { quotes, errors };
}

async function fetchPower(zone, now, opts) {
  const text = await fetchPublicText(powerPriceUrl(zone, now), opts);
  const parsed = parsePowerPrices(JSON.parse(text), { now });
  if (!parsed) throw new Error('Ingen strømpriser');
  return { ...parsed, zone };
}

async function fetchFx(codes, opts) {
  const text = await fetchPublicText(fxUrl(codes), opts);
  const rates = parseNorgesBankCsv(text);
  if (!rates.length) throw new Error('Ingen valutakurser');
  const wanted = new Set(normalizeFxCodes(codes));
  return {
    rates: rates.filter((row) => wanted.has(row.code)),
    source: 'Norges Bank',
  };
}

async function fetchHoliday(now, opts) {
  const text = await fetchPublicText(HOLIDAY_URL, opts);
  const todayKey = osloDateParts(now).date;
  const next = parseNextHoliday(JSON.parse(text), { todayKey });
  if (!next) throw new Error('Ingen helligdager');
  return next;
}

async function fetchAir(lat, lng, opts) {
  const text = await fetchPublicText(airQualityUrl(lat, lng), opts);
  const parsed = parseAirQuality(JSON.parse(text));
  if (!parsed) throw new Error('Ingen luftmåling');
  return parsed;
}

/**
 * Henter bare widgetene som er slått på. Feil i én kilde stopper ikke de andre.
 */
export async function loadLiveWidgets(prefs, {
  lat,
  lng,
  now = new Date(),
  fetchImpl,
  proxyImpl,
  preferProxy = false,
} = {}) {
  const safe = normalizeLivePrefs(prefs);
  const enabled = new Set(safe.enabled);
  const opts = { fetchImpl, proxyImpl, preferProxy };
  const data = {};
  const errors = {};
  const jobs = [];
  const powerZone = effectivePowerZone(safe, { lat, lng });

  if (enabled.has('news')) {
    jobs.push(['news', TTL.news, `news:${safe.newsSource}`, () => fetchNews(safe.newsSource, opts), safe.newsSource]);
  }
  if (enabled.has('stocks')) {
    jobs.push(['stocks', TTL.stocks, `stocks:${safe.stockSymbols.join(',')}`, () => fetchStocks(safe.stockSymbols, opts), 'aksje']);
  }
  if (enabled.has('power')) {
    jobs.push(['power', TTL.power, `power:${powerZone}:${osloDateParts(now).date}`, () => fetchPower(powerZone, now, opts), 'strømpris']);
  }
  if (enabled.has('fx')) {
    jobs.push(['fx', TTL.fx, `fx:${safe.fxCodes.join(',')}`, () => fetchFx(safe.fxCodes, opts), 'valuta']);
  }
  if (enabled.has('holiday')) {
    jobs.push(['holiday', TTL.holiday, `holiday:${osloDateParts(now).date}`, () => fetchHoliday(now, opts), 'helligdag']);
  }
  if (enabled.has('air') && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
    const key = `air:${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
    jobs.push(['air', TTL.air, key, () => fetchAir(lat, lng, opts), 'luftkvalitet']);
  }

  await Promise.all(jobs.map(async ([id, ttl, key, run, name]) => {
    try {
      data[id] = await cached(key, ttl, run);
    } catch (err) {
      errors[id] = friendly(err, name);
    }
  }));

  return { prefs: safe, data, errors };
}
