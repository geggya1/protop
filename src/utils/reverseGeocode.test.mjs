import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REVERSE_GEOCODE_HOSTS, kartverketPunktsokUrl, reverseGeocodeWith,
} from './reverseGeocode.js';

const here = dirname(fileURLToPath(import.meta.url));

function fakeFetch(answers) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    const host = new URL(url).hostname;
    const body = answers[host];
    if (body === undefined) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
  return { impl, calls };
}

// Posisjonen sendes ikke lenger til BigDataCloud (Australia, GRUNN-02).
for (const file of ['location.js', 'reverseGeocode.js']) {
  assert.doesNotMatch(readFileSync(join(here, file), 'utf8'), /bigdatacloud\.net/i, `${file} bruker BigDataCloud`);
}
assert.deepEqual(REVERSE_GEOCODE_HOSTS, ['ws.geonorge.no', 'photon.komoot.io', 'nominatim.openstreetmap.org']);

const url = new URL(kartverketPunktsokUrl(58.85, 5.73));
assert.equal(url.hostname, 'ws.geonorge.no');
assert.equal(url.pathname, '/adresser/v1/punktsok');
assert.equal(url.searchParams.get('lat'), '58.85');
assert.equal(url.searchParams.get('lon'), '5.73');
assert.ok(Number(url.searchParams.get('radius')) > 0);

// Kartverket først: nærmeste adresse.
{
  const { impl, calls } = fakeFetch({
    'ws.geonorge.no': {
      adresser: [{
        adressetekst: 'Svanholmen 7', postnummer: '4313', poststed: 'SANDNES', representasjonspunkt: { lat: 58.85, lon: 5.73 },
      }],
    },
  });
  const place = await reverseGeocodeWith(58.85, 5.73, { fetchImpl: impl });
  assert.equal(place.label, 'Svanholmen 7, 4313 SANDNES');
  assert.equal(place.source, 'kartverket');
  assert.equal(place.lat, 58.85);
  assert.equal(calls.length, 1);
}

// Utenfor Norge (ingen adresse hos Kartverket): Photon, så Nominatim.
{
  const { impl, calls } = fakeFetch({
    'ws.geonorge.no': { adresser: [] },
    'nominatim.openstreetmap.org': { display_name: 'Storgatan 1, Göteborg, Sverige' },
  });
  const place = await reverseGeocodeWith(57.7, 11.97, { fetchImpl: impl, nominatimHeaders: { Accept: 'application/json' } });
  assert.equal(place.source, 'osm');
  assert.equal(place.label, 'Storgatan 1, Göteborg, Sverige');
  assert.deepEqual(calls.map((row) => new URL(row).hostname), REVERSE_GEOCODE_HOSTS);
}

// Ingen svarer: koordinatene som tekst, og ingen andre verter er spurt.
{
  const { impl, calls } = fakeFetch({});
  const place = await reverseGeocodeWith(60, 10, { fetchImpl: impl });
  assert.equal(place.source, 'coords');
  assert.equal(place.label, '60.0000, 10.0000');
  assert.ok(calls.every((row) => REVERSE_GEOCODE_HOSTS.includes(new URL(row).hostname)));
}

await assert.rejects(reverseGeocodeWith('x', 10, { fetchImpl: fakeFetch({}).impl }), /invalid-coords/);

console.log('reverseGeocode.test.mjs: ok');
