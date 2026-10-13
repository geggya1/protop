import assert from 'node:assert/strict';
import { inNorway, looksLikePlaceQuery, pickStedsnavn } from './geocodePlace.js';

function hit(name, type, lat, lng, knr) {
  return {
    skrivemåte: name,
    navneobjekttype: type,
    navnestatus: 'hovednavn',
    representasjonspunkt: { nord: lat, øst: lng },
    kommuner: knr == null ? [] : [{ kommunenummer: String(knr) }],
  };
}

const strandWild = [
  hit('Strandbukta', 'Fjord', 70.77, 25.64, null),
  hit('Strand', 'Øy i sjø', 70.1, 25.1, null),
  hit('Strand', 'Tettsted', 59.02, 6.04, 1130),
  hit('Strand', 'Kommune', 59.03, 6.05, 1130),
  hit('Strand', 'Bruk', 59.1, 6.1, 1130),
];

const strand = pickStedsnavn(strandWild, 'Strand');
assert.equal(strand.label, 'Strand');
assert.equal(strand.lat, 59.03);
assert.equal(strand.lng, 6.05);
assert.equal(strand.source, 'kartverket');

const kvitsøy = pickStedsnavn([
  hit('Kvitsøy', 'Øy i sjø', 59.07, 5.4, 1144),
  hit('Kvitsøy kommune', 'Kommune', 59.06471, 5.40545, 1144),
], 'Kvitsøy kommune');
assert.equal(kvitsøy.lat, 59.06471);
assert.equal(kvitsøy.lng, 5.40545);

const våler = pickStedsnavn([
  hit('Våler', 'Naturreservat', 59.2, 11.1, null),
  hit('Våler', 'Kommune', 60.68, 11.83, 3419),
  hit('Våler', 'Kommune', 59.49, 10.87, 3114),
], 'Våler');
assert.equal(våler.lat, 59.49);
assert.equal(våler.lng, 10.87);

assert.equal(pickStedsnavn([
  hit('Strand', 'Gård', 6640000, 300000, 1130),
], 'Strand'), null);
assert.equal(pickStedsnavn([
  hit('Strand', 'Kommune', 48.1, 2.3, 1130),
], 'Strand'), null);

const os = pickStedsnavn([
  hit('Oslo kommune', 'Kommune', 59.91, 10.75, 301),
  hit('Os kommune', 'Kommune', 60.19, 5.47, 1243),
], 'Os');
assert.equal(os.lat, 60.19);

assert.equal(inNorway(59.06, 5.41), true);
assert.equal(inNorway(70.77, 25.64), true);
assert.equal(inNorway(6640000, 300000), false);
assert.equal(inNorway(51.5, -0.1), false);

assert.equal(looksLikePlaceQuery('Kvitsøy kommune'), true);
assert.equal(looksLikePlaceQuery('Strand'), true);
assert.equal(looksLikePlaceQuery('Våler'), true);
assert.equal(looksLikePlaceQuery('Sykehusinnkjøp HF'), false);
assert.equal(looksLikePlaceQuery('Statsbygg'), false);
assert.equal(looksLikePlaceQuery('Rammeavtale tekniske rådgivning'), false);
assert.equal(looksLikePlaceQuery('Rammeavtale - tekniske rådgivningstjenester for kommunen og videre'), false);

console.log('geocodePlace.test.mjs ok');
