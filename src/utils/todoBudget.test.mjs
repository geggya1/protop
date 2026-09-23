import assert from 'node:assert/strict';
import { isoWeekKeys, weeklyOccurrences } from './dates.js';
import {
  weekRewardCap,
  possibleInKeys,
  weekPossibleInMode,
  choreDraftForWeekScore,
  weekKeysForDateKey,
  budgetAnchorDateKey,
} from './todoBudget.js';
import { buildTodoRecurrenceFields } from './todoRecurrence.js';

assert.equal(weekRewardCap(70, 61), 70);
assert.equal(weekRewardCap(0, 61), 61);
assert.equal(weekRewardCap('', 12), 12);

// Uke 36 2026: man 31. aug – søn 6. sep
const weekKeys = isoWeekKeys(new Date(2026, 7, 31));
assert.deepEqual(weekKeys[0], '2026-08-31');
assert.deepEqual(weekKeys[6], '2026-09-06');
assert.deepEqual(weekKeysForDateKey('2026-08-31'), weekKeys);

assert.equal(budgetAnchorDateKey({
  startKey: '2026-08-31',
  selectedDateKey: '2026-08-23',
}), '2026-08-31');
assert.equal(budgetAnchorDateKey({
  dueKey: '2026-09-02',
  selectedDateKey: '2026-08-23',
}), '2026-09-02');
assert.equal(budgetAnchorDateKey({ selectedDateKey: '2026-08-31' }), '2026-08-31');

const dailyFromFriday = {
  type: 'daily',
  rewardType: 'money',
  moneyValue: 3,
  startKey: '2026-09-04',
};
// Naive weeklyOccurrences counts 7 days even when the chore starts mid-week.
assert.equal(weeklyOccurrences('daily', 0) * 3, 21);
assert.equal(possibleInKeys([dailyFromFriday], weekKeys), 9);

const leftover = {
  type: 'daily',
  rewardType: 'money',
  moneyValue: 10,
  startKey: '2026-08-01',
  endKey: '2026-08-23',
};
assert.equal(possibleInKeys([leftover], weekKeys), 0);

const planned = { type: 'daily', rewardType: 'money', moneyValue: 1, startKey: '2026-01-01' };
assert.equal(weekPossibleInMode([planned, leftover], weekKeys, 'money'), 7);

const dailyFields = buildTodoRecurrenceFields({
  preset: 'daily',
  customType: 'daily',
  customInterval: 1,
  recurrenceByDays: [],
  recurrenceUntilKey: '',
  baseDay: 1,
});
const draft = choreDraftForWeekScore({
  rewardMode: 'money',
  unitValue: 2,
  recurrenceFields: dailyFields,
  startKey: '2026-08-31',
  endKey: null,
  dueKey: null,
});
assert.equal(possibleInKeys([draft], weekKeys), 14);

const onceFields = buildTodoRecurrenceFields({
  preset: 'never',
  customType: 'weekly',
  customInterval: 1,
  recurrenceByDays: [],
  recurrenceUntilKey: '',
});
const onceDraft = choreDraftForWeekScore({
  rewardMode: 'money',
  unitValue: 8,
  recurrenceFields: onceFields,
  startKey: '2026-08-31',
  endKey: '2026-08-31',
  dueKey: '2026-08-31',
});
assert.equal(possibleInKeys([onceDraft], weekKeys), 8);
assert.equal(possibleInKeys([onceDraft], isoWeekKeys(new Date(2026, 7, 24))), 0);

console.log('todoBudget.test.mjs: ok');
