import assert from 'node:assert/strict';
import { locateNotice, mapPinsForNotices } from './noticePlace.js';
import { pinPopupHtml, tenderMapDocument } from './tenderMapHtml.js';

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
assert.match(html, /Åpne i listen/);
assert.match(html, /data-act="next"/);
assert.match(html, /Forrige/);
assert.match(html, /tell\('open'/);
assert.match(html, /tell\('preview'/);
assert.match(html, /tell\('mark'/);
assert.match(html, /data-mark="aktuell"/);
assert.match(html, /data-mark="forkastet"/);
assert.match(html, /Uaktuell/);
const markClick = html.match(/closest\('\[data-mark\]'\)[\s\S]*?return;/);
assert.ok(markClick, 'merk-knapp må stoppe før forrige/neste');
assert.match(markClick[0], /tell\('mark'/);
assert.equal(markClick[0].includes('show('), false);
const pinClick = html.match(/marker\.on\('click', \(\) => \{[\s\S]*?\n  \}\);/);
assert.ok(pinClick, 'nåleklikk må åpne boble');
assert.match(pinClick[0], /tell\('preview'/);
assert.match(pinClick[0], /openPopup\(\)/);
assert.equal(pinClick[0].includes("tell('open'"), false);

const bubble = pinPopupHtml({
  id: '2026-1',
  title: 'Gangbru og fasader',
  buyer: 'Oslo kommune',
  deadline: '20.10.2026',
  label: 'Oslo',
  kind: 'aktuell',
}, 0, 2);
assert.match(bubble, /Gangbru og fasader/);
assert.match(bubble, /Åpne i listen/);
assert.match(bubble, /data-open="2026-1"/);
assert.match(bubble, /1 \/ 2/);
assert.match(bubble, /Forrige/);
assert.match(bubble, /Neste/);
assert.match(bubble, /Oslo kommune/);
assert.match(bubble, /data-mark="aktuell"/);
assert.match(bubble, /data-mark="forkastet"/);
assert.match(bubble, /Merk som aktuell/);
assert.match(bubble, /Merk som uaktuell/);
assert.match(bubble, /aria-pressed="true"/);
assert.match(bubble, /class="mark aktuell on"/);

console.log('noticePlace.test.mjs ok');
