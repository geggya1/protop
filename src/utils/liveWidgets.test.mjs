import assert from 'node:assert/strict';
import {
  normalizeStockSymbol,
  normalizeLivePrefs,
  normalizeStockSymbols,
  normalizeFxCodes,
  suggestPowerZone,
  effectivePowerZone,
  hostNeedsProxy,
  widgetRequests,
  parseVgNews,
  parseRssItems,
  parseYahooChart,
  parsePowerPrices,
  parseNorgesBankCsv,
  parseNextHoliday,
  parseAirQuality,
  aqiBand,
  formatNb,
  formatSignedPct,
  loadLiveWidgets,
  clearLiveWidgetCache,
  powerPriceUrl,
  stockChartUrl,
  stockQuotesFromData,
  fxUrl,
  friendlyLiveError,
  DEFAULT_LIVE_PREFS,
} from './liveWidgets.js';

assert.equal(normalizeStockSymbol(' eqnr.ol '), 'EQNR.OL');
assert.equal(normalizeStockSymbol(''), '');
assert.equal(normalizeStockSymbol('../etc'), '');
assert.equal(normalizeStockSymbol('AAPL'), 'AAPL');

const prefs = normalizeLivePrefs({
  enabled: ['news', 'nope', 'stocks'],
  newsSource: 'dn',
  stockSymbol: 'dnb.ol',
  powerZone: 'NO5',
});
assert.deepEqual(prefs.enabled, ['news', 'stocks']);
assert.equal(prefs.newsSource, 'dn');
assert.equal(prefs.stockSymbol, 'DNB.OL');
assert.deepEqual(prefs.stockSymbols, ['DNB.OL']);
assert.equal(prefs.powerZone, 'NO5');
assert.equal(prefs.powerZoneAuto, true);
assert.deepEqual(prefs.fxCodes, ['USD', 'EUR', 'GBP', 'SEK']);

assert.deepEqual(normalizeFxCodes(['eur', 'USD', 'NOPE', 'USD']), ['EUR', 'USD']);
assert.deepEqual(normalizeStockSymbols(['dnb.ol', 'EQNR.OL', 'dnb.ol']), ['DNB.OL', 'EQNR.OL']);
assert.deepEqual(normalizeStockSymbols([], '', { allowEmpty: true }), []);
assert.equal(effectivePowerZone({ powerZoneAuto: true, powerZone: 'NO1' }, { lat: 58.97, lng: 5.73 }), 'NO2');
assert.equal(effectivePowerZone({ powerZoneAuto: false, powerZone: 'NO5' }, { lat: 58.97, lng: 5.73 }), 'NO5');
assert.equal(normalizeLivePrefs({ powerZoneAuto: false, powerZone: 'NO3' }).powerZoneAuto, false);
assert.match(friendlyLiveError({ message: 'internal' }, 'EQNR.OL'), /Kunne ikke hente EQNR\.OL/);
assert.match(fxUrl(['USD', 'DKK']), /USD\+DKK/);
assert.equal(stockQuotesFromData({ price: 12, symbol: 'EQNR.OL' }).length, 1);
assert.equal(stockQuotesFromData({ quotes: [{ price: 3 }] })[0].price, 3);

const emptyEnabled = normalizeLivePrefs({ enabled: [] });
assert.deepEqual(emptyEnabled.enabled, []);

assert.equal(suggestPowerZone(59.91, 10.75), 'NO1');
assert.equal(suggestPowerZone(58.97, 5.73), 'NO2');
assert.equal(suggestPowerZone(63.43, 10.4), 'NO3');
assert.equal(suggestPowerZone(69.65, 18.96), 'NO4');
assert.equal(suggestPowerZone(60.39, 5.32), 'NO5');

assert.equal(hostNeedsProxy('https://www.vg.no/rss/feed/?format=json'), true);
assert.equal(hostNeedsProxy('https://www.nrk.no/toppsaker.rss'), false);
assert.equal(hostNeedsProxy('https://query1.finance.yahoo.com/v8/finance/chart/EQNR.OL'), true);
assert.equal(hostNeedsProxy('https://query2.finance.yahoo.com/v8/finance/chart/EQNR.OL'), true);

const reqs = widgetRequests({
  ...DEFAULT_LIVE_PREFS,
  enabled: ['news', 'power'],
  newsSource: 'nrk',
  powerZone: 'NO1',
}, { now: new Date('2026-09-19T12:00:00Z') });
assert.deepEqual(reqs.map((r) => r.id), ['news', 'power']);
assert.match(reqs[0].url, /nrk\.no/);
assert.match(powerPriceUrl('NO1', new Date('2026-09-19T22:30:00Z')), /2026\/09-20_NO1/);
assert.match(stockChartUrl('EQNR.OL'), /EQNR\.OL/);
assert.match(stockChartUrl('EQNR.OL', { host: 'query2.finance.yahoo.com' }), /query2\.finance\.yahoo\.com/);
assert.throws(() => stockChartUrl('!!!'), /Ugyldig/);

const autoPower = widgetRequests({
  enabled: ['power'],
  powerZone: 'NO1',
  powerZoneAuto: true,
}, { lat: 58.97, lng: 5.73, now: new Date('2026-09-19T12:00:00Z') });
assert.match(autoPower[0].url, /NO2/);

const stockReqs = widgetRequests({
  enabled: ['stocks'],
  stockSymbols: ['EQNR.OL', 'DNB.OL'],
});
assert.deepEqual(stockReqs.map((r) => r.id), ['stocks:EQNR.OL', 'stocks:DNB.OL']);

const vg = parseVgNews([
  {
    id: 'abc',
    title: 'Tittel',
    preamble: 'Ingress',
    url: 'https://www.vg.no/i/abc',
    published: { niceformat: '19.09.2026, 22:00', timestamp: '2026-09-19T20:00:00.000Z' },
  },
  { id: 'skip', title: 'Uten lenke' },
]);
assert.equal(vg.length, 1);
assert.equal(vg[0].title, 'Tittel');
assert.equal(vg[0].source, 'VG');

const rss = parseRssItems(`
  <rss><channel>
    <item>
      <title><![CDATA[Mann &amp; bil]]></title>
      <link>https://www.nrk.no/a</link>
      <description><![CDATA[Kort <b>tekst</b>]]></description>
      <pubDate>Sat, 19 Sep 2026 20:00:00 GMT</pubDate>
    </item>
  </channel></rss>
`, { source: 'NRK', limit: 3 });
assert.equal(rss.length, 1);
assert.equal(rss[0].title, 'Mann & bil');
assert.equal(rss[0].summary, 'Kort tekst');
assert.equal(rss[0].source, 'NRK');

const quote = parseYahooChart({
  chart: {
    result: [{
      meta: {
        symbol: 'EQNR.OL',
        shortName: 'EQUINOR',
        currency: 'NOK',
        regularMarketPrice: 250,
        chartPreviousClose: 240,
      },
      indicators: { quote: [{ close: [230, 240, 250] }] },
    }],
  },
});
assert.equal(quote.name, 'EQUINOR');
assert.equal(quote.price, 250);
assert.ok(Math.abs(quote.changePct - (10 / 240) * 100) < 0.01);
assert.equal(quote.closes.length, 3);
assert.equal(parseYahooChart({ chart: { result: [] } }), null);

const power = parsePowerPrices([
  { NOK_per_kWh: 0.5, time_start: '2026-09-19T12:00:00+02:00', time_end: '2026-09-19T13:00:00+02:00' },
  { NOK_per_kWh: 0.2, time_start: '2026-09-19T13:00:00+02:00', time_end: '2026-09-19T14:00:00+02:00' },
], { now: new Date('2026-09-19T10:30:00Z') });
assert.equal(power.currentOre, 50);
assert.equal(power.minOre, 20);
assert.equal(power.cheapHour, '13');
assert.equal(power.hours[0].active, true);

const fx = parseNorgesBankCsv(`FREQ;Frekvens;BASE_CUR;Basisvaluta;QUOTE_CUR;Kvoteringsvaluta;TENOR;Løpetid;DECIMALS;CALCULATED;UNIT_MULT;Multiplikator;COLLECTION;Innsamlingstidspunkt;TIME_PERIOD;OBS_VALUE
B;Virkedag;USD;Amerikanske dollar;NOK;Norske kroner;SP;Spot;4;false;0;Enheter;C;x;2026-09-17;9,40
B;Virkedag;USD;Amerikanske dollar;NOK;Norske kroner;SP;Spot;4;false;0;Enheter;C;x;2026-09-18;9,50
B;Virkedag;SEK;Svenske kroner;NOK;Norske kroner;SP;Spot;2;false;2;Hundre;C;x;2026-09-18;95,73`);
assert.equal(fx.find((r) => r.code === 'USD').nok, 9.5);
assert.ok(Math.abs(fx.find((r) => r.code === 'USD').change - 0.1) < 0.001);
assert.equal(fx.find((r) => r.code === 'SEK').per, 100);

const holiday = parseNextHoliday([
  { date: '2026-12-25', localName: 'Første juledag' },
  { date: '2026-12-24', localName: 'Ignoreres' },
], { todayKey: '2026-12-24' });
assert.equal(holiday.name, 'Ignoreres');
assert.equal(holiday.when, 'I dag');
const later = parseNextHoliday([
  { date: '2026-12-25', localName: 'Første juledag' },
], { todayKey: '2026-12-24' });
assert.equal(later.when, 'I morgen');

assert.equal(aqiBand(12).label, 'Veldig god');
assert.equal(aqiBand(90).tone, 'bad');
assert.equal(parseAirQuality({ current: { european_aqi: 16, pm2_5: 2.74 } }).pm25, 2.7);
assert.match(formatNb(48.4, 1), /48,4/);
assert.equal(formatSignedPct(1.2), '+1,2 %');
assert.equal(formatSignedPct(-0.4).startsWith('-'), true);

clearLiveWidgetCache();
const calls = [];
const loaded = await loadLiveWidgets({
  enabled: ['news', 'stocks', 'holiday'],
  newsSource: 'vg',
  stockSymbol: 'EQNR.OL',
}, {
  now: new Date('2026-09-19T12:00:00Z'),
  fetchImpl: async (url) => {
    calls.push(url);
    if (String(url).includes('vg.no')) {
      return { ok: true, text: async () => JSON.stringify([{ id: '1', title: 'Sak', url: 'https://www.vg.no/i/1' }]) };
    }
    if (String(url).includes('yahoo')) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          chart: { result: [{ meta: { symbol: 'EQNR.OL', shortName: 'EQUINOR', regularMarketPrice: 10, chartPreviousClose: 9, currency: 'NOK' } }] },
        }),
      };
    }
    return { ok: true, text: async () => '[]' };
  },
});
assert.equal(loaded.data.news.items[0].title, 'Sak');
assert.equal(loaded.data.stocks.quotes[0].price, 10);
assert.ok(loaded.errors.holiday);
assert.equal(calls.some((u) => String(u).includes('hvakosterstrommen')), false);
assert.equal(calls.filter((u) => String(u).includes('vg.no')).length, 1);

const again = await loadLiveWidgets({
  enabled: ['news'],
  newsSource: 'vg',
}, {
  fetchImpl: async () => {
    throw new Error('skal bruke cache');
  },
});
assert.equal(again.data.news.items[0].title, 'Sak');

clearLiveWidgetCache();
let nrkHits = 0;
const fallbackNews = await loadLiveWidgets({
  enabled: ['news'],
  newsSource: 'vg',
}, {
  fetchImpl: async (url) => {
    if (String(url).includes('nrk.no')) {
      nrkHits += 1;
      return { ok: true, text: async () => '<rss><channel><item><title>NRK-sak</title><link>https://www.nrk.no/a</link></item></channel></rss>' };
    }
    throw new Error('Failed to fetch');
  },
  proxyImpl: async () => { throw new Error('functions/not-found'); },
});
assert.equal(fallbackNews.data.news.sourceName, 'NRK');
assert.equal(fallbackNews.data.news.fallbackFrom, 'VG');
assert.equal(fallbackNews.data.news.items[0].title, 'NRK-sak');
assert.equal(nrkHits, 1);

const proxied = [];
clearLiveWidgetCache();
const viaProxy = await loadLiveWidgets({
  enabled: ['news'],
  newsSource: 'dn',
}, {
  fetchImpl: async () => { throw new Error('Failed to fetch'); },
  proxyImpl: async (url) => {
    proxied.push(url);
    return `<rss><channel><item><title>DN-sak</title><link>https://www.dn.no/a</link></item></channel></rss>`;
  },
});
assert.equal(viaProxy.data.news.items[0].title, 'DN-sak');
assert.equal(proxied.length, 1);
assert.match(proxied[0], /dn\.no/);

clearLiveWidgetCache();
const multi = await loadLiveWidgets({
  enabled: ['stocks'],
  stockSymbols: ['EQNR.OL', 'DNB.OL'],
}, {
  fetchImpl: async (url) => {
    const symbol = String(url).includes('DNB') ? 'DNB.OL' : 'EQNR.OL';
    return {
      ok: true,
      text: async () => JSON.stringify({
        chart: { result: [{ meta: { symbol, shortName: symbol, regularMarketPrice: symbol === 'DNB.OL' ? 20 : 10, chartPreviousClose: 9, currency: 'NOK' } }] },
      }),
    };
  },
});
assert.equal(multi.data.stocks.quotes.length, 2);
assert.equal(multi.data.stocks.quotes.find((q) => q.symbol === 'DNB.OL').price, 20);

clearLiveWidgetCache();
const brokenStock = await loadLiveWidgets({
  enabled: ['stocks'],
  stockSymbol: 'EQNR.OL',
}, {
  fetchImpl: async () => { throw new Error('internal'); },
});
assert.match(brokenStock.errors.stocks, /Kunne ikke hente/);
assert.equal(brokenStock.data.stocks, undefined);

clearLiveWidgetCache();
const skippedDirect = [];
const preferProxyNews = await loadLiveWidgets({
  enabled: ['news'],
  newsSource: 'dn',
}, {
  preferProxy: true,
  fetchImpl: async (url) => {
    skippedDirect.push(url);
    throw new Error('should not fetch VG/DN directly');
  },
  proxyImpl: async (url) => {
    assert.match(url, /dn\.no/);
    return `<rss><channel><item><title>DN via proxy</title><link>https://www.dn.no/a</link></item></channel></rss>`;
  },
});
assert.equal(preferProxyNews.data.news.items[0].title, 'DN via proxy');
assert.equal(skippedDirect.length, 0);

clearLiveWidgetCache();
const skippedYahoo = [];
const preferProxyStock = await loadLiveWidgets({
  enabled: ['stocks'],
  stockSymbol: 'EQNR.OL',
}, {
  preferProxy: true,
  fetchImpl: async (url) => {
    skippedYahoo.push(url);
    throw new Error('should not fetch Yahoo directly');
  },
  proxyImpl: async () => JSON.stringify({
    chart: { result: [{ meta: { symbol: 'EQNR.OL', shortName: 'EQUINOR', regularMarketPrice: 12, chartPreviousClose: 10, currency: 'NOK' } }] },
  }),
});
assert.equal(preferProxyStock.data.stocks.quotes[0].price, 12);
assert.equal(skippedYahoo.length, 0);

console.log('liveWidgets.test.mjs: ok');
