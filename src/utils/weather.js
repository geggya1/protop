/**
 * Værvarsel via åpne API-er.
 * Primærkilde: Yr / MET Norway Locationforecast (samme modell som yr.no).
 * Reserve: Open-Meteo med MET-modellen hvis Yr ikke svarer.
 * Sted: lagret valg, deretter hjemadresse på profil, ellers Oslo.
 * GPS kun når brukeren aktivt velger «Bruk der jeg er» — aldri automatisk ved lasting.
 */

export const WEATHER_PLACE_KEY = 'weekplan.weatherPlace.v1';

export const DEFAULT_WEATHER_PLACE = {
  name: 'Oslo',
  lat: 59.9139,
  lng: 10.7522,
  source: 'default',
};

const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const MET_FORECAST = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';

/** MET krever identifiserbar User-Agent. Nettlesere ignorerer headeren; da brukes den likevel på native. */
export const MET_USER_AGENT = 'ProTop/2.0 (https://protop.no; vaer@protop.no)';

export const WEATHER_SOURCE_YR = 'Værdata fra Yr (MET Norway)';
export const WEATHER_SOURCE_FALLBACK = 'Værdata fra Open-Meteo (MET-modell)';

/** Yr-symbol uten _day/_night → samme form som WMO-tolkningen i UI. */
const YR_SYMBOLS = {
  clearsky: { label: 'Klart', icon: 'sunny', kind: 'clear', code: 0 },
  fair: { label: 'Lettskyet', icon: 'sunny', kind: 'clear', code: 1 },
  partlycloudy: { label: 'Delvis skyet', icon: 'partly-sunny', kind: 'cloud', code: 2 },
  cloudy: { label: 'Overskyet', icon: 'cloudy', kind: 'cloud', code: 3 },
  fog: { label: 'Tåke', icon: 'cloud', kind: 'fog', code: 45 },
  lightrainshowers: { label: 'Lette regnbyger', icon: 'rainy-outline', kind: 'rain', code: 80 },
  rainshowers: { label: 'Regnbyger', icon: 'rainy', kind: 'rain', code: 80 },
  heavyrainshowers: { label: 'Kraftige regnbyger', icon: 'rainy', kind: 'rain', code: 82 },
  lightrain: { label: 'Lett regn', icon: 'rainy-outline', kind: 'rain', code: 61 },
  rain: { label: 'Regn', icon: 'rainy', kind: 'rain', code: 63 },
  heavyrain: { label: 'Kraftig regn', icon: 'rainy', kind: 'rain', code: 65 },
  lightrainandthunder: { label: 'Lett regn og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  rainandthunder: { label: 'Regn og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  heavyrainandthunder: { label: 'Kraftig regn og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  rainshowersandthunder: { label: 'Regnbyger og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  heavyrainshowersandthunder: { label: 'Kraftige byger og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  lightsleet: { label: 'Lett sludd', icon: 'rainy-outline', kind: 'drizzle', code: 56 },
  sleet: { label: 'Sludd', icon: 'rainy', kind: 'rain', code: 67 },
  heavysleet: { label: 'Kraftig sludd', icon: 'rainy', kind: 'rain', code: 67 },
  lightsleetshowers: { label: 'Lette sluddbyger', icon: 'rainy-outline', kind: 'drizzle', code: 56 },
  sleetshowers: { label: 'Sluddbyger', icon: 'rainy', kind: 'rain', code: 67 },
  lightsnow: { label: 'Lett snø', icon: 'snow-outline', kind: 'snow', code: 71 },
  snow: { label: 'Snø', icon: 'snow', kind: 'snow', code: 73 },
  heavysnow: { label: 'Kraftig snø', icon: 'snow', kind: 'snow', code: 75 },
  lightsnowshowers: { label: 'Lette snøbyger', icon: 'snow-outline', kind: 'snow', code: 85 },
  snowshowers: { label: 'Snøbyger', icon: 'snow', kind: 'snow', code: 85 },
  heavysnowshowers: { label: 'Kraftige snøbyger', icon: 'snow', kind: 'snow', code: 86 },
  snowandthunder: { label: 'Snø og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  sleetandthunder: { label: 'Sludd og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  lightssleetshowersandthunder: { label: 'Sluddbyger og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
  lightssnowshowersandthunder: { label: 'Snøbyger og torden', icon: 'thunderstorm', kind: 'storm', code: 95 },
};

/** Norske døgnperioder for timebasert værvarsel. */
export const WEATHER_DAY_PARTS = [
  { id: 'morning', startHour: 5, endHour: 9 },
  { id: 'forenoon', startHour: 9, endHour: 12 },
  { id: 'afternoon', startHour: 12, endHour: 17 },
  { id: 'evening', startHour: 17, endHour: 22 },
];

const KIND_PRIORITY = {
  storm: 6, rain: 5, snow: 4, drizzle: 3, fog: 2, cloud: 1, clear: 0,
};

/** WMO Weather interpretation codes → kort norsk tekst + Ionicons-navn. */
export const WMO_WEATHER = {
  0: { label: 'Klart', icon: 'sunny', kind: 'clear' },
  1: { label: 'Stort sett klart', icon: 'sunny', kind: 'clear' },
  2: { label: 'Delvis skyet', icon: 'partly-sunny', kind: 'cloud' },
  3: { label: 'Overskyet', icon: 'cloudy', kind: 'cloud' },
  45: { label: 'Tåke', icon: 'cloud', kind: 'fog' },
  48: { label: 'Rimtåke', icon: 'cloud', kind: 'fog' },
  51: { label: 'Lett yr', icon: 'rainy-outline', kind: 'drizzle' },
  53: { label: 'Yr', icon: 'rainy-outline', kind: 'drizzle' },
  55: { label: 'Kraftig yr', icon: 'rainy', kind: 'drizzle' },
  56: { label: 'Yr, sludd', icon: 'rainy-outline', kind: 'drizzle' },
  57: { label: 'Kraftig yr, sludd', icon: 'rainy', kind: 'drizzle' },
  61: { label: 'Lett regn', icon: 'rainy-outline', kind: 'rain' },
  63: { label: 'Regn', icon: 'rainy', kind: 'rain' },
  65: { label: 'Kraftig regn', icon: 'rainy', kind: 'rain' },
  66: { label: 'Underkjølt regn', icon: 'rainy', kind: 'rain' },
  67: { label: 'Kraftig underkjølt regn', icon: 'rainy', kind: 'rain' },
  71: { label: 'Lett snø', icon: 'snow-outline', kind: 'snow' },
  73: { label: 'Snø', icon: 'snow', kind: 'snow' },
  75: { label: 'Kraftig snø', icon: 'snow', kind: 'snow' },
  77: { label: 'Kornsnø', icon: 'snow-outline', kind: 'snow' },
  80: { label: 'Regnbyger', icon: 'rainy', kind: 'rain' },
  81: { label: 'Kraftige byger', icon: 'rainy', kind: 'rain' },
  82: { label: 'Ekstreme byger', icon: 'rainy', kind: 'rain' },
  85: { label: 'Snøbyger', icon: 'snow', kind: 'snow' },
  86: { label: 'Kraftige snøbyger', icon: 'snow', kind: 'snow' },
  95: { label: 'Torden', icon: 'thunderstorm', kind: 'storm' },
  96: { label: 'Torden og hagl', icon: 'thunderstorm', kind: 'storm' },
  99: { label: 'Kraftig torden og hagl', icon: 'thunderstorm', kind: 'storm' },
};

export function interpretWeatherCode(code) {
  const n = Number(code);
  if (Number.isFinite(n) && WMO_WEATHER[n]) return { code: n, ...WMO_WEATHER[n] };
  return { code: Number.isFinite(n) ? n : null, label: 'Ukjent vær', icon: 'partly-sunny', kind: 'cloud' };
}

export function interpretYrSymbol(symbol) {
  const raw = String(symbol || '').toLowerCase();
  const night = /_night$/.test(raw);
  const base = raw.replace(/_(day|night|polartwilight)$/, '');
  const mapped = YR_SYMBOLS[base] || { label: 'Varierende', icon: 'partly-sunny', kind: 'cloud', code: 2 };
  let icon = mapped.icon;
  if (night && icon === 'sunny') icon = 'moon';
  return { ...mapped, icon, symbol: raw || null };
}

/** Klokkeslett i valgt sone, uavhengig av enhetens tidssone. */
export function zonedDateHour(iso, timeZone = 'Europe/Oslo') {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const bag = {};
  fmt.formatToParts(d).forEach((p) => {
    if (p.type !== 'literal') bag[p.type] = p.value;
  });
  let hour = Number(bag.hour);
  if (!Number.isFinite(hour)) return null;
  if (hour === 24) hour = 0;
  const date = `${bag.year}-${bag.month}-${bag.day}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return { date, hour };
}

export function yrPlaceUrl(lat, lng) {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'https://www.yr.no/';
  return `https://www.yr.no/nb/værvarsel/daglig-tabell/${la.toFixed(4)},${ln.toFixed(4)}`;
}

function hourFromForecastIso(iso) {
  const m = /T(\d{2})/.exec(String(iso || ''));
  if (m) {
    const hour = Number(m[1]);
    if (hour >= 0 && hour <= 23) return hour;
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours();
}

function pickYrDaySymbol(entries) {
  const daytime = entries.filter((e) => e.hour >= 8 && e.hour < 18 && e.symbol);
  const list = (daytime.length ? daytime : entries).map((e) => e.symbol).filter(Boolean);
  if (!list.length) return null;
  const counts = new Map();
  let best = list[0];
  let bestScore = -1;
  list.forEach((sym) => {
    counts.set(sym, (counts.get(sym) || 0) + 1);
    const info = interpretYrSymbol(sym);
    const score = (counts.get(sym) || 0) * 10 + (KIND_PRIORITY[info.kind] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = sym;
    }
  });
  return interpretYrSymbol(best);
}

export function roundTemp(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

export function formatTempRange(min, max) {
  const lo = roundTemp(min);
  const hi = roundTemp(max);
  if (lo == null && hi == null) return '';
  if (lo == null) return `${hi}°`;
  if (hi == null) return `${lo}°`;
  if (lo === hi) return `${hi}°`;
  return `${lo}–${hi}°`;
}

function dailyAt(daily, index) {
  if (!daily || index < 0) return null;
  const date = daily.time?.[index];
  if (!date) return null;
  const code = daily.weather_code?.[index] ?? daily.weathercode?.[index];
  const info = interpretWeatherCode(code);
  const min = daily.temperature_2m_min?.[index];
  const max = daily.temperature_2m_max?.[index];
  const precip = Number(daily.precipitation_sum?.[index]);
  const precipProb = Number(daily.precipitation_probability_max?.[index]);
  const wind = Number(daily.wind_speed_10m_max?.[index]);
  return {
    date,
    weekday: weekdayShortNb(date),
    ...info,
    min: roundTemp(min),
    max: roundTemp(max),
    tempRange: formatTempRange(min, max),
    precipMm: Number.isFinite(precip) ? Math.round(precip * 10) / 10 : 0,
    precipProb: Number.isFinite(precipProb) ? Math.round(precipProb) : null,
    windMs: Number.isFinite(wind) ? Math.round(wind) : null,
  };
}

export function weekdayShortNb(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { weekday: 'short' }).replace(/\.$/, '');
}

function dayBlurb(day) {
  if (!day) return '';
  const bits = [day.label];
  if (day.tempRange) bits.push(day.tempRange);
  if (day.precipMm >= 1) bits.push(`${String(day.precipMm).replace('.', ',')} mm nedbør`);
  else if (day.precipProb >= 50) bits.push(`${day.precipProb} % sjanse for nedbør`);
  return bits.join(', ');
}

/**
 * Kort varsel: «I dag: Delvis skyet, 8–14°. I morgen: Lett regn, 6–11°.»
 */
export function buildForecastSummary(today, tomorrow) {
  const parts = [];
  if (today) parts.push(`I dag: ${dayBlurb(today)}`);
  if (tomorrow) parts.push(`I morgen: ${dayBlurb(tomorrow)}`);
  return parts.join('. ');
}

function dominantWeatherCode(codes) {
  const list = (codes || []).map((c) => Number(c)).filter((c) => Number.isFinite(c));
  if (!list.length) return null;
  const counts = new Map();
  let best = list[0];
  let bestScore = -1;
  list.forEach((code) => {
    counts.set(code, (counts.get(code) || 0) + 1);
    const info = interpretWeatherCode(code);
    const score = (counts.get(code) || 0) * 10 + (KIND_PRIORITY[info.kind] ?? 0);
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  });
  return best;
}

function hourlySliceForPeriod(hourly, dateStr, startHour, endHour) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const indices = [];
  times.forEach((iso, index) => {
    const day = String(iso || '').slice(0, 10);
    if (day !== dateStr) return;
    const hour = hourFromForecastIso(iso);
    if (hour == null) return;
    if (hour >= startHour && hour < endHour) indices.push(index);
  });
  return indices;
}

function periodAt(hourly, part, dateStr) {
  const indices = hourlySliceForPeriod(hourly, dateStr, part.startHour, part.endHour);
  if (!indices.length) return null;

  const temps = indices
    .map((i) => Number(hourly.temperature_2m?.[i]))
    .filter((n) => Number.isFinite(n));
  const codes = indices.map((i) => hourly.weather_code?.[i] ?? hourly.weathercode?.[i]);
  const precipProbs = indices
    .map((i) => Number(hourly.precipitation_probability?.[i]))
    .filter((n) => Number.isFinite(n));
  const precipSums = indices
    .map((i) => Number(hourly.precipitation?.[i]))
    .filter((n) => Number.isFinite(n));
  const winds = indices
    .map((i) => Number(hourly.wind_speed_10m?.[i]))
    .filter((n) => Number.isFinite(n));

  const code = dominantWeatherCode(codes);
  const info = interpretWeatherCode(code);
  const tempMin = temps.length ? roundTemp(Math.min(...temps)) : null;
  const tempMax = temps.length ? roundTemp(Math.max(...temps)) : null;
  const precipProb = precipProbs.length ? Math.max(...precipProbs) : null;
  const precipMm = precipSums.length
    ? Math.round(precipSums.reduce((a, b) => a + b, 0) * 10) / 10
    : 0;
  const windMs = winds.length ? Math.round(Math.max(...winds)) : null;

  return {
    id: part.id,
    ...info,
    tempMin,
    tempMax,
    tempRange: formatTempRange(tempMin, tempMax),
    precipProb: precipProb != null ? Math.round(precipProb) : null,
    precipMm,
    windMs,
  };
}

/**
 * Deler timevarsel inn i morgen, formiddag, ettermiddag og kveld for én dato.
 */
export function parseDayPeriods(hourly, dateStr) {
  if (!hourly || !dateStr) return [];
  return WEATHER_DAY_PARTS
    .map((part) => periodAt(hourly, part, dateStr))
    .filter(Boolean);
}

/** Next hours from now — for the time-for-time weather look. */
export function parseNextHours(hourly, { from = new Date(), count = 6 } = {}) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];
  const start = from.getTime() - 20 * 60 * 1000;
  const out = [];
  for (let i = 0; i < times.length && out.length < count; i += 1) {
    const iso = times[i];
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t) || t < start) continue;
    const code = hourly.weather_code?.[i] ?? hourly.weathercode?.[i];
    const info = interpretWeatherCode(code);
    out.push({
      id: iso,
      hour: String(iso).slice(11, 13) || String(hourFromForecastIso(iso) ?? '').padStart(2, '0'),
      temp: roundTemp(hourly.temperature_2m?.[i]),
      icon: info.icon,
    });
  }
  return out;
}

/**
 * Symboliske bekledningsråd basert på dagens perioder.
 * Returnerer nøkler som oversettes i UI (weather.clothing.*).
 */
export function clothingRecommendations(periods = []) {
  if (!periods.length) return [];
  const tips = new Set();
  const kinds = periods.map((p) => p.kind);
  const minT = Math.min(...periods.map((p) => p.tempMin).filter((n) => Number.isFinite(n)));
  const maxT = Math.max(...periods.map((p) => p.tempMax).filter((n) => Number.isFinite(n)));
  const maxWind = Math.max(...periods.map((p) => p.windMs).filter((n) => Number.isFinite(n)), 0);
  const maxPrecipProb = Math.max(...periods.map((p) => p.precipProb).filter((n) => Number.isFinite(n)), 0);
  const rainy = kinds.some((k) => ['rain', 'drizzle', 'storm'].includes(k))
    || maxPrecipProb >= 50
    || periods.some((p) => p.precipMm >= 0.5);

  if (kinds.includes('storm')) tips.add('storm_gear');
  if (rainy) tips.add('rain_gear');
  if (kinds.includes('snow')) tips.add('snow_gear');

  if (Number.isFinite(minT)) {
    if (minT <= -5) tips.add('very_cold');
    else if (minT <= 2) tips.add('winter_jacket');
    else if (minT <= 8) tips.add('jacket');
    else if (minT <= 14) tips.add('light_jacket');
    else if (Number.isFinite(maxT) && maxT >= 22) tips.add('summer_clothes');
    else tips.add('layers');
  }

  if (maxWind >= 10) tips.add('windproof');
  if (!tips.size && Number.isFinite(maxT) && maxT >= 18) tips.add('light_clothes');

  return [...tips];
}

export function parseOpenMeteoForecast(json, { todayKey } = {}) {
  const daily = json?.daily || {};
  const times = Array.isArray(daily.time) ? daily.time : [];
  let todayIndex = 0;
  if (todayKey) {
    const found = times.indexOf(todayKey);
    if (found >= 0) todayIndex = found;
  }
  const today = dailyAt(daily, todayIndex);
  const tomorrow = dailyAt(daily, todayIndex + 1);
  const currentCode = json?.current?.weather_code ?? json?.current?.weathercode;
  const currentTemp = json?.current?.temperature_2m;
  const current = {
    temp: roundTemp(currentTemp),
    ...interpretWeatherCode(currentCode ?? today?.code),
    windMs: roundTemp(json?.current?.wind_speed_10m),
    feelsLike: roundTemp(json?.current?.apparent_temperature),
    humidity: roundTemp(json?.current?.relative_humidity_2m ?? json?.current?.relative_humidity),
  };
  const dayAfter = dailyAt(daily, todayIndex + 2);
  const hourly = json?.hourly || null;
  const todayDate = today?.date || todayKey || times[todayIndex] || null;
  const tomorrowDate = tomorrow?.date || times[todayIndex + 1] || null;
  const todayPeriods = parseDayPeriods(hourly, todayDate);
  const tomorrowPeriods = parseDayPeriods(hourly, tomorrowDate);
  const clothing = clothingRecommendations(todayPeriods);
  return {
    today,
    tomorrow,
    dayAfter,
    days: [today, tomorrow, dayAfter].filter(Boolean),
    current,
    todayPeriods,
    tomorrowPeriods,
    clothing,
    nextHours: parseNextHours(hourly),
    summary: buildForecastSummary(today, tomorrow),
    timezone: json?.timezone || null,
  };
}

export function forecastUrl(lat, lng, { models } = {}) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code,wind_speed_10m,apparent_temperature,relative_humidity_2m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,precipitation,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max',
    timezone: 'auto',
    forecast_days: '3',
  });
  if (models) params.set('models', models);
  return `${OPEN_METEO_FORECAST}?${params.toString()}`;
}

export function metForecastUrl(lat, lng) {
  const params = new URLSearchParams({
    lat: Number(lat).toFixed(4),
    lon: Number(lng).toFixed(4),
  });
  return `${MET_FORECAST}?${params.toString()}`;
}

/**
 * Locationforecast compact → samme form som Open-Meteo, med klokkeslett i Europe/Oslo.
 * Nedbør: next_1_hours når den finnes, ellers next_6_hours (ikke begge).
 */
export function metToOpenMeteoShape(json, { timeZone = 'Europe/Oslo' } = {}) {
  const series = json?.properties?.timeseries;
  if (!Array.isArray(series) || !series.length) {
    throw new Error('Tomt svar fra Yr');
  }

  const hourly = {
    time: [],
    temperature_2m: [],
    weather_code: [],
    precipitation_probability: [],
    precipitation: [],
    wind_speed_10m: [],
  };
  const byDate = new Map();

  series.forEach((entry) => {
    const z = zonedDateHour(entry?.time, timeZone);
    if (!z) return;
    const instant = entry?.data?.instant?.details || {};
    const next1 = entry?.data?.next_1_hours;
    const next6 = entry?.data?.next_6_hours;
    const symbol = next1?.summary?.symbol_code
      || next6?.summary?.symbol_code
      || entry?.data?.next_12_hours?.summary?.symbol_code
      || '';
    const info = interpretYrSymbol(symbol);
    const precipRaw = next1?.details && Number.isFinite(Number(next1.details.precipitation_amount))
      ? Number(next1.details.precipitation_amount)
      : Number(next6?.details?.precipitation_amount);
    const precip = Number.isFinite(precipRaw) ? precipRaw : 0;
    const temp = Number(instant.air_temperature);
    const wind = Number(instant.wind_speed);

    hourly.time.push(`${z.date}T${String(z.hour).padStart(2, '0')}:00`);
    hourly.temperature_2m.push(Number.isFinite(temp) ? temp : null);
    hourly.weather_code.push(info.code);
    hourly.precipitation.push(precip);
    hourly.precipitation_probability.push(precip >= 0.4 ? 70 : precip > 0 ? 40 : 0);
    hourly.wind_speed_10m.push(Number.isFinite(wind) ? wind : null);

    if (!byDate.has(z.date)) {
      byDate.set(z.date, { temps: [], codes: [], precip: 0, wind: 0, symbols: [] });
    }
    const bucket = byDate.get(z.date);
    if (Number.isFinite(temp)) bucket.temps.push(temp);
    if (info.code != null) bucket.codes.push(info.code);
    bucket.precip += precip;
    if (Number.isFinite(wind)) bucket.wind = Math.max(bucket.wind, wind);
    if (symbol) bucket.symbols.push({ hour: z.hour, symbol });
  });

  if (!hourly.time.length) throw new Error('Tomt svar fra Yr');

  const dates = [...byDate.keys()].sort();
  const yrByDate = {};
  const daily = {
    time: dates,
    weather_code: [],
    temperature_2m_max: [],
    temperature_2m_min: [],
    precipitation_sum: [],
    precipitation_probability_max: [],
    wind_speed_10m_max: [],
  };
  dates.forEach((date) => {
    const b = byDate.get(date);
    const code = dominantWeatherCode(b.codes);
    daily.weather_code.push(code);
    daily.temperature_2m_max.push(b.temps.length ? Math.max(...b.temps) : null);
    daily.temperature_2m_min.push(b.temps.length ? Math.min(...b.temps) : null);
    daily.precipitation_sum.push(Math.round(b.precip * 10) / 10);
    daily.precipitation_probability_max.push(b.precip >= 1 ? 80 : b.precip > 0 ? 40 : 5);
    daily.wind_speed_10m_max.push(Math.round(b.wind));
    const picked = pickYrDaySymbol(b.symbols);
    if (picked) yrByDate[date] = picked;
  });

  const first = series[0];
  const currentSymbol = first?.data?.next_1_hours?.summary?.symbol_code
    || first?.data?.next_6_hours?.summary?.symbol_code
    || '';
  return {
    timezone: timeZone,
    currentSymbol,
    yrByDate,
    current: {
      temperature_2m: first?.data?.instant?.details?.air_temperature,
      weather_code: interpretYrSymbol(currentSymbol).code,
      wind_speed_10m: first?.data?.instant?.details?.wind_speed,
      relative_humidity: first?.data?.instant?.details?.relative_humidity,
    },
    hourly,
    daily,
  };
}

function applyYrDayLabels(parsed, yrByDate) {
  if (!parsed || !yrByDate) return parsed;
  ['today', 'tomorrow', 'dayAfter'].forEach((key) => {
    const day = parsed[key];
    const info = day && yrByDate[day.date];
    if (!info) return;
    parsed[key] = { ...day, label: info.label, icon: info.icon, kind: info.kind, code: info.code };
  });
  if (Array.isArray(parsed.days)) {
    parsed.days = parsed.days.map((day) => {
      const info = day && yrByDate[day.date];
      return info ? { ...day, label: info.label, icon: info.icon, kind: info.kind, code: info.code } : day;
    });
  }
  parsed.summary = buildForecastSummary(parsed.today, parsed.tomorrow);
  return parsed;
}

export function geocodeUrl(query, language = 'nb') {
  const params = new URLSearchParams({
    name: String(query || '').trim(),
    count: '6',
    language: language || 'nb',
    format: 'json',
  });
  return `${OPEN_METEO_GEOCODE}?${params.toString()}`;
}

export function parseGeocodeHits(json) {
  const results = Array.isArray(json?.results) ? json.results : [];
  return results.map((r) => {
    const parts = [r.name, r.admin1, r.country].filter(Boolean);
    const unique = [...new Set(parts)];
    return {
      name: r.name || unique[0] || 'Sted',
      label: unique.join(', '),
      lat: Number(r.latitude),
      lng: Number(r.longitude),
      country: r.country || '',
      source: 'search',
    };
  }).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

export function placeFromProfileLocation(location) {
  if (!location) return null;
  const lat = Number(location.lat);
  const lng = Number(location.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = String(location.label || location.name || '').trim();
  const short = name.split(',')[0].trim() || name || 'Hjem';
  return {
    name: short,
    label: name || short,
    lat,
    lng,
    source: 'profile',
  };
}

export function normalizeWeatherPlace(place) {
  if (!place) return null;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const name = String(place.name || place.label || '').trim() || 'Sted';
  return {
    name: name.split(',')[0].trim() || name,
    label: String(place.label || name).trim(),
    lat,
    lng,
    source: place.source || 'saved',
  };
}

export function resolveWeatherPlace({ saved, profileLocation } = {}) {
  return normalizeWeatherPlace(saved)
    || placeFromProfileLocation(profileLocation)
    || { ...DEFAULT_WEATHER_PLACE, label: DEFAULT_WEATHER_PLACE.name };
}

async function readWeatherJson(res, label) {
  if (!res?.ok) throw new Error(`${label} (${res?.status || 'nettverk'})`);
  return res.json();
}

export async function fetchYrForecast(place, { fetchImpl = fetch, todayKey } = {}) {
  const resolved = normalizeWeatherPlace(place) || DEFAULT_WEATHER_PLACE;
  const res = await fetchImpl(metForecastUrl(resolved.lat, resolved.lng), {
    headers: {
      Accept: 'application/json',
      'User-Agent': MET_USER_AGENT,
    },
  });
  const json = await readWeatherJson(res, 'Yr svarte');
  const shaped = metToOpenMeteoShape(json);
  const parsed = applyYrDayLabels(parseOpenMeteoForecast(shaped, { todayKey }), shaped.yrByDate);
  const nowSymbol = interpretYrSymbol(shaped.currentSymbol);
  return {
    place: resolved,
    source: 'yr',
    sourceLabel: WEATHER_SOURCE_YR,
    updatedAt: json?.properties?.meta?.updated_at || null,
    yrUrl: yrPlaceUrl(resolved.lat, resolved.lng),
    ...parsed,
    current: {
      ...parsed.current,
      label: nowSymbol.label || parsed.current?.label,
      icon: nowSymbol.icon || parsed.current?.icon,
      kind: nowSymbol.kind || parsed.current?.kind,
      humidity: roundTemp(shaped.current?.relative_humidity),
    },
  };
}

export async function fetchWeatherForecast(place, { fetchImpl, todayKey } = {}) {
  const resolved = normalizeWeatherPlace(place) || DEFAULT_WEATHER_PLACE;
  const doFetch = fetchImpl || fetch;
  try {
    return await fetchYrForecast(resolved, { fetchImpl: doFetch, todayKey });
  } catch {
    const res = await doFetch(forecastUrl(resolved.lat, resolved.lng, { models: 'metno_seamless' }));
    const json = await readWeatherJson(res, 'Værvarsel feilet');
    const parsed = parseOpenMeteoForecast(json, { todayKey });
    return {
      place: resolved,
      source: 'open-meteo',
      sourceLabel: WEATHER_SOURCE_FALLBACK,
      yrUrl: yrPlaceUrl(resolved.lat, resolved.lng),
      ...parsed,
    };
  }
}

export async function searchWeatherPlaces(query, { fetchImpl, language = 'nb' } = {}) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const doFetch = fetchImpl || fetch;
  const res = await doFetch(geocodeUrl(q, language));
  if (!res.ok) return [];
  const json = await res.json();
  return parseGeocodeHits(json);
}
