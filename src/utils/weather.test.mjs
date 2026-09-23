import assert from 'node:assert/strict';
import {
  interpretWeatherCode,
  formatTempRange,
  parseOpenMeteoForecast,
  parseDayPeriods,
  clothingRecommendations,
  buildForecastSummary,
  parseGeocodeHits,
  placeFromProfileLocation,
  resolveWeatherPlace,
  DEFAULT_WEATHER_PLACE,
  forecastUrl,
  fetchWeatherForecast,
  searchWeatherPlaces,
  interpretYrSymbol,
  zonedDateHour,
  metToOpenMeteoShape,
  metForecastUrl,
  fetchYrForecast,
  WEATHER_SOURCE_YR,
} from './weather.js';

assert.equal(interpretWeatherCode(0).label, 'Klart');
assert.equal(interpretWeatherCode(63).kind, 'rain');
assert.equal(interpretWeatherCode(95).icon, 'thunderstorm');
assert.equal(interpretWeatherCode(999).label, 'Ukjent vær');

assert.equal(interpretYrSymbol('clearsky_night').icon, 'moon');
assert.equal(interpretYrSymbol('lightrain').label, 'Lett regn');
assert.equal(interpretYrSymbol('heavyrainandthunder').kind, 'storm');
assert.equal(zonedDateHour('2026-09-19T22:00:00Z').date, '2026-09-20');
assert.equal(zonedDateHour('2026-09-19T22:00:00Z').hour, 0);

const metJson = {
  properties: {
    meta: { updated_at: '2026-08-25T04:00:00Z' },
    timeseries: [
      {
        time: '2026-08-25T03:00:00Z',
        data: {
          instant: { details: { air_temperature: 8.2, wind_speed: 3.1, relative_humidity: 80 } },
          next_1_hours: { summary: { symbol_code: 'clearsky_day' }, details: { precipitation_amount: 0 } },
        },
      },
      {
        time: '2026-08-25T10:00:00Z',
        data: {
          instant: { details: { air_temperature: 14.4, wind_speed: 5, relative_humidity: 70 } },
          next_1_hours: { summary: { symbol_code: 'lightrain' }, details: { precipitation_amount: 1.2 } },
        },
      },
      {
        time: '2026-08-26T10:00:00Z',
        data: {
          instant: { details: { air_temperature: 11, wind_speed: 4, relative_humidity: 60 } },
          next_1_hours: { summary: { symbol_code: 'fair_day' }, details: { precipitation_amount: 0 } },
        },
      },
    ],
  },
};
const shaped = metToOpenMeteoShape(metJson);
assert.equal(shaped.hourly.time[0], '2026-08-25T05:00');
assert.equal(shaped.hourly.weather_code[1], 61);
assert.ok(shaped.yrByDate['2026-08-25']);
assert.match(metForecastUrl(59.9139, 10.75224), /lat=59.9139/);
assert.match(metForecastUrl(59.9139, 10.75224), /api\.met\.no/);

const yrFetched = await fetchYrForecast(
  { lat: 59.91, lng: 10.75, name: 'Oslo' },
  { fetchImpl: async () => ({ ok: true, json: async () => metJson }), todayKey: '2026-08-25' },
);
assert.equal(yrFetched.source, 'yr');
assert.equal(yrFetched.sourceLabel, WEATHER_SOURCE_YR);
assert.equal(yrFetched.current.label, 'Klart');
assert.equal(yrFetched.current.humidity, 80);
assert.equal(yrFetched.today.label, 'Lett regn');
assert.ok(yrFetched.clothing.includes('rain_gear'));
assert.match(yrFetched.yrUrl, /yr\.no/);

assert.equal(formatTempRange(8.2, 14.6), '8–15°');
assert.equal(formatTempRange(12, 12), '12°');
assert.equal(formatTempRange(null, 7), '7°');

const json = {
  timezone: 'Europe/Oslo',
  current: {
    temperature_2m: 11.4,
    weather_code: 2,
    wind_speed_10m: 3.6,
    apparent_temperature: 9.8,
  },
  hourly: {
    time: [
      '2026-08-25T05:00',
      '2026-08-25T09:00',
      '2026-08-25T12:00',
      '2026-08-25T17:00',
      '2026-08-26T05:00',
    ],
    temperature_2m: [8, 12, 16, 14, 7],
    weather_code: [2, 2, 61, 3, 61],
    precipitation_probability: [10, 20, 80, 30, 50],
    precipitation: [0, 0, 2.1, 0, 0.5],
    wind_speed_10m: [3, 4, 6, 5, 4],
  },
  daily: {
    time: ['2026-08-25', '2026-08-26', '2026-08-27'],
    weather_code: [2, 61, 3],
    temperature_2m_max: [18.4, 14.1, 16],
    temperature_2m_min: [9.2, 7.7, 8],
    precipitation_sum: [0, 4.2, 0],
    precipitation_probability_max: [10, 80, 20],
    wind_speed_10m_max: [5, 8, 4],
  },
};

const parsed = parseOpenMeteoForecast(json, { todayKey: '2026-08-25' });
assert.equal(parsed.today.label, 'Delvis skyet');
assert.equal(parsed.today.tempRange, '9–18°');
assert.equal(parsed.tomorrow.label, 'Lett regn');
assert.equal(parsed.tomorrow.precipMm, 4.2);
assert.equal(parsed.days.length, 3);
assert.equal(parsed.dayAfter.label, 'Overskyet');
assert.equal(parsed.todayPeriods.length, 4);
assert.equal(parsed.todayPeriods[2].label, 'Lett regn');
assert.ok(parsed.clothing.includes('rain_gear'));
assert.match(parsed.summary, /I dag: Delvis skyet, 9–18°/);
assert.match(parsed.summary, /I morgen: Lett regn, 8–14°, 4,2 mm nedbør/);

const periods = parseDayPeriods(json.hourly, '2026-08-25');
assert.equal(periods.length, 4);
assert.equal(periods[0].id, 'morning');
assert.equal(periods[2].kind, 'rain');
assert.ok(clothingRecommendations(periods).includes('rain_gear'));

const skipped = parseOpenMeteoForecast(json, { todayKey: '2026-08-26' });
assert.equal(skipped.today.label, 'Lett regn');
assert.equal(skipped.tomorrow.label, 'Overskyet');

assert.equal(
  buildForecastSummary(parsed.today, parsed.tomorrow),
  parsed.summary,
);

const hits = parseGeocodeHits({
  results: [
    { name: 'Bergen', admin1: 'Vestland', country: 'Norge', latitude: 60.39, longitude: 5.32 },
    { name: 'Broken', latitude: 'x', longitude: 1 },
  ],
});
assert.equal(hits.length, 1);
assert.equal(hits[0].label, 'Bergen, Vestland, Norge');
assert.equal(hits[0].lat, 60.39);

assert.equal(placeFromProfileLocation({ label: 'Storgata 1, Oslo', lat: 59.91, lng: 10.75 }).name, 'Storgata 1');
assert.equal(placeFromProfileLocation({ label: 'Oslo' }), null);

const fromProfile = resolveWeatherPlace({
  profileLocation: { label: 'Tromsø', lat: 69.65, lng: 18.96 },
});
assert.equal(fromProfile.name, 'Tromsø');

const fallback = resolveWeatherPlace({});
assert.equal(fallback.name, DEFAULT_WEATHER_PLACE.name);

const url = forecastUrl(59.91, 10.75);
assert.match(url, /api\.open-meteo\.com\/v1\/forecast/);
assert.match(url, /daily=weather_code/);
assert.match(url, /hourly=temperature_2m/);

const mockForecast = {
  ok: true,
  json: async () => json,
};
const fetched = await fetchWeatherForecast(
  { lat: 59.91, lng: 10.75, name: 'Oslo' },
  { fetchImpl: async () => mockForecast, todayKey: '2026-08-25' },
);
assert.equal(fetched.place.name, 'Oslo');
assert.equal(fetched.today.label, 'Delvis skyet');
assert.match(fetched.summary, /I morgen: Lett regn/);

const geoFetched = await searchWeatherPlaces('Bergen', {
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ results: [{ name: 'Bergen', latitude: 60.39, longitude: 5.32, country: 'Norge' }] }),
  }),
});
assert.equal(geoFetched[0].name, 'Bergen');

const emptySearch = await searchWeatherPlaces('x', {
  fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }),
});
assert.equal(emptySearch.length, 0);

await assert.rejects(
  () => fetchWeatherForecast(
    { lat: 59.91, lng: 10.75, name: 'Oslo' },
    { fetchImpl: async () => ({ ok: false, status: 500 }) },
  ),
  /Værvarsel feilet/,
);

console.log('weather.test.mjs: ok');
