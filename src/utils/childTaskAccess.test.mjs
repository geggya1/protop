import assert from 'node:assert/strict';
import {
  canChildCreateParentTasks,
  isChildParentTaskReadOnly,
} from './childTaskAccess.js';

assert.equal(canChildCreateParentTasks(true), true);
assert.equal(canChildCreateParentTasks(false), false);

assert.equal(isChildParentTaskReadOnly({ isChild: true, isNew: true }), false);
assert.equal(isChildParentTaskReadOnly({ isChild: true, isNew: false }), true);
assert.equal(isChildParentTaskReadOnly({ isChild: false, isNew: false }), false);
assert.equal(isChildParentTaskReadOnly({ isChild: false, isNew: true }), false);

console.log('childTaskAccess.test.mjs: ok');
