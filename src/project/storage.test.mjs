import assert from 'node:assert/strict';
import { planAbsenceRemovals } from '../arbeid/absenceStorage.js';
import {
  applyAbsencesOntoState,
  applyHoursOntoState,
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

{
  const onScreen = {
    absences: [{ id: 'fra-1', employeeId: 'e1', date: '2026-10-14', hours: 8, type: 'ferie' }],
    absenceAdjustments: [{ id: 'adj-1', employeeId: 'e1', days: 25 }],
    timeEntries: [],
  };
  const hoursLoad = {
    absences: [],
    absenceAdjustments: [],
    timeEntries: [{ id: 'tid-1', date: '2026-10-14', hours: 7.5 }],
    projects: [{ id: 'p1' }],
  };
  const kept = applyHoursOntoState(onScreen, hoursLoad);
  assert.equal(kept.absences.length, 1, 'time-lasting skal ikke tømme fravær');
  assert.equal(kept.absenceAdjustments.length, 1, 'time-lasting skal ikke tømme startsaldo');
  assert.equal(kept.timeEntries[0].id, 'tid-1');
  assert.equal(kept.projects[0].id, 'p1');

  const absenceLoad = applyAbsencesOntoState(
    { timeEntries: [{ id: 'tid-1' }], absences: [] },
    { timeEntries: [], absences: [{ id: 'fra-1' }, { id: 'fra-2' }] },
  );
  assert.equal(absenceLoad.timeEntries[0].id, 'tid-1');
  assert.equal(absenceLoad.absences.length, 2);

  const emptyAbsenceLoad = applyAbsencesOntoState(onScreen, { absences: [], timeEntries: [] });
  assert.equal(emptyAbsenceLoad.absences.length, 1, 'tom fraværslasting skal beholde radene på skjermen');

  const imported = [
    { id: 'fra-1', employeeId: 'e1', date: '2026-07-01', hours: 8, type: 'ferie' },
    { id: 'fra-2', employeeId: 'e1', date: '2026-07-02', hours: 8, type: 'ferie' },
  ];
  assert.deepEqual(planAbsenceRemovals(imported, []), [], 'tom liste skal ikke slette importen');
  assert.deepEqual(
    planAbsenceRemovals(imported, [imported[0]]),
    ['fra-2'],
    'én fjernet rad skal fortsatt kunne slettes',
  );
  assert.deepEqual(planAbsenceRemovals(imported, [], { allowRemovals: false }), []);
}

console.log('storage.test.mjs: ok');
