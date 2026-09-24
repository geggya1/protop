import assert from 'node:assert/strict';
import {
  isCopyableChore,
  choreTitleKey,
  selectChoresToCopy,
  buildCopiedTodoPayload,
} from './todoCopy.js';

assert.equal(isCopyableChore({ title: 'Tømme søppel' }), true);
assert.equal(isCopyableChore({ title: 'Tømme søppel', deleted: true }), false);
assert.equal(isCopyableChore({ title: 'Tømme søppel', active: false }), false);
assert.equal(isCopyableChore({ title: '   ' }), false);
assert.equal(choreTitleKey({ title: ' Tømme Søppel ' }), 'tømme søppel');

const source = [
  {
    id: 'a',
    title: 'Tømme søppel',
    type: 'daily',
    rewardType: 'money',
    moneyValue: 4,
    completedDates: ['2026-08-20'],
    skipDates: ['2026-08-21'],
    childId: 'child-1',
    createdBy: 'parent-x',
    seriesKey: 'ser_old',
    done: true,
    source: 'ios',
  },
  { id: 'b', title: 'Lese bok', type: 'weekly', daysOfWeek: [1, 3], points: 2 },
  { id: 'c', title: 'Slettet', deleted: true },
];

const { selected, skipped } = selectChoresToCopy(source, [
  { title: 'Lese bok', active: true },
]);
assert.equal(selected.length, 1);
assert.equal(selected[0].title, 'Tømme søppel');
assert.equal(skipped.length, 1);
assert.equal(skipped[0].title, 'Lese bok');

const copy = buildCopiedTodoPayload(source[0], {
  targetChildId: 'child-2',
  createdBy: 'parent-y',
  seriesKey: 'ser_new',
  timestamps: 'ts',
});
assert.equal(copy.title, 'Tømme søppel');
assert.equal(copy.childId, 'child-2');
assert.equal(copy.createdBy, 'parent-y');
assert.equal(copy.seriesKey, 'ser_new');
assert.equal(copy.moneyValue, 4);
assert.equal(copy.type, 'daily');
assert.deepEqual(copy.completedDates, []);
assert.deepEqual(copy.skipDates, []);
assert.equal(copy.done, false);
assert.equal(copy.deleted, false);
assert.equal(copy.active, true);
assert.equal(copy.createdAt, 'ts');
assert.equal(copy.source, undefined);
assert.equal(copy.id, undefined);

const noDup = selectChoresToCopy(source, [], { skipDuplicates: false });
assert.equal(noDup.selected.length, 2);

console.log('todoCopy.test.mjs: ok');
