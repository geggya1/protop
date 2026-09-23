import assert from 'node:assert/strict';
import {
  choreTitleKey,
  findCrossChildDuplicates,
  collectPendingAttestations,
  kidProgressSummary,
  kidProgressRows,
  weekPlanForChild,
  attestKeysThroughToday,
} from './familyProgress.js';

assert.equal(choreTitleKey('  Ta søppel  '), 'ta søppel');

const weekKeys = [
  '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03',
  '2026-09-04', '2026-09-05', '2026-09-06',
];
const todayKey = '2026-09-03';

const trashA = {
  id: 'a1',
  title: 'Ta søppel',
  type: 'weekly',
  daysOfWeek: [1, 3],
  rewardType: 'money',
  moneyValue: 5,
  completedDates: ['2026-08-31'],
  attestedDates: {},
  startKey: '2026-08-01',
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 1,
  recurrenceByDays: [1, 3],
};
const trashB = {
  ...trashA,
  id: 'b1',
  completedDates: [],
  attestedDates: {},
};
const teeth = {
  id: 't1',
  title: 'Pusse tenner',
  type: 'daily',
  rewardType: 'points',
  points: 2,
  completedDates: ['2026-09-03'],
  attestedDates: { '2026-09-03': { by: 'x', name: 'Eli' } },
  startKey: '2026-08-01',
  recurring: true,
  recurrenceType: 'daily',
  recurrenceInterval: 1,
};

const kids = [
  { id: 'kidA', name: 'Adelen' },
  { id: 'kidB', name: 'Celine' },
];
const kidMap = {
  kidA: [trashA, teeth],
  kidB: [trashB],
};

const dups = findCrossChildDuplicates(kids, kidMap, weekKeys);
assert.ok(dups.some((d) => d.dateKey === '2026-08-31' && choreTitleKey(d.title) === 'ta søppel'));
assert.ok(dups.some((d) => d.dateKey === '2026-09-02'));

const pending = collectPendingAttestations(kids, kidMap, attestKeysThroughToday(weekKeys, todayKey));
assert.ok(pending.some((p) => p.todoId === 'a1' && p.dateKey === '2026-08-31'));
assert.equal(pending.some((p) => p.todoId === 't1'), false); // already attested

const plan = weekPlanForChild([trashA, teeth], weekKeys);
assert.equal(plan.length, 7);
const wed = plan.find((d) => d.dateKey === '2026-09-02');
assert.ok(wed.chores.some((c) => c.title === 'Ta søppel'));

const summary = kidProgressSummary([trashA, teeth], weekKeys, todayKey);
assert.equal(summary.pendingToday, 0);
assert.ok(summary.pendingWeek >= 1);
assert.equal(attestKeysThroughToday(weekKeys, todayKey).includes('2026-09-06'), false);

const rows = kidProgressRows(kids, kidMap, weekKeys, todayKey);
assert.equal(rows.length, 2);
assert.equal(rows[0].name, 'Adelen');
assert.equal(rows[0].kidId, 'kidA');
assert.ok(rows[0].todayTotal >= 1);

console.log('familyProgress.test.mjs: ok');
