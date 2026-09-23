import assert from 'node:assert/strict';
import { colorForFamilyEvent, FAMILY_CALENDAR_COLOR } from './calendarColors.js';
import { isCalendarLayerHidden, memberLayerId, calendarIdOf } from './timeGrid.js';
import { choreFairnessByKid } from './familyProgress.js';

const members = [
  { id: 'a', uid: 'a', color: '#111111', name: 'Ada' },
  { id: 'b', uid: 'b', color: '#222222', name: 'Bo' },
];

assert.equal(colorForFamilyEvent({ memberIds: ['b'] }, members), '#222222');
assert.equal(colorForFamilyEvent({ audience: 'family' }, members), FAMILY_CALENDAR_COLOR);
assert.equal(memberLayerId('a'), 'mem:a');
assert.equal(calendarIdOf({ familyId: 'f1' }, 'f1'), 'fam:f1');
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', memberIds: ['a'] }, new Set(['mem:a']), 'f1'),
  true,
);
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', memberIds: ['a', 'b'] }, new Set(['mem:a']), 'f1'),
  false,
);

const fairness = choreFairnessByKid(
  members.map((m) => ({ id: m.id, name: m.name, color: m.color })),
  { a: [], b: [] },
  ['2026-09-01'],
  '2026-09-01',
);
assert.equal(fairness.length, 2);
assert.equal(fairness[0].sharePct + fairness[1].sharePct, 0);

console.log('household competitive ok');
