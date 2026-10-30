import assert from 'node:assert/strict';
import { planAbsenceRemovals } from '../arbeid/absenceStorage.js';
import {
  absencesRangeCovered,
  adoptLoadedHours,
  applyAbsencesOntoState,
  applyEquipmentDoc,
  applyHoursOntoState,
  applyRemoteProjectRead,
  clearProjectStateMemory,
  ensureProjectAbsences,
  ensureProjectHours,
  hoursRangeCovered,
  loadProjectState,
  mergeEquipmentDoc,
  noteLoadedHoursRange,
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

// Skyen er fasit. Den lokale kopien slås ikke inn (den kan ha rader andre har slettet).
const merged = applyRemoteProjectRead(local, { ok: true, exists: true, state: remote });
assert.equal(merged.cache, true);
assert.equal(merged.meta, 'ok');
assert.equal(merged.upload, false);
assert.deepEqual(merged.state.projects.map((row) => row.id), ['p8']);

const failed = applyRemoteProjectRead(local, { ok: false, state: emptyProjectState() });
assert.equal(failed.cache, false);
assert.equal(failed.meta, 'error');
assert.equal(failed.state.projects.length, 1);
assert.equal(failed.upload, false);

// Uten prosjektdokument i skyen lastes den lokale kopien opp.
const emptyRemote = applyRemoteProjectRead(local, { ok: true, exists: false, state: emptyProjectState() });
assert.equal(emptyRemote.cache, true);
assert.equal(emptyRemote.upload, true);
assert.equal(emptyRemote.state.projects[0].id, 'p9');
// Et tømt dokument i skyen er fasit. Den lokale kopien skal ikke fylle det igjen.
const emptiedRemote = applyRemoteProjectRead(local, { ok: true, exists: true, state: emptyProjectState() });
assert.equal(emptiedRemote.upload, false);
assert.equal(emptiedRemote.state.projects.length, 0);

putProjectState(seeded, 'co1');
assert.equal(await loadProjectState('co1'), peekProjectState('co1'));
assert.equal(projectLoadMeta('co1'), 'ok');

{
  let state = createProject(emptyProjectState(), { name: 'Slettes', number: '55' }).state;
  state = createProject(state, { name: 'Beholdes', number: '56' }).state;
  const localBefore = { ...state, syncedAt: '2026-01-01T10:00:00.000Z' };
  const deleted = deleteProjects(state, [state.projects.find((row) => row.number === '55').id]);
  const stamped = { ...deleted.state, syncedAt: '2026-01-01T11:00:00.000Z' };
  // Slettemarkeringen holder prosjektet ute når en eldre kopi slås sammen.
  const saved = mergeProjectStates(localBefore, stamped);
  assert.equal(saved.projects.length, 1);
  assert.equal(saved.projects[0].number, '56');
  // Den gamle lokale kopien henter ikke prosjektet tilbake fra skyens kopi.
  const fromCloud = applyRemoteProjectRead(localBefore, { ok: true, exists: true, state: saved });
  assert.equal(fromCloud.state.projects.length, 1);
  assert.equal(fromCloud.state.projects[0].number, '56');
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

{
  clearProjectStateMemory('co-hours');
  const base = emptyProjectState();
  base.projects = [{ id: 'p1', number: '100', name: 'Test', status: 'aktiv' }];
  base.timeEntries = [{
    id: 't1',
    projectId: 'p1',
    employeeId: 'e1',
    date: '2026-10-02',
    hours: 4,
    updatedAt: '2026-10-02T12:00:00.000Z',
  }];
  putProjectState(base, 'co-hours');
  noteLoadedHoursRange('co-hours', {
    fromDate: '2026-08-01',
    toDate: '2026-10-31',
    employeeId: 'e1',
  });
  assert.equal(
    hoursRangeCovered('co-hours', { fromDate: '2026-10-01', toDate: '2026-10-31', employeeId: 'e1' }),
    true,
  );
  assert.equal(
    hoursRangeCovered('co-hours', { fromDate: '2026-10-01', toDate: '2026-10-31', employeeId: 'e2' }),
    false,
  );
  assert.equal(
    hoursRangeCovered('co-hours', { fromDate: '2026-01-01', toDate: '2026-01-31', employeeId: 'e1' }),
    false,
  );
  assert.equal(
    hoursRangeCovered('co-hours', { fromDate: '2026-10-01', toDate: '2026-10-31' }),
    false,
    'ansattvindu dekker ikke hele selskapet',
  );
  const again = await ensureProjectHours('co-hours', {
    fromDate: '2026-10-01',
    toDate: '2026-10-31',
    employeeId: 'e1',
  });
  assert.equal(again, peekProjectState('co-hours'), 'dekket vindu skal bruke minnet');
  assert.equal(again.timeEntries[0].id, 't1');

  clearProjectStateMemory('co-project-hours');
  noteLoadedHoursRange('co-project-hours', { fromDate: '2026-10-01', toDate: '2026-10-07' });
  assert.equal(
    hoursRangeCovered('co-project-hours', { projectId: 'p-myklebust', projectNumbers: ['10001', '1882'] }),
    false,
    'uke-vindu dekker ikke prosjektets timer',
  );
  noteLoadedHoursRange('co-project-hours', {
    projectId: 'p-myklebust',
    projectNumbers: ['1882', '10001'],
  });
  assert.equal(
    hoursRangeCovered('co-project-hours', { projectId: 'p-myklebust', projectNumbers: ['10001', '1882'] }),
    true,
  );
  assert.equal(
    hoursRangeCovered('co-project-hours', { fromDate: '2026-10-01', toDate: '2026-10-07' }),
    true,
    'prosjektlasting skal ikke skjule et uke-vindu',
  );
  clearProjectStateMemory('co-project-hours');

  const edited = adoptLoadedHours(
    {
      ...again,
      timeEntries: [{ ...again.timeEntries[0], hours: 8, updatedAt: '2026-10-03T08:00:00.000Z' }],
      absences: [{ id: 'a1', employeeId: 'e1', date: '2026-10-02', hours: 8, type: 'ferie' }],
    },
    {
      ...again,
      timeEntries: [
        again.timeEntries[0],
        {
          id: 't2',
          projectId: 'p1',
          employeeId: 'e1',
          date: '2026-10-03',
          hours: 2,
          updatedAt: '2026-10-03T09:00:00.000Z',
        },
      ],
      absences: [],
    },
    'co-hours',
  );
  assert.equal(edited.absences.length, 1, 'time-lasting skal ikke tømme fravær');
  assert.equal(edited.timeEntries.find((row) => row.id === 't1').hours, 8);
  assert.ok(edited.timeEntries.some((row) => row.id === 't2'));
  clearProjectStateMemory('co-hours');
}

// Utstyr i eget dokument: fasit når det finnes, og nyeste rad vinner ved vanlig lagring.
{
  const main = { equipment: [{ id: 'car', bookingAccess: 'active', updatedAt: '2026-10-17T10:00:00Z' }], equipmentBookings: [{ id: 'b1' }] };
  const side = { equipment: [{ id: 'car', bookingAccess: 'selected', bookingEmployeeIds: ['geir'], updatedAt: '2026-10-23T11:00:00Z' }] };
  const applied = applyEquipmentDoc(main, side);
  assert.equal(applied.equipment[0].bookingAccess, 'selected');
  assert.deepEqual(applied.equipmentBookings, [{ id: 'b1' }], 'liste som mangler i dokumentet, beholdes');
  assert.equal(applyEquipmentDoc(main, null), main);
  // En eldre kopi fra en annen skjerm overskriver ikke nyere tilgang.
  const stale = { equipment: [{ id: 'car', bookingAccess: 'active', updatedAt: '2026-10-17T10:00:00Z' }, { id: 'drill', updatedAt: '2026-10-20T10:00:00Z' }] };
  const mergedDoc = mergeEquipmentDoc(side, stale);
  assert.equal(mergedDoc.equipment.find((row) => row.id === 'car').bookingAccess, 'selected');
  assert.deepEqual(mergedDoc.equipment.map((row) => row.id).sort(), ['car', 'drill']);
  assert.deepEqual(mergedDoc.personalVehicles, []);
}

{
  // Fravær i minnet kan tegnes før nettet svarer, men bare når vinduet er lest før.
  const range = { fromDate: '2026-04-01', toDate: '2027-12-31' };
  clearProjectStateMemory('co-abs');
  assert.equal(absencesRangeCovered('co-abs', range), false, 'ingenting i minnet');
  putProjectState(emptyProjectState(), 'co-abs');
  assert.equal(absencesRangeCovered('co-abs', range), false, 'fraværet er ikke lest');
  await ensureProjectAbsences('co-abs', range);
  assert.equal(absencesRangeCovered('co-abs', range), true);
  assert.equal(absencesRangeCovered('co-abs', { fromDate: '2026-05-01', toDate: '2027-01-31' }), true, 'smalere vindu er dekket');
  assert.equal(absencesRangeCovered('co-abs', { fromDate: '2026-01-01', toDate: '2027-01-31' }), false, 'eldre fravær er ikke lest');
  clearProjectStateMemory('co-abs');
}

console.log('storage.test.mjs: ok');
