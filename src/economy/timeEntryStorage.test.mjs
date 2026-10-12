import assert from 'node:assert/strict';
import {
  attachTimeEntriesToState,
  diffTimeEntries,
} from './timeEntryStorage.js';
import {
  markTimeEntriesSynced,
  peekSyncedTimeEntries,
  putProjectState,
  stripTimeEntriesFromState,
  clearProjectStateMemory,
} from '../project/storage.js';
import { deleteTimeEntry, emptyProjectState } from '../project/engine.js';

{
  const prev = [{
    id: 't1', projectId: 'p1', employeeId: 'e1', date: '2026-10-01', hours: 4, updatedAt: 'a',
  }];
  const next = [
    {
      id: 't1', projectId: 'p1', employeeId: 'e1', date: '2026-10-01', hours: 8, updatedAt: 'b',
    },
    {
      id: 't2', projectId: 'p1', employeeId: 'e1', date: '2026-10-02', hours: 2, updatedAt: 'b',
    },
  ];
  const { changed, removed } = diffTimeEntries(prev, next);
  assert.equal(changed.length, 2);
  assert.deepEqual(removed, []);
  const deleted = diffTimeEntries(next, prev);
  assert.deepEqual(deleted.removed, ['t2']);
}

{
  // Timeliste-mønster: putProjectState før save — MEMORY mister slettingen i diff
  // mot seg selv, men SYNCED-baseline skal fortsatt se removed.
  clearProjectStateMemory('co-del');
  const entry = {
    id: 'tid_del',
    projectId: 'p1',
    employeeId: 'e1',
    date: '2026-10-10',
    hours: 8,
    billableHours: 8,
    employeeName: 'Geir Ove Andersen',
    updatedAt: '2026-10-10T10:00:00.000Z',
  };
  const before = emptyProjectState();
  before.timeEntries = [entry];
  markTimeEntriesSynced('co-del', before.timeEntries);
  putProjectState(before, 'co-del');

  const afterDelete = deleteTimeEntry(before, entry.id);
  assert.equal(afterDelete.ok, true);
  // Samme rekkefølge som ArbeidScreen useEffect:
  putProjectState(afterDelete.state, 'co-del');
  const memoryNow = afterDelete.state.timeEntries;
  const againstMemory = diffTimeEntries(memoryNow, memoryNow);
  assert.deepEqual(againstMemory.removed, [], 'diff mot MEMORY etter put blir tom');
  const againstSynced = diffTimeEntries(peekSyncedTimeEntries('co-del'), memoryNow);
  assert.deepEqual(againstSynced.removed, ['tid_del']);
  clearProjectStateMemory('co-del');
}

{
  const state = emptyProjectState();
  state.timeEntries = [{
    id: 'legacy1',
    projectId: 'p1',
    employeeId: 'e1',
    date: '2026-10-06',
    hours: 8,
    employeeName: 'Geir',
  }];
  // Uten companyId: behold legacy i minnet.
  const attached = await attachTimeEntriesToState('', state);
  assert.equal(attached.timeEntries.length, 1);
  assert.equal(attached.timeEntries[0].id, 'legacy1');
}

{
  const state = emptyProjectState();
  state.projects = [{ id: 'p1', number: '1', name: 'Demo', status: 'aktiv' }];
  state.timeEntries = [{
    id: 'legacy1',
    projectId: 'p1',
    employeeId: 'e1',
    date: '2026-10-06',
    hours: 8,
  }];
  const slim = stripTimeEntriesFromState(state);
  assert.equal(slim.timeEntries.length, 0);
  assert.equal(slim.projects.length, 1);
}

console.log('timeEntryStorage.test.mjs: ok');
