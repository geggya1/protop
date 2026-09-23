import assert from 'node:assert/strict';
import {
  childChoresLayoutIsStale,
  upgradeChildChoresLayout,
  childHomeStorageAliases,
  childHomeStorageId,
} from './childHomeLayout.js';

const oldBoard = [
  { id: 'w-today', type: 'timeline', col: 0, row: 0, gw: 5, gh: 3 },
  { id: 'w-tasks', type: 'tasks', col: 0, row: 3, gw: 2, gh: 3 },
  { id: 'w-homework', type: 'homework', col: 2, row: 3, gw: 3, gh: 3 },
  { id: 'w-school', type: 'school', col: 0, row: 6, gw: 5, gh: 2 },
  { id: 'w-shortcuts', type: 'shortcuts', col: 0, row: 8, gw: 5, gh: 2, variant: 'row' },
];

assert.equal(childChoresLayoutIsStale(oldBoard), true);
assert.equal(childChoresLayoutIsStale([
  { id: 'w-tasks', type: 'tasks', col: 0, row: 3, gw: 5, gh: 2 },
]), false);
assert.equal(childChoresLayoutIsStale([
  { id: 'w-tasks', type: 'tasks', col: 0, row: 3, gw: 5, gh: 4 },
]), false);

const upgraded = upgradeChildChoresLayout(oldBoard);
const tasks = upgraded.find((w) => w.type === 'tasks');
assert.equal(tasks.gw, 5);
assert.equal(tasks.gh, 2);
assert.equal(childChoresLayoutIsStale(upgraded), false);

// Custom board with narrow chores (no side-by-side homework) still expands.
const custom = upgradeChildChoresLayout([
  { id: 'w-today', type: 'timeline', col: 0, row: 0, gw: 5, gh: 2 },
  { id: 'w-tasks', type: 'tasks', col: 0, row: 2, gw: 2, gh: 3 },
  { id: 'w-a', type: 'rewards', col: 0, row: 5, gw: 5, gh: 2 },
  { id: 'w-b', type: 'goals', col: 0, row: 7, gw: 5, gh: 2 },
  { id: 'w-c', type: 'meals', col: 0, row: 9, gw: 5, gh: 2 },
  { id: 'w-d', type: 'notes', col: 0, row: 11, gw: 5, gh: 2 },
]);
assert.equal(custom.find((w) => w.type === 'tasks').gw, 5);
assert.equal(custom.find((w) => w.type === 'tasks').gh, 2);

// Alias helpers prefer doc id.
assert.equal(childHomeStorageId({ id: 'doc1', uid: 'auth1' }), 'doc1');
assert.deepEqual(
  childHomeStorageAliases({ id: 'doc1', uid: 'auth1', childId: 'doc1' }),
  ['doc1', 'auth1'],
);

console.log('childHomeLayout.test.mjs: ok');
