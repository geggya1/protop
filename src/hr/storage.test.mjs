import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

{
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'storage.js'), 'utf8');
  assert.match(src, /export async function loadEmployeeHrSlice/);
  assert.match(src, /Do not putMemory|ikke.*MEMORY|Hydrer ikke MEMORY/i);
}

console.log('hr/storage.test.mjs ok');
