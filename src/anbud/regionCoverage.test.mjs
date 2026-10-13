import assert from 'node:assert/strict';
import {
  alignDepartmentAreas,
  emptyAnbudState,
  noticeInCoverage,
  saveTenderWatch,
  searchCoverage,
  watchFingerprint,
  watchQuery,
} from './model.js';
import {
  clampSideWidth,
  mapHeightForRail,
  mapHeightForSide,
  railMaxWidth,
  alertRailIsOpen,
  settleRailWidth,
  sideWidthFromDrag,
} from './sideWidth.js';

const departments = [
  { id: 'd-nord', name: 'Nord' },
  { id: 'd-ost', name: 'Øst' },
];

let state = saveTenderWatch(emptyAnbudState(), {
  companyName: 'Nord Bygg',
  cpvCodes: ['45000000'],
  nationwide: true,
  departmentAreas: [
    { id: 'd-nord', name: 'Nord', nationwide: false, areas: ['NO071', 'NO072'] },
    { id: 'd-ost', name: 'Øst', nationwide: false, areas: ['NO081'] },
  ],
}).state;

assert.deepEqual(
  watchQuery(state.watch).locationIds.sort(),
  ['NO071', 'NO072', 'NO081'],
);
assert.equal(searchCoverage(state.watch, 'd-nord').areas.map((row) => row.id).join(','), 'NO071,NO072');
assert.equal(searchCoverage(state.watch, 'd-ost').label, 'Øst');
assert.equal(searchCoverage(state.watch, 'd-mangler').areas.length, 0);
assert.equal(searchCoverage(state.watch, 'd-mangler').nationwide, false);

const nord = { locationIds: ['NO071'], places: ['Nordland'] };
const oslo = { locationIds: ['NO081'], places: ['Oslo'] };
assert.equal(noticeInCoverage(nord, searchCoverage(state.watch, 'd-nord')), true);
assert.equal(noticeInCoverage(oslo, searchCoverage(state.watch, 'd-nord')), false);
assert.equal(noticeInCoverage(oslo, searchCoverage(state.watch)), true);

const withNation = saveTenderWatch(state, {
  companyName: 'Nord Bygg',
  cpvCodes: ['45000000'],
  nationwide: true,
  departmentAreas: [
    { id: 'd-nord', name: 'Nord', nationwide: true, areas: [] },
    { id: 'd-ost', name: 'Øst', areas: ['NO081'] },
  ],
}).state;
assert.equal(searchCoverage(withNation.watch).nationwide, true);
assert.deepEqual(watchQuery(withNation.watch).locationIds, []);

const plain = saveTenderWatch(emptyAnbudState(), {
  companyName: 'Nord Bygg',
  cpvCodes: ['45000000', '45310000'],
  areas: ['NO071', 'NO081'],
}).state;
assert.deepEqual(watchQuery(plain.watch).locationIds, ['NO071', 'NO081']);
assert.equal(
  watchFingerprint(plain.watch),
  JSON.stringify({
    v: 2,
    cpv: ['45000000', '45310000'],
    areas: ['NO071', 'NO081'],
    channels: ['doffin', 'ted'],
    keywords: [],
  }),
);
assert.notEqual(watchFingerprint(state.watch), watchFingerprint(plain.watch));

const aligned = alignDepartmentAreas(state.watch.departmentAreas, [
  ...departments,
  { id: 'd-vest', name: 'Vest' },
]);
assert.equal(aligned.length, 3);
assert.equal(aligned[2].nationwide, false);
assert.deepEqual(aligned[2].areas, []);
assert.equal(aligned[0].name, 'Nord');

assert.equal(sideWidthFromDrag(360, 800, 700), 460);
assert.equal(sideWidthFromDrag(360, 100, 400), 280);
assert.equal(sideWidthFromDrag(800, 100, 0), 840);
assert.equal(clampSideWidth('nei'), 360);
assert.equal(mapHeightForSide(360), 440);
assert.ok(mapHeightForSide(700) > 440);
assert.equal(mapHeightForSide(840), 680);
assert.equal(alertRailIsOpen(44), false);
assert.equal(alertRailIsOpen(90), false);
assert.equal(alertRailIsOpen(93), true);
assert.equal(settleRailWidth(44), 44);
assert.equal(settleRailWidth(90), 44);
assert.equal(settleRailWidth(93), 280);
assert.equal(settleRailWidth(360), 360);
assert.equal(settleRailWidth(900, { max: 840 }), 840);
assert.equal(settleRailWidth(200, { max: 220 }), 220);
assert.equal(settleRailWidth('nei'), 44);
assert.equal(railMaxWidth(390), 378);
assert.equal(railMaxWidth(2000), 840);
assert.equal(railMaxWidth(80), 68);
assert.equal(sideWidthFromDrag(44, 400, 80, { min: 44, max: 378 }), 364);
assert.equal(mapHeightForRail(360, 800), 306);
assert.equal(mapHeightForRail(360, 640), 269);

console.log('regionCoverage.test.mjs ok');
