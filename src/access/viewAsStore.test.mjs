import assert from 'node:assert/strict';
import {
  clearViewAs,
  getViewAsSelection,
  setViewAsEmployee,
  setViewAsLens,
  viewAsKey,
} from './viewAsStore.js';

clearViewAs();
setViewAsEmployee('u1', 'fam', 'emp-1');
assert.equal(getViewAsSelection().key, viewAsKey('u1', 'fam'));
assert.equal(getViewAsSelection().employeeId, 'emp-1');
assert.equal(getViewAsSelection().lens, 'all');

setViewAsLens('u1', 'fam', 'companySettings');
assert.equal(getViewAsSelection().employeeId, 'emp-1');
assert.equal(getViewAsSelection().lens, 'companySettings');

setViewAsEmployee('u1', 'fam', '');
assert.equal(getViewAsSelection().employeeId, '');
assert.equal(getViewAsSelection().lens, 'companySettings');

setViewAsEmployee('u2', 'other', 'emp-2');
assert.equal(getViewAsSelection().key, viewAsKey('u2', 'other'));
assert.equal(getViewAsSelection().employeeId, 'emp-2');
assert.equal(getViewAsSelection().lens, 'all');

clearViewAs();
assert.deepEqual(getViewAsSelection(), { key: '', employeeId: '', lens: 'all' });

console.log('viewAsStore.test.mjs: ok');
