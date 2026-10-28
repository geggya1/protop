/**
 * FL-07 / DS-18: en redigeringskopi overskriver ikke det serveren eller andre har endret.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyEmployeeClassification,
  employeeChanges,
  mergeEmployeeEdit,
  normalizeEmployee,
  presentEmployee,
  setEmployeePath,
} from './model.js';

const base = normalizeEmployee({
  id: 'emp_kari',
  updatedAt: '2026-10-01T10:00:00.000Z',
  person: { firstName: 'Kari', lastName: 'Nordmann', phone: '' },
  company: { status: 'active', accessLevel: 'ansatt', periodFrom: '2024-01-01', title: 'Snekker' },
  invite: { status: 'sent', email: 'kari@firma.no', accessLevel: 'ansatt' },
});

// Kari godtar mens administrator har henne åpen.
const accepted = normalizeEmployee({
  ...base,
  updatedAt: '2026-10-01T10:05:00.000Z',
  personUid: 'u-kari',
  company: { ...base.company, canLogin: true },
  invite: { ...base.invite, status: 'accepted', acceptedUid: 'u-kari', acceptedAt: '2026-10-01T10:05:00.000Z' },
});

test('endrede feltstier, med lister som én verdi', () => {
  const next = setEmployeePath(base, 'person.phone', '99887766');
  assert.deepEqual(employeeChanges(base, next), ['person.phone']);
  const listed = { ...base, company: { ...base.company, departmentIds: ['a'] } };
  assert.deepEqual(employeeChanges(base, listed), ['company.departmentIds']);
});

test('telefon endret i en gammel kopi: koblingen og invitasjonen fra serveren står', () => {
  const draft = setEmployeePath(presentEmployee(base), 'person.phone', '99887766');
  const merged = mergeEmployeeEdit({ remote: accepted, base, next: draft });
  assert.equal(merged.person.phone, '+4799887766');
  assert.equal(merged.personUid, 'u-kari');
  assert.equal(merged.linkStatus, 'linked');
  assert.equal(merged.invite.status, 'accepted');
  assert.equal(merged.company.canLogin, true);
  // Datoene i kopien (dd.mm.åååå) regnes ikke som endring.
  assert.equal(merged.company.periodFrom, '2024-01-01');
});

test('deaktivering fra en gammel kopi beholder personUid, så avslutningen treffer riktig person', () => {
  const draft = applyEmployeeClassification(presentEmployee(base), { status: 'inactive' });
  const merged = mergeEmployeeEdit({ remote: accepted, base, next: draft });
  assert.equal(merged.company.status, 'inactive');
  assert.equal(merged.personUid, 'u-kari');
  assert.equal(merged.invite.status, 'accepted');
});

test('to personer endrer ulike felt: begge endringene står', () => {
  const other = normalizeEmployee({ ...base, updatedAt: '2026-10-02T08:00:00.000Z', company: { ...base.company, title: 'Bas' } });
  const draft = setEmployeePath(base, 'person.phone', '41234567');
  const merged = mergeEmployeeEdit({ remote: other, base, next: draft });
  assert.equal(merged.company.title, 'Bas');
  assert.equal(merged.person.phone, '+4741234567');
});

test('samme felt endret begge steder: den som lagrer sist vinner (ikke serverfelt)', () => {
  const other = normalizeEmployee({ ...base, company: { ...base.company, title: 'Bas' } });
  const draft = setEmployeePath(base, 'company.title', 'Formann');
  assert.equal(mergeEmployeeEdit({ remote: other, base, next: draft }).company.title, 'Formann');
});

test('egen endring av invitasjonen virker når serveren ikke har rørt den', () => {
  const draft = { ...base, invite: { ...base.invite, status: 'queued' } };
  assert.equal(mergeEmployeeEdit({ remote: base, base, next: draft }).invite.status, 'queued');
});

test('uten kjent utgangspunkt: kopien vinner, men kobling og invitasjon fra skyen står', () => {
  const draft = { ...setEmployeePath(base, 'person.phone', '1234 5678'), updatedAt: 'ukjent' };
  const merged = mergeEmployeeEdit({ remote: accepted, base: null, next: draft });
  assert.equal(merged.person.phone, '+4712345678');
  assert.equal(merged.personUid, 'u-kari');
  assert.equal(merged.invite.status, 'accepted');
  // Ikke koblet i skyen: en manuell kobling i kopien beholdes.
  const linked = mergeEmployeeEdit({ remote: base, base: null, next: { ...base, personUid: 'u-ny' } });
  assert.equal(linked.personUid, 'u-ny');
});

test('ny ansatt (ikke i skyen): kopien lagres som den er', () => {
  const merged = mergeEmployeeEdit({ remote: null, base: null, next: presentEmployee(base) });
  assert.equal(merged.person.firstName, 'Kari');
  assert.equal(merged.company.periodFrom, '2024-01-01');
});
