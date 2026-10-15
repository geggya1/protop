import assert from 'node:assert/strict';
import { emptyHrState, hrStateHasData, normalizeHrState } from './model.js';

{
  assert.equal(hrStateHasData(emptyHrState()), false);
  assert.equal(hrStateHasData(normalizeHrState({})), false);
  assert.equal(hrStateHasData(normalizeHrState({
    contracts: [{ employeeId: 'e1', title: 'Avtale' }],
  })), true);
  assert.equal(hrStateHasData(normalizeHrState({
    memos: [{ employeeId: 'e1', title: 'Notat' }],
  })), true);
}

console.log('hr/storage.test.mjs ok');
