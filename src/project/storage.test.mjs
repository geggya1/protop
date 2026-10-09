import assert from 'node:assert/strict';
import {
  applyRemoteProjectRead,
  clearProjectStateMemory,
  loadProjectState,
  peekProjectState,
  projectLoadMeta,
  putProjectState,
} from './storage.js';
import { createProject, deleteProjects, emptyProjectState, mergeProjectStates } from './engine.js';

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

const local = emptyProjectState();
local.projects = [{ id: 'p9', number: '9', name: 'Lokal', status: 'aktiv' }];
const remote = emptyProjectState();
remote.projects = [{ id: 'p8', number: '8', name: 'Sky', status: 'aktiv' }];

const merged = applyRemoteProjectRead(local, { ok: true, state: remote });
assert.equal(merged.cache, true);
assert.equal(merged.meta, 'ok');
assert.deepEqual(merged.state.projects.map((row) => row.id).sort(), ['p8', 'p9']);

const failed = applyRemoteProjectRead(local, { ok: false, state: emptyProjectState() });
assert.equal(failed.cache, false);
assert.equal(failed.meta, 'error');
assert.equal(failed.state.projects.length, 1);
assert.equal(failed.upload, false);

const emptyRemote = applyRemoteProjectRead(local, { ok: true, state: emptyProjectState() });
assert.equal(emptyRemote.cache, true);
assert.equal(emptyRemote.upload, true);
assert.equal(emptyRemote.state.projects[0].id, 'p9');

putProjectState(seeded, 'co1');
assert.equal(await loadProjectState('co1'), peekProjectState('co1'));
assert.equal(projectLoadMeta('co1'), 'ok');

{
  let state = createProject(emptyProjectState(), { name: 'Slettes', number: '55' }).state;
  state = createProject(state, { name: 'Beholdes', number: '56' }).state;
  const localBefore = { ...state, syncedAt: '2026-01-01T10:00:00.000Z' };
  const deleted = deleteProjects(state, [state.projects.find((row) => row.number === '55').id]);
  const stamped = { ...deleted.state, syncedAt: '2026-01-01T11:00:00.000Z' };
  // Samme sti som saveProjectState: merge lokal disk med ny state.
  const saved = mergeProjectStates(localBefore, stamped);
  assert.equal(saved.projects.length, 1);
  assert.equal(saved.projects[0].number, '56');
  const remoteStillHasOld = applyRemoteProjectRead(saved, { ok: true, state: localBefore });
  assert.equal(remoteStillHasOld.state.projects.length, 1);
  assert.equal(remoteStillHasOld.state.projects[0].number, '56');
}

console.log('storage.test.mjs: ok');
