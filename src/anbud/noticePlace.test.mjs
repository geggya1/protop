import assert from 'node:assert/strict';
import { locateNotice, mapFollowsList, mapPinsForNotices, nextMapPinIndex, noticeMapScope, unboundPlace } from './noticePlace.js';
import { pinPopupHtml, tenderMapDocument } from './tenderMapHtml.js';

assert.equal(locateNotice({ places: ['Nordland/Nordlánnda'] }).label, 'Nordland');
assert.ok(locateNotice({ places: ['Nordland/Nordlánnda'] }).lat > 66);
assert.equal(locateNotice({ locationIds: ['NO081'] }).label, 'Oslo');
assert.equal(locateNotice({ places: ['Oslo'] }).precision, 'sted');
assert.equal(locateNotice({ title: 'Scanning av UNN Narvik Sykehus', places: [] }).label, 'Narvik');
assert.equal(locateNotice({ buyer: 'Aura kommune', places: [] }).label, 'Aure');
assert.equal(locateNotice({ places: ['NOR'] }).label, 'Norge');
assert.equal(locateNotice({ places: [] }), null);
assert.equal(unboundPlace({ places: ['Ikke stedbunden'] }), true);
assert.equal(unboundPlace({ places: ['Oslo'] }), false);
assert.equal(noticeMapScope({ title: 'Rammeavtale i Vågan', places: ['Ikke stedbunden'] }).coverage, 'land');
assert.equal(noticeMapScope({ places: ['NOR'] }).coverage, 'land');
assert.equal(noticeMapScope({ places: ['Oslo'] }).coverage, 'punkt');
assert.equal(noticeMapScope({ places: [] }).label, 'Hele Norge');

const national = mapPinsForNotices([
  { id: 'n', title: 'Rammeavtale i Vågan', places: ['Ikke stedbunden'], decision: 'ubestemt' },
  { id: 'o', title: 'Oslo bro', places: ['Oslo'], decision: 'ubestemt' },
], { asShown: true });
assert.equal(national.at(-1).id, 'n');
assert.equal(national.find((row) => row.id === 'n').coverage, 'land');
assert.equal(national.find((row) => row.id === 'n').label, 'Hele Norge');
assert.equal(national.find((row) => row.id === 'o').label, 'Oslo');
assert.notEqual(national.find((row) => row.id === 'n').precision, 'sted');

const pins = mapPinsForNotices([
  { id: '1', title: 'Bro', places: ['Nordland'], decision: 'ubestemt' },
  { id: '2', title: 'Kai', places: ['Nordland'], decision: 'aktuell' },
  { id: '3', title: 'Papir', places: ['Oslo'], decision: 'forkastet' },
  { id: '4', title: 'Utløpt', places: ['Bergen'], decision: 'ubestemt' },
], { expired: (row) => row.id === '4' });
assert.equal(pins.length, 2);
assert.equal(pins.filter((row) => row.kind === 'aktuell').length, 1);
assert.notEqual(pins[0].lat, pins[1].lat);

const shown = mapPinsForNotices([
  { id: '1', title: 'Bro', places: ['Oslo'], decision: 'ubestemt' },
  { id: '2', title: 'Kai', places: ['Bergen'], decision: 'aktuell' },
  { id: '3', title: 'Papir', places: ['Tromsø'], decision: 'forkastet' },
  { id: '4', title: 'Tilbud', places: ['Oslo'], decision: 'tilbud' },
], { asShown: true });
assert.deepEqual(shown.map((row) => row.kind).sort(), ['aktuell', 'ny', 'uaktuell']);
assert.equal(mapPinsForNotices([
  { id: '2', title: 'Kai', places: ['Bergen'], decision: 'aktuell' },
], { asShown: true }).length, 1);
assert.equal(mapFollowsList('nye'), true);
assert.equal(mapFollowsList('aktuelle'), true);
assert.equal(mapFollowsList('uaktuelle'), true);
assert.equal(mapFollowsList('alle'), false);
assert.equal(mapFollowsList('utlopt'), false);

const workPins = mapPinsForNotices([
  { id: '1', title: 'Uten sted', buyer: 'Ukjent AS', places: [], decision: 'aktuell' },
  { id: '2', title: 'Oslo', places: ['Oslo'], decision: 'aktuell' },
  { id: '3', title: 'Hele landet', places: ['Ikke stedbunden'], decision: 'aktuell' },
], { asShown: true, unknownAsLand: false });
assert.deepEqual(workPins.map((row) => row.id), ['2', '3']);
assert.equal(workPins.find((row) => row.id === '3').coverage, 'land');
assert.equal(mapPinsForNotices([
  { id: '1', title: 'Uten sted', places: [], decision: 'aktuell' },
], { asShown: true }).length, 1);

const html = tenderMapDocument(pins, { selectedId: '2' });
const landDoc = tenderMapDocument([
  { id: 'o', title: 'Oslo bro', lat: 59.9, lng: 10.7, kind: 'ny', label: 'Oslo', coverage: 'punkt' },
  { id: 'n', title: 'Rammeavtale', lat: 64.5, lng: 12, kind: 'ny', label: 'Hele Norge', coverage: 'land' },
], { selectedId: 'n' });
assert.match(landDoc, /"coverage":"land"/);
assert.match(landDoc, /L\.polygon\(NORWAY/);
assert.match(landDoc, /ikke stedbunden/);
assert.match(landDoc, /showCountry/);
const landBubble = pinPopupHtml({
  id: 'n', title: 'Rammeavtale', label: 'Hele Norge', coverage: 'land', kind: 'ny',
}, 0, 2);
assert.match(landBubble, /Hele Norge · ikke stedbunden/);
const quietBubble = pinPopupHtml({
  id: 'b', title: 'Tilbud', label: 'Kvitsøy', coverage: 'punkt', kind: 'aktuell',
}, 0, 1, { showMark: false, openLabel: 'Åpne tilbudet', kindLabel: 'Tilbud' });
assert.doesNotMatch(quietBubble, /data-mark=/);
assert.match(quietBubble, /Åpne tilbudet/);
assert.match(quietBubble, /Tilbud · Kvitsøy/);
const quietDoc = tenderMapDocument([
  { id: 'b', title: 'Tilbud', lat: 59.1, lng: 5.4, kind: 'aktuell', label: 'Kvitsøy' },
], { showMark: false, openLabel: 'Åpne tilbudet', kindLabel: 'Tilbud' });
assert.match(quietDoc, /const showMark = false/);
assert.match(quietDoc, /if \(!showMark\) return ''/);
assert.match(quietDoc, /const openLabel = "Åpne tilbudet"/);
assert.match(quietDoc, /const kindLabel = "Tilbud"/);

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
assert.ok(bubble.indexOf('data-mark="aktuell"') < bubble.indexOf('Gangbru og fasader'), 'Aktuell skal ligge over tittelen');
assert.ok(bubble.indexOf('data-mark="forkastet"') < bubble.indexOf('Åpne i listen'));
const liveBubble = html.slice(html.indexOf('function popupHtml'), html.indexOf('const layer'));
assert.ok(liveBubble.indexOf('decisionRow(row)') < liveBubble.indexOf('data-open'), 'kartboblen viser merkeknappene før tittelen');
assert.match(html, /lastMarkKey/);
assert.match(html, /touch-action: manipulation/);
assert.match(html, /min-height: 44px/);
assert.match(html, /keepInView: false/);
const lostBranch = html.slice(html.indexOf('const lost'), html.indexOf('if (wasOpen)'));
assert.ok(lostBranch.includes('openPopup'), 'neste nål åpnes når den valgte tas bort');
assert.equal(lostBranch.includes("tell('preview'"), false);
assert.equal(nextMapPinIndex(0, 2), -1);
assert.equal(nextMapPinIndex(5, 5), 4);
assert.equal(nextMapPinIndex(5, 2), 2);
assert.equal(nextMapPinIndex(5, -1), 0);

console.log('noticePlace.test.mjs ok');
