import assert from 'node:assert/strict';
import { mapsEmbed, mapsUrl } from './locationMaps.js';

assert.equal(mapsEmbed(null), null);
assert.equal(mapsEmbed({ label: 'Oslo' }), null);
assert.equal(mapsEmbed({ lat: 'x', lng: 10 }), null);

const embed = mapsEmbed({ lat: 59.91, lng: 10.75 });
assert.ok(embed.includes('openstreetmap.org/export/embed.html'));
assert.ok(embed.includes('marker=59.91'));
assert.ok(embed.includes('10.75'));
assert.ok(!embed.includes('maps.google.com'));
assert.ok(!embed.includes('output=embed'));

const framed = mapsEmbed({ lat: 60, lng: 11 }, { zoomDelta: 0.02 });
assert.ok(framed.includes('bbox='));
assert.ok(framed.includes('10.98') || framed.includes(encodeURIComponent('10.98')));

assert.equal(
  mapsUrl({ lat: 59.91, lng: 10.75 }),
  'https://www.google.com/maps?q=59.91,10.75',
);
assert.ok(mapsUrl({ label: 'Oslo' }).includes('Oslo'));
assert.equal(mapsUrl(null), 'https://www.google.com/maps');

assert.ok(mapsEmbed({ lat: 0, lng: 0 })?.includes('marker=0'));
assert.ok(mapsUrl({ lat: 0, lng: 10 }).includes('q=0,10'));

console.log('location.test.mjs: ok');
