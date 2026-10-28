/**
 * Timelisten mot gammel kopi og manglende lasting (DRIFT-05, DRIFT-06, DRIFT-09, DRIFT-15).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  approveTimesheetLock,
  approvedThroughDate,
  timesheetReopenBlock,
  toggleTimesheetLock,
} from './timesheetState.js';
import {
  PROJECTS_NOT_LOADED,
  invoicedEntryBlock,
  lockScopeEntryIds,
  mergeFreshTimesheet,
  timesheetSaveErrorText,
} from './timesheetGuard.js';
import { createProject, deleteTimeEntry, emptyProjectState, upsertTimeEntry } from '../project/engine.js';

function withHours() {
  const created = createProject(emptyProjectState(), { name: 'Hundre', number: '100' });
  const project = created.state.projects[0];
  let state = created.state;
  for (const [id, date] of [['t1', '2026-10-01'], ['t2', '2026-10-02'], ['t3', '2026-10-05']]) {
    state = upsertTimeEntry(state, { projectId: project.id, employeeId: 'e1', date, hours: 7.5, description: 'Riving' }).state;
    state = { ...state, timeEntries: state.timeEntries.map((row, i) => (i === 0 ? { ...row, id } : row)) };
  }
  return { state, project };
}

test('ansatt kan ikke låse opp en godkjent timeliste, leder kan', () => {
  const { state } = withHours();
  const locked = toggleTimesheetLock(state, { employeeId: 'e1', throughDate: '2026-10-02', canReopen: false });
  assert.equal(locked.ok, true, locked.error);
  // Ikke godkjent ennå: den ansatte kan låse opp selv.
  assert.equal(toggleTimesheetLock(locked.state, { employeeId: 'e1', throughDate: '2026-10-02', canReopen: false }).ok, true);
  const approved = approveTimesheetLock(locked.state, { employeeId: 'e1', approvedByUid: 'leder' });
  assert.equal(approvedThroughDate(approved.state.timesheetLocks[0]), '2026-10-02');
  const refused = toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-02', canReopen: false });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /godkjent og kan ikke låses opp/);
  // Å flytte låsen bakover inn i det godkjente er også å låse opp.
  assert.equal(toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-01', canReopen: false }).ok, false);
  // Låse videre er greit.
  assert.equal(toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-05', canReopen: false }).ok, true);
  // Den som styrer andres timer kan åpne listen igjen.
  const reopened = toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-02', canReopen: true });
  assert.equal(reopened.ok, true);
  assert.equal(reopened.state.timesheetLocks.length, 0);
});

test('låst videre etter en godkjenning: den ansatte låser opp bare det nye', () => {
  const { state } = withHours();
  const locked = toggleTimesheetLock(state, { employeeId: 'e1', throughDate: '2026-10-02' });
  const approved = approveTimesheetLock(locked.state, { employeeId: 'e1', approvedByUid: 'leder' });
  const extended = toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-05', canReopen: false });
  assert.equal(extended.ok, true);
  const back = toggleTimesheetLock(extended.state, { employeeId: 'e1', throughDate: '2026-10-05', canReopen: false });
  assert.equal(back.ok, true, back.error);
  assert.equal(back.state.timesheetLocks[0].throughDate, '2026-10-02', 'det godkjente står låst');
  assert.match(back.notice, /låst opp etter 2026-10-02/);
  const t3 = back.state.timeEntries.find((row) => row.id === 't3');
  assert.equal(t3.status, 'registrert', 'den nye dagen er åpen igjen');
  const t1 = back.state.timeEntries.find((row) => row.id === 't1');
  assert.equal(t1.status, 'godkjent');
});

test('fakturerte timer: ansatt kan ikke låse opp, og føringen kan verken endres eller slettes', () => {
  const { state, project } = withHours();
  const locked = toggleTimesheetLock(state, { employeeId: 'e1', throughDate: '2026-10-05' });
  // Fakturert fra Til fakturering uten at låsen er godkjent (kan skje med eldre data).
  const invoiced = {
    ...locked.state,
    timeEntries: locked.state.timeEntries.map((row) => (row.id === 't1' ? { ...row, invoiceId: 'F-17', status: 'godkjent' } : row)),
  };
  const block = timesheetReopenBlock(invoiced, { employeeId: 'e1', target: '', canReopen: false });
  assert.match(block, /fakturert/);
  assert.equal(timesheetReopenBlock(invoiced, { employeeId: 'e1', target: '', canReopen: true }), '');
  const refused = toggleTimesheetLock(invoiced, { employeeId: 'e1', throughDate: '2026-10-05', canReopen: false });
  assert.equal(refused.ok, false);
  // Leder låser opp: den fakturerte føringen står urørt.
  const opened = toggleTimesheetLock(invoiced, { employeeId: 'e1', throughDate: '2026-10-05', canReopen: true });
  assert.equal(opened.state.timeEntries.find((row) => row.id === 't1').invoiceId, 'F-17');
  const edit = upsertTimeEntry(opened.state, { id: 't1', projectId: project.id, employeeId: 'e1', date: '2026-10-01', hours: 8 });
  assert.equal(edit.ok, false);
  assert.match(edit.error, /fakturert/);
  const removed = deleteTimeEntry(opened.state, 't1');
  assert.equal(removed.ok, false);
  assert.match(removed.error, /fakturert/);
});

test('fersk status fra skyen legges på skjermens kopi', () => {
  const { state } = withHours();
  const freshLock = { id: 'las1', employeeId: 'e1', throughDate: '2026-10-02', approvedAt: '2026-10-03T08:00:00Z' };
  const merged = mergeFreshTimesheet(state, {
    locks: [freshLock],
    archive: [],
    entries: [{ id: 't1', invoiceId: 'F-1', status: 'godkjent' }, { id: 't9', employeeId: 'e1', date: '2026-10-06', hours: 2 }],
  });
  assert.deepEqual(merged.timesheetLocks, [freshLock]);
  const t1 = merged.timeEntries.find((row) => row.id === 't1');
  assert.equal(t1.invoiceId, 'F-1');
  assert.equal(t1.hours, 7.5, 'resten av raden står');
  assert.ok(merged.timeEntries.some((row) => row.id === 't9'), 'føring fra en annen enhet kommer med');
  // Uten låser fra skyen røres ikke låsene.
  assert.equal(mergeFreshTimesheet(state, { entries: [] }).timesheetLocks, state.timesheetLocks);
  assert.deepEqual(lockScopeEntryIds(state, 'e1', '2026-10-02').sort(), ['t1', 't2']);
  assert.match(invoicedEntryBlock([{ id: 'a' }, { id: 'b', invoiceId: 'F-2' }]), /fakturert/);
  assert.equal(invoicedEntryBlock([{ id: 'a' }]), '');
});

test('avvist lagring gir forståelig melding', () => {
  assert.match(timesheetSaveErrorText({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }), /godkjent eller fakturert/);
  assert.equal(timesheetSaveErrorText(new Error('nett')), 'Kunne ikke lagre timeføring.');
  assert.match(PROJECTS_NOT_LOADED, /kunne ikke lastes/);
});

test('timelisten bruker fersk status, varsler om manglende lasting og viser et prosjekt man alt er med på', () => {
  const src = readFileSync(new URL('../../screens/arbeid/ArbeidScreen.jsx', import.meta.url), 'utf8');
  const toggle = src.slice(src.indexOf('async function toggleLock'), src.indexOf('/** Personlig valg'));
  assert.match(toggle, /readProjectStateFromCloud\(workspaceId\)/);
  assert.match(toggle, /canReopen: !!manager/);
  assert.match(toggle, /if \(loadFailed\)/);
  assert.match(src, /nativeID="timesheet-load-failed"/);
  assert.match(src, /projectLoadMeta\(workspaceId\) === 'error'/);
  const join = src.slice(src.indexOf('function joinProject'), src.indexOf('function starProject'));
  assert.ok(join.indexOf('if (already)') < join.indexOf('addProjectMember('), 'deltaker: bare vis prosjektet');
  // DRIFT-05: stjerne skrives på den ansatte, ikke i prosjektdokumentet.
  const star = src.slice(src.indexOf('function starProject'), src.indexOf('function openAbsenceCell'));
  assert.match(star, /savePrefs\(/);
  assert.equal(/setState\(/.test(star), false);
});
