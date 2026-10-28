/**
 * Timelisten mot gammel kopi og manglende lasting (DRIFT-05, DRIFT-06, DRIFT-09, DRIFT-15),
 * og hvem som fører andres timer (DRIFT-07).
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
  approvedEntryBlock,
  changedLockEmployees,
  invoicedEntryBlock,
  lockSignature,
  lockScopeEntryIds,
  mergeFreshTimesheet,
  timesheetSaveErrorText,
} from './timesheetGuard.js';
import { createProject, deleteTimeEntry, emptyProjectState, upsertTimeEntry } from '../project/engine.js';
import { allows, standardGrants } from '../access/companyAccess.js';

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
  // Godkjenningen på timene tas bort, så den ansatte kan rette dem (reglene stenger godkjente timer).
  assert.deepEqual(reopened.state.timeEntries.map((row) => [row.id, row.status]).sort(), [
    ['t1', 'registrert'], ['t2', 'registrert'], ['t3', 'registrert'],
  ]);
});

test('leder flytter låsen bakover: godkjenningen etter den nye datoen tas bort, og neste godkjenning tar dem med (DRIFT-06)', () => {
  const { state } = withHours();
  const locked = toggleTimesheetLock(state, { employeeId: 'e1', throughDate: '2026-10-02' });
  const approved = approveTimesheetLock(locked.state, { employeeId: 'e1', approvedByUid: 'leder' });
  // Fakturert føring i perioden står som den er.
  const withInvoice = {
    ...approved.state,
    timeEntries: approved.state.timeEntries.map((row) => (row.id === 't2' ? { ...row, invoiceId: 'F-9' } : row)),
  };
  const back = toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-01', canReopen: true });
  assert.equal(back.ok, true, back.error);
  const status = (result, id) => result.state.timeEntries.find((row) => row.id === id).status;
  assert.equal(status(back, 't1'), 'godkjent', 'før den nye datoen står godkjent');
  assert.equal(status(back, 't2'), 'registrert', 'etter den nye datoen er timene åpne igjen');
  assert.equal(approvedThroughDate(back.state.timesheetLocks[0]), '2026-10-01');
  assert.equal(status(toggleTimesheetLock(withInvoice, { employeeId: 'e1', throughDate: '2026-10-01', canReopen: true }), 't2'), 'godkjent');
  // Den ansatte låser på nytt, og lederen godkjenner: den gjenåpnede dagen kommer med.
  const relocked = toggleTimesheetLock(back.state, { employeeId: 'e1', throughDate: '2026-10-05', canReopen: false });
  const again = approveTimesheetLock(relocked.state, { employeeId: 'e1', approvedByUid: 'leder' });
  assert.deepEqual(['t1', 't2', 't3'].map((id) => status(again, id)), ['godkjent', 'godkjent', 'godkjent']);
  // Den ansatte (uten Andres timer) kan aldri ta bort godkjenningen.
  const own = toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-01', canReopen: false });
  assert.equal(own.ok, false);
});

test('godkjente timer: den ansatte får beskjed før lagringen, teksten kan rettes (DRIFT-06, DRIFT-07)', () => {
  const rows = [
    { id: 'a', status: 'godkjent', hours: 7.5, timeType: 'ordinary' },
    { id: 'b', status: 'registrert', hours: 2 },
    { id: 'c', status: 'godkjent', hours: 3, invoiceId: 'F-1' },
  ];
  const keep = [{ id: 'a', hours: 7.5, timeType: 'ordinary' }, { id: 'b', hours: 4 }, { id: 'c', hours: 3 }];
  assert.equal(approvedEntryBlock(rows, { blocks: keep }), '', 'bare teksten eller andre timer endres');
  assert.match(approvedEntryBlock(rows, { blocks: [{ id: 'a', hours: 8 }, { id: 'b', hours: 2 }] }), /godkjent/);
  assert.match(approvedEntryBlock(rows, { blocks: [{ id: 'a', hours: 7.5, timeType: 'overtime50' }] }), /godkjent/);
  assert.match(approvedEntryBlock(rows, { blocks: [{ id: 'b', hours: 2 }] }), /godkjent/, 'den godkjente fjernes');
  assert.match(approvedEntryBlock(rows), /godkjent/, 'sletting');
  assert.equal(approvedEntryBlock([rows[1], rows[2]]), '', 'fakturerte stoppes av invoicedEntryBlock');
  assert.equal(approvedEntryBlock(rows, { canApprove: true }), '', 'leder retter selv');
  const screen = readFileSync(new URL('../../screens/arbeid/ArbeidScreen.jsx', import.meta.url), 'utf8');
  assert.equal((screen.match(/approvedEntryBlock\(/g) || []).length, 2, 'lagring og sletting i timelisten');
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

test('Godkjenninger ser hvilke timelister som er låst, låst opp eller godkjent (DRIFT-08)', () => {
  const before = [{ id: 'l1', employeeId: 'e1', throughDate: '2026-10-02', lockedAt: 'a' }];
  const after = [
    { id: 'l1', employeeId: 'e1', throughDate: '2026-10-02', lockedAt: 'a' },
    { id: 'l2', employeeId: 'e2', throughDate: '2026-10-28', lockedAt: 'b' },
  ];
  assert.notEqual(lockSignature(before), lockSignature(after));
  assert.equal(lockSignature([...after].reverse()), lockSignature(after), 'rekkefølgen spiller ingen rolle');
  assert.deepEqual(changedLockEmployees(before, after), ['e2']);
  const approved = after.map((row) => (row.employeeId === 'e1' ? { ...row, approvedAt: 'c', readyForBilling: true } : row));
  assert.deepEqual(changedLockEmployees(after, approved), ['e1']);
  assert.deepEqual(changedLockEmployees(approved, []), ['e1', 'e2']);
  assert.deepEqual(changedLockEmployees(after, after), []);

  const screen = readFileSync(new URL('../../screens/arbeid/ApprovalsScreen.jsx', import.meta.url), 'utf8');
  assert.match(screen, /liveLocks: true/);
  const hook = readFileSync(new URL('../../screens/arbeid/useTimesheetWorkspace.js', import.meta.url), 'utf8');
  assert.match(hook, /useProjects\(workspaceId, \{ enabled: !!liveLocks \}\)/);
  assert.match(hook, /ensureProjectHours\(workspaceId, \{ fromDate, toDate: toDate \|\| fromDate, employeeId, force: true \}\)/);
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

// Rettighetene som lar appen føre og endre andres timer: Begrenset redigering på Andres timer
// (timeliste, timerapport, Godkjenninger), Admin på Timerapport og Ansatte (personens timeliste og
// timerapport), og Til fakturering/Faktura (godkjenne, legge på og frigjøre fra faktura).
function editsOthersHours(grants) {
  return allows(grants, 'hoursOthers', 'read')
    || allows(grants, 'hoursReport', 'write')
    || allows(grants, 'employees', 'write')
    || allows(grants, 'economyBilling', 'read')
    || allows(grants, 'economyInvoices', 'read');
}

test('DRIFT-07: reglene lar de samme føre andres timer som appen, og vanlige ansatte bare egne', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const start = rules.indexOf('function timeRights');
  const body = rules.slice(start, rules.indexOf('\n    }\n', start));
  for (const part of [
    'isFamilyAdmin(familyId)', "'economyBilling', 2", "'economyInvoices', 2", "'hoursOthers', 2",
    "'hoursReport', 3", "'employees', 3",
  ]) {
    assert.ok(body.includes(part), part);
  }
  // Egne timer: ansattposten i employeeId (personUid), før og etter endringen.
  const block = rules.slice(rules.indexOf('match /timeEntries/{entryId}'), rules.indexOf('match /timeEntryDeletions/'));
  assert.match(block, /ownTimeEntryByAcl\(familyId, request\.resource\.data\)/);
  assert.match(block, /timeEntryUpdateOk\(familyId, timeRights\(familyId\)\)/);
  assert.match(rules, /function timeEntryUpdateOk[\s\S]*?ownTimeEntry\(familyId, resource\.data\) && sameTimeEntryEmployee\(\)/);

  // Appen: samme rettigheter avgjør hvem som velger person og endrer andres føringer.
  const arbeid = readFileSync(new URL('../../screens/arbeid/ArbeidScreen.jsx', import.meta.url), 'utf8');
  assert.match(arbeid, /access\.canEdit\('hoursOthers'\)/);
  const report = readFileSync(new URL('../../screens/economy/EconomyHours.jsx', import.meta.url), 'utf8');
  assert.match(report, /access\.canAdmin\('hoursReport'\) \? 'admin'/);
  const staff = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
  assert.match(staff, /const employeesAdmin = access\.ready && access\.canAdmin\('employees'\)/);

  for (const id of ['ansatt', 'tilbud', 'ansatt_andre_avdelinger', 'innleie_ekstern', 'regnskap_ekstern']) {
    assert.equal(editsOthersHours(standardGrants(id)), false, id);
  }
  for (const id of ['avdelingsleder', 'leder', 'hr_ansvarlig', 'administrator']) {
    assert.equal(editsOthersHours(standardGrants(id)), true, id);
  }
});
