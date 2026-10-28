/**
 * Endringshistorikk for timeføringer (AML § 10-7).
 */
import assert from 'node:assert/strict';
import {
  TRACKED_TIME_FIELDS,
  changedByOther,
  deletedTimeEntryRecord,
  timeEntryChanges,
  timeEntryHistoryLines,
  withTimeEntryHistory,
} from './timeEntryHistory.js';

const entry = {
  id: 't1', employeeId: 'e1', projectId: 'p1', date: '2026-10-19', hours: 7.5,
  clockIn: '07:00', clockOut: '15:00', status: 'registrert', createdByUid: 'u-ansatt',
};
const leader = { byUid: 'u-leder', byName: 'Leder' };

assert.ok(TRACKED_TIME_FIELDS.includes('hours'));
assert.ok(TRACKED_TIME_FIELDS.includes('clockOut'));

// Endrede felt, også tall som tekst.
assert.deepEqual(timeEntryChanges(entry, { ...entry, hours: '7.5' }), []);
assert.deepEqual(timeEntryChanges(entry, { ...entry, hours: 9, clockOut: '16:30' }), [
  { field: 'hours', from: '7.5', to: '9' },
  { field: 'clockOut', from: '15:00', to: '16:30' },
]);

// Ny føring og endring gir rader i history. Uendret gir ingen ny rad.
const created = withTimeEntryHistory(null, entry, { actor: { byUid: 'u-ansatt', byName: 'Kari' }, at: '2026-10-19T15:05:00.000Z' });
assert.deepEqual(created.history, [{ at: '2026-10-19T15:05:00.000Z', kind: 'created', byUid: 'u-ansatt', byName: 'Kari' }]);
const changed = withTimeEntryHistory(created, { ...created, hours: 9 }, { actor: leader, at: '2026-10-20T08:00:00.000Z', reason: 'Glemt overtid' });
assert.equal(changed.history.length, 2);
assert.deepEqual(changed.history[1], {
  at: '2026-10-20T08:00:00.000Z',
  kind: 'changed',
  byUid: 'u-leder',
  byName: 'Leder',
  changes: [{ field: 'hours', from: '7.5', to: '9' }],
  reason: 'Glemt overtid',
});
const untouched = { ...changed };
assert.equal(withTimeEntryHistory(changed, untouched, { actor: leader }), untouched, 'uendret føring får ingen ny rad');
assert.equal(withTimeEntryHistory(changed, { ...changed, internalNote: 'x' }).history.length, 2, 'internt notat spores ikke');

// Historikken har et tak.
let many = created;
for (let i = 0; i < 120; i += 1) many = withTimeEntryHistory(many, { ...many, hours: i + 1 }, { actor: leader });
assert.equal(many.history.length, 100);

// Sletting spores med en egen rad.
const deleted = deletedTimeEntryRecord(entry, { actor: leader, at: '2026-10-21T09:00:00.000Z', reason: 'Dobbeltført' });
assert.deepEqual(deleted, {
  entryId: 't1', employeeId: 'e1', date: '2026-10-19', hours: 7.5, projectId: 'p1',
  at: '2026-10-21T09:00:00.000Z', kind: 'deleted', byUid: 'u-leder', byName: 'Leder', reason: 'Dobbeltført',
});

// Den ansatte varsles når andre endrer.
assert.equal(changedByOther(entry, 'u-leder'), true);
assert.equal(changedByOther(entry, 'u-ansatt'), false);
assert.equal(changedByOther({}, 'u-leder'), false, 'ukjent eier gir ikke varsel');
assert.equal(changedByOther({ createdByUid: 'u-leder' }, 'u-leder', { employeeUid: 'u-ansatt' }), true, 'leder førte for den ansatte');

// Visning: nyeste først, med hvem, når og hva.
{
  const lines = timeEntryHistoryLines([
    { at: '2026-10-19T15:05:00.000Z', kind: 'created', byName: 'Kari' },
    { at: '2026-10-20T08:00:00.000Z', kind: 'changed', byName: 'Leder', changes: [{ field: 'hours', from: '7.5', to: '9' }, { field: 'projectId', from: 'p1', to: 'p2' }], reason: 'Rettet' },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].who, 'Leder');
  assert.equal(lines[0].text, 'Endret timer 7.5 → 9, prosjekt (Rettet)');
  assert.equal(lines[1].text, 'Ført');
  assert.match(lines[1].when, /^\d\d\.10\.2026 \d\d:\d\d$/);
  assert.deepEqual(timeEntryHistoryLines(null), []);
  assert.equal(timeEntryHistoryLines([{ kind: 'changed' }])[0].who, 'Ukjent');
}

// Lagringen (L-13): én ny rad per lagring med kjent forrige versjon, og varsel når en annen endrer.
{
  const { timeEntryWritePlan } = await import('../economy/timeEntryStorage.js');
  const prev = { ...entry, history: [{ at: '2026-10-19T15:05:00.000Z', kind: 'created', byUid: 'u-ansatt' }] };
  const plan = timeEntryWritePlan(prev, { ...prev, hours: 8 }, { actor: { uid: 'u-leder', name: 'Leder' }, at: '2026-10-20T08:00:00.000Z' });
  assert.equal(plan.patch.history, undefined, 'historikken skrives aldri som hel liste');
  assert.equal(plan.historyRow.kind, 'changed');
  assert.deepEqual(plan.historyRow.changes, [{ field: 'hours', from: '7.5', to: '8' }]);
  assert.equal(plan.notifyUid, 'u-ansatt');
  // Egen endring: ingen beskjed.
  assert.equal(timeEntryWritePlan(prev, { ...prev, hours: 8 }, { actor: { uid: 'u-ansatt' } }).notifyUid, '');
  // Uendret i sporede felt: ingen rad. Uten kjent forrige versjon: ingen rad.
  assert.equal(timeEntryWritePlan(prev, { ...prev, internalNote: 'x' }, { actor: { uid: 'u-leder' } }).historyRow, null);
  assert.equal(timeEntryWritePlan(null, prev, { actor: { uid: 'u-leder' } }).historyRow, null);
  // Ny føring når forrige versjon er kjent.
  assert.equal(timeEntryWritePlan(null, entry, { known: true, actor: { uid: 'u-ansatt' }, reason: 'Import' }).historyRow.reason, 'Import');
}

console.log('timeEntryHistory.test.mjs: ok');
