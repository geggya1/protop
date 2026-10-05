import assert from 'node:assert/strict';
import { locateNotice, mapPinsForNotices } from './noticePlace.js';
import { tenderMapDocument } from './tenderMapHtml.js';

assert.equal(locateNotice({ places: ['Nordland/Nordlánnda'] }).label, 'Nordland');
assert.ok(locateNotice({ places: ['Nordland/Nordlánnda'] }).lat > 66);
assert.equal(locateNotice({ locationIds: ['NO081'] }).label, 'Oslo');
assert.equal(locateNotice({ places: ['Oslo'] }).precision, 'sted');
assert.equal(locateNotice({ title: 'Scanning av UNN Narvik Sykehus', places: [] }).label, 'Narvik');
assert.equal(locateNotice({ buyer: 'Aura kommune', places: [] }).label, 'Aure');
assert.equal(locateNotice({ places: ['NOR'] }).label, 'Norge');
assert.equal(locateNotice({ places: [] }), null);

const pins = mapPinsForNotices([
  { id: '1', title: 'Bro', places: ['Nordland'], decision: 'ubestemt' },
  { id: '2', title: 'Kai', places: ['Nordland'], decision: 'aktuell' },
  { id: '3', title: 'Papir', places: ['Oslo'], decision: 'forkastet' },
  { id: '4', title: 'Utløpt', places: ['Bergen'], decision: 'ubestemt' },
], { expired: (row) => row.id === '4' });
assert.equal(pins.length, 2);
assert.equal(pins.filter((row) => row.kind === 'aktuell').length, 1);
assert.notEqual(pins[0].lat, pins[1].lat);

const html = tenderMapDocument(pins, { selectedId: '2' });
assert.match(html, /openstreetmap\.org/);
assert.match(html, /leaflet/);
assert.match(html, /"id":"1"/);
assert.match(html, /aktuell/);

console.log('noticePlace.test.mjs ok');
