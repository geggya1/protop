import assert from 'node:assert/strict';
import {
  clearProjectStateMemory,
  loadProjectState,
  peekProjectState,
  putProjectState,
} from './storage.js';
import { emptyProjectState } from './engine.js';

clearProjectStateMemory();
assert.equal(peekProjectState(), null);
assert.equal(peekProjectState('co1'), null);

const seeded = emptyProjectState();
seeded.projects = [{ id: 'p1', number: '100', name: 'Test', status: 'aktiv' }];
const stored = putProjectState(seeded, 'co1');

assert.equal(peekProjectState('co1')?.projects?.[0]?.id, 'p1');
assert.equal(stored.projects[0].name, 'Test');

const first = await loadProjectState('co1');
assert.equal(first.projects[0].id, 'p1');

const second = await loadProjectState('co1');
assert.equal(second, first, 'skal returnere samme minneobjekt uten ny lesing');

putProjectState({
  ...first,
  projects: [...first.projects, { id: 'p2', number: '101', name: 'To', status: 'aktiv' }],
}, 'co1');
assert.equal(peekProjectState('co1')?.projects?.length, 2);

clearProjectStateMemory('co1');
assert.equal(peekProjectState('co1'), null);

console.log('storage.test.mjs: ok');
