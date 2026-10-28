/**
 * L-19: innsynslogg for HR, lønn, fravær og personnummer.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ACCESS_LOG_WINDOW_MS, accessKindLabel, accessLogDocId, accessLogLines, normalizeAccessEvent, shouldSendAccess,
} from './accessLog.js';

test('bare kjente typer og gyldige id-er godtas', () => {
  assert.deepEqual(normalizeAccessEvent({ kind: 'salary' }), { kind: 'salary', employeeId: '' });
  assert.deepEqual(normalizeAccessEvent({ kind: 'nationalId', employeeId: 'e1' }), { kind: 'nationalId', employeeId: 'e1' });
  assert.equal(normalizeAccessEvent({ kind: 'alt' }), null);
  assert.equal(normalizeAccessEvent({ kind: 'hrFolder', employeeId: 'a/b' }), null);
  assert.equal(accessKindLabel('absence'), 'Fravær');
});

test('samme innsyn i samme vindu får samme dokument-id', () => {
  const t = 1_000 * ACCESS_LOG_WINDOW_MS;
  const a = accessLogDocId({ actorUid: 'u1', kind: 'salary', employeeId: 'e1' }, t);
  assert.equal(accessLogDocId({ actorUid: 'u1', kind: 'salary', employeeId: 'e1' }, t + ACCESS_LOG_WINDOW_MS - 1), a);
  assert.notEqual(accessLogDocId({ actorUid: 'u1', kind: 'salary', employeeId: 'e1' }, t + ACCESS_LOG_WINDOW_MS), a);
  assert.notEqual(accessLogDocId({ actorUid: 'u1', kind: 'hrFolder', employeeId: 'e1' }, t), a);
  assert.match(accessLogDocId({ actorUid: 'u/1', kind: 'salary' }, t), /_u_1_salary_alle$/);
});

test('klienten sender samme innsyn én gang per vindu', () => {
  const seen = new Map();
  assert.equal(shouldSendAccess(seen, 'k', 1000), true);
  assert.equal(shouldSendAccess(seen, 'k', 1000 + ACCESS_LOG_WINDOW_MS - 1), false);
  assert.equal(shouldSendAccess(seen, 'k', 1000 + ACCESS_LOG_WINDOW_MS), true);
  assert.equal(shouldSendAccess(seen, 'annen', 1001), true);
});

test('visning: hvem, hva, hvem det gjelder og når', () => {
  const [line] = accessLogLines([{ id: 'x', at: '2026-10-28T13:05:00.000Z', actorName: 'Kari Leder', kind: 'salary', employeeId: 'e1', employeeName: 'Per' }]);
  assert.equal(line.who, 'Kari Leder');
  assert.equal(line.what, 'Lønn');
  assert.equal(line.whom, 'Per');
  assert.match(line.when, /^28\.10\.2026 \d\d:05$/);
  assert.equal(accessLogLines([{ kind: 'salary' }])[0].whom, 'Alle ansatte');
});

test('HR, lønn, personnummer og fravær logges der de åpnes, og loggen vises for HR og den ansatte', () => {
  const hr = readFileSync(new URL('../../screens/hr/HrScreen.jsx', import.meta.url), 'utf8');
  assert.match(hr, /kind: employeeSheet === 'lonn' \? 'salary' : 'hrFolder'/);
  assert.match(hr, /canSeeAccessLog=\{access\.ready && access\.canAdmin\('hr'\)\}/);
  const employees = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
  assert.match(employees, /kind: 'nationalId', employeeId: selected\.id/);
  assert.match(employees, /kind: 'absence', employeeId: selected\.id/);
  const self = readFileSync(new URL('../../screens/hr/EmployeeHrSelfService.jsx', import.meta.url), 'utf8');
  assert.match(self, /<HrAccessLog[\s\S]*employeeId=\{employeeId\}/);
});
