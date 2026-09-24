import assert from 'node:assert/strict';
import {
  formatMatrikkelnummer,
  normalizeOrgnummer,
  formatOrgnummer,
  normalizeKartverketAdresse,
  normalizeKartverketEiendom,
  normalizeBrregEnhet,
  buildSeeiendomUrl,
  buildOsmMapUrl,
  buildBrregUrl,
  searchKartverketAdresser,
  searchBrregEnheter,
  searchKartverketEiendomByPunkt,
  parseNorwegianAddressQuery,
  rankKartverketAdresse,
  boligSummaryLine,
  BOLIG_DOC_KINDS,
  CONTRACTOR_SERVICES,
} from './boligmappaApis.js';

assert.equal(formatMatrikkelnummer({ gardsnummer: 207, bruksnummer: 80 }), '207/80');
assert.equal(formatMatrikkelnummer({ gardsnummer: 1, bruksnummer: 2, festenummer: 3 }), '1/2/3');
assert.equal(
  formatMatrikkelnummer({ gardsnummer: 1, bruksnummer: 2, festenummer: 0, seksjonsnummer: 4 }),
  '1/2/0/4',
);
assert.equal(formatMatrikkelnummer({}), '');

assert.equal(normalizeOrgnummer('998 131 650'), '998131650');
assert.equal(normalizeOrgnummer('123'), '');
assert.equal(formatOrgnummer('998131650'), '998 131 650');

const parsedOslo = parseNorwegianAddressQuery('Karl Johans gate 1 Oslo');
assert.equal(parsedOslo.adressenavn, 'Karl Johans gate');
assert.equal(parsedOslo.nummer, 1);
assert.equal(parsedOslo.bokstav, '');
assert.equal(parsedOslo.sted, 'Oslo');

const parsedLetter = parseNorwegianAddressQuery('Storgata 15B, 0182 Oslo');
assert.equal(parsedLetter.adressenavn, 'Storgata');
assert.equal(parsedLetter.nummer, 15);
assert.equal(parsedLetter.bokstav, 'B');
assert.equal(parsedLetter.postnummer, '0182');
assert.equal(parsedLetter.sted, 'Oslo');

const addr = normalizeKartverketAdresse({
  adressenavn: 'Karl Johans gate',
  adressetekst: 'Karl Johans gate 1',
  nummer: 1,
  bokstav: '',
  kommunenummer: '0301',
  kommunenavn: 'OSLO',
  gardsnummer: 207,
  bruksnummer: 80,
  festenummer: 0,
  poststed: 'OSLO',
  postnummer: '0154',
  bruksenhetsnummer: ['H0101'],
  representasjonspunkt: { lat: 59.91, lon: 10.75 },
});
assert.equal(addr.matrikkelnummertekst, '207/80');
assert.equal(addr.label, 'Karl Johans gate 1, 0154 OSLO');
assert.equal(addr.lat, 59.91);
assert.equal(addr.source, 'kartverket.adresser');
assert.ok(addr.id);

const sarpsborg = normalizeKartverketAdresse({
  adressenavn: 'Karl Johans gate',
  adressetekst: 'Karl Johans gate 1',
  nummer: 1,
  kommunenummer: '3105',
  kommunenavn: 'SARPSBORG',
  gardsnummer: 1,
  bruksnummer: 1,
  poststed: 'SARPSBORG',
  postnummer: '1706',
  representasjonspunkt: { lat: 59.28, lon: 11.11 },
});
assert.ok(
  rankKartverketAdresse(addr, parsedOslo) > rankKartverketAdresse(sarpsborg, parsedOslo),
  'Oslo-treff skal rangere høyere når sted=Oslo',
);

const eiendom = normalizeKartverketEiendom({
  kommunenummer: '0301',
  gardsnummer: 207,
  bruksnummer: 80,
  matrikkelnummertekst: '207/80',
  meterFraPunkt: 0,
  nøyaktighetsklasseteig: 'Gult',
  representasjonspunkt: { nord: 59.91, øst: 10.75 },
});
assert.equal(eiendom.lat, 59.91);
assert.equal(eiendom.lon, 10.75);
assert.equal(eiendom.noyaktighetsklasse, 'Gult');

const enhet = normalizeBrregEnhet({
  organisasjonsnummer: '998131650',
  navn: 'BOLIGMAPPA AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  naeringskode1: { kode: '62.200', beskrivelse: 'IT' },
  forretningsadresse: {
    adresse: ['Dronning Mauds gate 10'],
    postnummer: '0250',
    poststed: 'OSLO',
  },
  konkurs: false,
});
assert.equal(enhet.organisasjonsnummer, '998131650');
assert.match(enhet.addressLabel, /Dronning Mauds gate 10/);
assert.equal(enhet.organisasjonsform, 'Aksjeselskap');

assert.equal(
  buildSeeiendomUrl({ kommunenummer: '301', gardsnummer: 207, bruksnummer: 80 }),
  'https://seeiendom.kartverket.no/?kommunenr=0301&gardsnr=207&bruksnr=80&festenr=0',
);
assert.equal(buildSeeiendomUrl({}), null);
assert.match(buildOsmMapUrl(59.91, 10.75), /openstreetmap\.org/);
assert.equal(
  buildBrregUrl('998131650'),
  'https://virksomhet.brreg.no/nb/oppslag/enhet/998131650',
);

assert.ok(BOLIG_DOC_KINDS.some((k) => k.id === 'manual'));
assert.ok(BOLIG_DOC_KINDS.some((k) => k.id === 'quote'));
assert.ok(BOLIG_DOC_KINDS.some((k) => k.id === 'invoice'));
assert.ok(BOLIG_DOC_KINDS.some((k) => k.id === 'receipt'));
assert.ok(CONTRACTOR_SERVICES.includes('Rørlegger'));
assert.ok(CONTRACTOR_SERVICES.includes('Elektriker'));
assert.equal(
  boligSummaryLine({
    adressetekst: 'Karl Johans gate 1',
    matrikkelnummertekst: '207/80',
    matrikkel: { kommunenummer: '0301' },
  }),
  'Karl Johans gate 1 · matrikkel 0301/207/80',
);

// Live smoke against open APIs (skip soft-fail if network blocked).
async function liveSmoke() {
  try {
    const addresses = await searchKartverketAdresser('Karl Johans gate 1 Oslo', {
      treffPerSide: 5,
    });
    assert.ok(addresses.results.length >= 1, 'expected Kartverket address hits');
    assert.equal(addresses.results[0].matrikkel?.kommunenummer, '0301', 'Oslo should rank first');
    const oslo = addresses.results.find((a) => a.matrikkel?.kommunenummer === '0301');
    assert.ok(oslo, 'expected Oslo hit');
    assert.equal(oslo.matrikkel.gardsnummer, 207);
    assert.ok(oslo.id);

    const nearby = await searchKartverketEiendomByPunkt({
      lat: oslo.lat,
      lon: oslo.lon,
      radius: 40,
      treffPerSide: 3,
    });
    assert.ok(nearby.results.length >= 1, 'expected nearby eiendom');

    const firms = await searchBrregEnheter('Boligmappa', { size: 3 });
    assert.ok(firms.results.some((f) => f.organisasjonsnummer === '998131650'));
    console.log('boligmappaApis.test.mjs: ok (unit + live)');
  } catch (e) {
    if (e?.status || /fetch|network|ENOTFOUND|ECONN/i.test(String(e?.message || e))) {
      console.log(`boligmappaApis.test.mjs: ok (unit; live skipped: ${e.message || e})`);
      return;
    }
    throw e;
  }
}

await liveSmoke();
