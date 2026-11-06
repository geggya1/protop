import assert from 'node:assert/strict';
import { colorForFamilyEvent, FAMILY_CALENDAR_COLOR } from './calendarColors.js';
import { isCalendarLayerHidden, memberLayerId, calendarIdOf } from './timeGrid.js';

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
  false,
);
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', memberIds: ['a', 'b'] }, new Set(['mem:a']), 'f1'),
  false,
);

console.log('household calendar colors ok');
