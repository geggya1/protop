import assert from 'node:assert/strict';
import {
  initRepeatFromTodo,
  buildTodoRecurrenceFields,
  todoWeeklyOccurrenceCount,
  isWeeklyRepeatPreset,
  normalizeRecurrenceStartKey,
} from './todoRecurrence.js';

const never = initRepeatFromTodo({ type: 'once' });
assert.equal(never.preset, 'never');

const daily = initRepeatFromTodo({ type: 'daily' });
assert.equal(daily.preset, 'daily');

const weekly = initRepeatFromTodo({ type: 'weekly', daysOfWeek: [1, 3, 5] });
assert.equal(weekly.preset, 'weekly');
assert.deepEqual(weekly.recurrenceByDays, [1, 3, 5]);

const bi = initRepeatFromTodo({ type: 'weekly', everyOtherWeek: true, daysOfWeek: [2] });
assert.equal(bi.preset, 'biweekly');
assert.equal(bi.customInterval, 2);

const fromNew = initRepeatFromTodo({
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 3,
  recurrenceByDays: [1, 2],
});
assert.equal(fromNew.preset, 'custom');
assert.equal(fromNew.customInterval, 3);

const onceFields = buildTodoRecurrenceFields({
  preset: 'never', customType: 'weekly', customInterval: 1, recurrenceByDays: [], recurrenceUntilKey: '',
});
assert.equal(onceFields.type, 'once');
assert.equal(onceFields.recurring, false);

const biFields = buildTodoRecurrenceFields({
  preset: 'biweekly', customType: 'weekly', customInterval: 2, recurrenceByDays: [1, 3], recurrenceUntilKey: '2026-12-01', baseDay: 1,
});
assert.equal(biFields.type, 'weekly');
assert.equal(biFields.everyOtherWeek, true);
assert.equal(biFields.recurrenceInterval, 2);
assert.equal(biFields.endKey, '2026-12-01');
assert.deepEqual(biFields.daysOfWeek, [1, 3]);

assert.equal(isWeeklyRepeatPreset('weekly', 'daily'), true);
assert.equal(isWeeklyRepeatPreset('daily', 'weekly'), false);
assert.equal(todoWeeklyOccurrenceCount({
  preset: 'weekly', customType: 'weekly', customInterval: 1, recurrenceByDays: [1, 2, 3],
}), 3);
assert.equal(todoWeeklyOccurrenceCount({
  preset: 'biweekly', customType: 'weekly', customInterval: 2, recurrenceByDays: [1, 2],
}), 1);

assert.equal(
  normalizeRecurrenceStartKey('2026-09-03', { recurring: true, recurrenceType: 'weekly' }),
  '2026-08-31',
);
assert.equal(
  normalizeRecurrenceStartKey('2026-09-16', { recurring: true, recurrenceType: 'weekly' }),
  '2026-09-14',
);
assert.equal(
  normalizeRecurrenceStartKey('2026-09-03', { recurring: true, recurrenceType: 'daily' }),
  '2026-09-03',
);
// UI may keep a mid-week pick; save still anchors weekly patterns to that week's Monday.
assert.equal(
  normalizeRecurrenceStartKey('2026-09-16', {
    recurring: true, recurrenceType: 'weekly', recurrenceInterval: 1,
  }),
  '2026-09-14',
);

console.log('todoRecurrence.test.mjs: ok');
