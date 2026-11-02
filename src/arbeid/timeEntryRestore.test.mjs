/**
 * Gjenoppretting av slettede timeføringer fra slettelloggen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deletedTimeEntryRecord } from './timeEntryHistory.js';
import {
  deletionRows,
  filterDeletionRows,
  restoreReason,
  restoredEntryId,
  restoredTimeEntry,
} from './timeEntryRestore.js';

const entry = {
  id: 't1', employeeId: 'e1', projectId: 'p1', date: '2026-10-19', hours: 7.5, billableHours: 7,
  description: 'Montering', clockIn: '07:00', clockOut: '15:00', status: 'godkjent', invoiceId: 'f9',
  createdByUid: 'u-ansatt', createdAt: '2026-10-19T15:00:00.000Z', history: [{ kind: 'created' }],
};
const leader = { uid: 'u-leder', name: 'Leder' };
const record = { ...deletedTimeEntryRecord(entry, { actor: leader, at: '2026-10-21T09:00:00.000Z', reason: 'Dobbeltført' }), id: 'd1' };

test('hel kopi: alt kommer tilbake, men som ny, ikke godkjent og ikke fakturert føring', () => {
  const restored = restoredTimeEntry(record, { at: '2026-11-02T10:00:00.000Z' });
  assert.equal(restored.id, 't1_gjenopprettet');
  assert.equal(restored.restoredFrom, 't1');
  assert.equal(restored.description, 'Montering');
  assert.equal(restored.billableHours, 7);
  assert.equal(restored.clockIn, '07:00');
  assert.equal(restored.createdByUid, 'u-ansatt', 'føringen tilhører fortsatt den ansatte');
  assert.equal(restored.createdAt, '2026-10-19T15:00:00.000Z');
  assert.equal(restored.updatedAt, '2026-11-02T10:00:00.000Z');
  assert.equal(restored.status, 'registrert');
  assert.equal(restored.invoiceId, null);
  assert.equal('history' in restored, false, 'historikken starter på nytt med en rad om gjenopprettingen');
});

test('samme sletting gir samme id, så to klikk ikke gir to føringer', () => {
  assert.equal(restoredEntryId(record), restoredEntryId({ ...record }));
  assert.equal(restoredTimeEntry(record).id, restoredTimeEntry(record).id);
});

test('eldre sletting uten kopi: dato, timer, prosjekt og ansatt kommer tilbake', () => {
  const old = { entryId: 't2', employeeId: 'e1', projectId: 'p1', date: '2026-09-01', hours: 4, kind: 'deleted', at: '2026-09-02T08:00:00Z' };
  const restored = restoredTimeEntry(old);
  assert.equal(restored.id, 't2_gjenopprettet');
  assert.equal(restored.hours, 4);
  assert.equal(restored.date, '2026-09-01');
  assert.equal(restored.status, 'registrert');
});

test('sletting uten prosjekt, ansatt eller dato kan ikke gjenopprettes', () => {
  assert.equal(restoredTimeEntry({ entryId: 'x', hours: 3 }), null);
  assert.equal(restoredTimeEntry(null), null);
  assert.equal(restoredTimeEntry({ employeeId: 'e1', projectId: 'p1', date: '2026-01-01' }), null, 'uten id');
});

test('grunnen i historikken sier når og av hvem føringen ble slettet', () => {
  assert.equal(restoreReason(record), 'Gjenopprettet, slettet 2026-10-21 av Leder');
  assert.equal(restoreReason({}), 'Gjenopprettet');
});

test('visning: nyeste først, navn i stedet for id, og hva som allerede er gjenopprettet', () => {
  const older = { entryId: 't2', employeeId: 'e2', projectId: 'p2', date: '2026-09-01', hours: 4, at: '2026-09-02T08:00:00Z', byName: 'Kari' };
  const broken = { entryId: 't3', hours: 1, at: '2026-10-25T08:00:00Z' };
  const rows = deletionRows([older, record, broken, null, { at: 'x' }], {
    restored: new Set(['t2']),
    employees: [{ id: 'e1', name: 'Ola' }, { id: 'e2', name: 'Kari' }],
    projects: [{ id: 'p1', number: '1001', name: 'Bygg A' }],
  });
  assert.deepEqual(rows.map((row) => row.entryId), ['t3', 't1', 't2']);
  const [noData, full, restored] = rows;
  assert.equal(full.employee, 'Ola');
  assert.equal(full.project, '1001 Bygg A');
  assert.equal(full.description, 'Montering');
  assert.equal(full.full, true);
  assert.equal(full.restorable, true);
  assert.equal(full.restored, false);
  assert.equal(restored.restored, true);
  assert.equal(restored.full, false);
  assert.equal(restored.project, 'Ukjent prosjekt');
  assert.equal(noData.restorable, false);
  assert.equal(noData.employee, 'Ukjent ansatt');
});

test('filter på ansatt, prosjekt eller beskrivelse', () => {
  const rows = deletionRows([record, { entryId: 't2', employeeId: 'e2', projectId: 'p2', date: '2026-09-01', hours: 4, at: '2026-09-02T08:00:00Z' }], {
    employees: [{ id: 'e1', name: 'Ola' }, { id: 'e2', name: 'Kari' }],
  });
  assert.deepEqual(filterDeletionRows(rows, 'kari').map((row) => row.entryId), ['t2']);
  assert.deepEqual(filterDeletionRows(rows, 'monter').map((row) => row.entryId), ['t1']);
  assert.equal(filterDeletionRows(rows, '').length, 2);
});
