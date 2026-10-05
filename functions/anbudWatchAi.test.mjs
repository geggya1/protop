import assert from 'node:assert/strict';
import {
  buildLocalProfile,
  extraChunkUrls,
  friendlyProfileError,
  htmlToText,
  humanStringsFromSource,
  interpretProfile,
  scriptUrlsFromHtml,
} from './anbudWatchAi.js';

const html = `<!DOCTYPE html><html><head>
<title>Consult1 AS</title>
<meta name="description" content="Rådgivning og prosjektledelse">
<script type="module" src="/assets/index-D7VfiFR5.js"></script>
</head><body><div id="root"></div></body></html>`;

assert.match(htmlToText(html), /Consult1 AS/);
assert.match(htmlToText(html), /Rådgivning og prosjektledelse/);
assert.deepEqual(
  scriptUrlsFromHtml(html, 'https://consult1.no/tjenester'),
  ['https://consult1.no/assets/index-D7VfiFR5.js'],
);
assert.deepEqual(
  extraChunkUrls('import("./Tjenester-vgjm3uSk.js"); assets/Tjenester-vgjm3uSk.js', 'https://consult1.no/tjenester'),
  ['https://consult1.no/assets/Tjenester-vgjm3uSk.js'],
);

const fromJs = humanStringsFromSource(`
  children:"Prosjektledelse"
  children:"Vi bistår eiere og leietakere med å utvikle og realisere prosjekt innen næring."
  children:"webpack"
`);
assert.ok(fromJs.includes('Prosjektledelse'));
assert.ok(fromJs.some((row) => /eiere og leietakere/.test(row)));
assert.ok(!fromJs.includes('webpack'));

const local = buildLocalProfile({
  companyName: 'CONSULT1 AS',
  description: 'Rådgivende ingeniører innen VVS og energi',
  page: 'Prosjektledelse. Byggeledelse. ITB-koordinator. SHA-koordinator.',
});
assert.match(local.summary, /Rådgivende ingeniører/);
assert.ok(local.keywords.includes('Prosjektledelse'));
assert.ok(local.keywords.includes('Byggeledelse'));
assert.equal(local.engine, 'local');

const interpreted = await interpretProfile({
  companyName: 'CONSULT1 AS',
  description: 'Rådgivende ingeniører innen VVS og energi',
  page: 'Prosjektledelse Byggeledelse ansvarlig søker',
});
assert.equal(interpreted.ok, true);
assert.ok(interpreted.summary);
assert.ok(interpreted.keywords.length >= 2);

assert.match(friendlyProfileError(new Error('AI er ikke tilgjengelig akkurat nå.')), /ikke tilgjengelig/);
assert.match(friendlyProfileError(new Error('Gemini HTTP 503 (gemini-2.5-flash)')), /Kunne ikke tolke bedriften/);
assert.doesNotMatch(friendlyProfileError(new Error('AI er ikke tilgjengelig akkurat nå.')), /dokumentet/);

if (process.env.PROTOP_GEMINI_KEY || process.env.GEMINI_API_KEY) {
  console.log('anbudWatchAi.test.mjs: skipped live site fallback (Gemini key present)');
} else {
  const live = await interpretProfile({
    companyName: 'CONSULT1 AS',
    website: 'https://consult1.no/tjenester',
  });
  assert.equal(live.ok, true);
  assert.ok(live.summary || live.keywords.length, 'live SPA-side skal gi tekst eller søkeord');
  assert.ok(
    live.keywords.some((row) => /prosjekt|bygg|rådgiv|koordinator|entreprenør|næring|rammeavtale|leverandør/i.test(row))
    || /prosjekt|bygg|rådgiv|koordinator|entreprenør|næring/i.test(live.summary),
    `forventet fagord, fikk: ${live.keywords.join(', ')}`,
  );
  console.log('anbudWatchAi.test.mjs live', live.engine, live.keywords.slice(0, 8).join(', '));
}

console.log('anbudWatchAi.test.mjs: all passed');
