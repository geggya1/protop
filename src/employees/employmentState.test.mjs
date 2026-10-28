import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  employmentClosed,
  employmentEndDate,
  employmentState,
  isActiveEmployee,
} from './model.js';
import { filterEmployeesForPicker, findLinkedEmployee } from '../arbeid/roles.js';
import { publicStaff } from '../project/companyPage.js';

const now = new Date(2026, 9, 27, 12, 0, 0);
const row = (company, extra = {}) => ({ id: extra.id || 'e', person: { firstName: 'Kari' }, company, ...extra });

test('status gir tilstand, med eldre navn slått sammen', () => {
  assert.equal(employmentState(row({ status: 'active' }), { now }), 'active');
  assert.equal(employmentState(row({}), { now }), 'active');
  assert.equal(employmentState(row({ status: 'current' }), { now }), 'active');
  assert.equal(employmentState(row({ status: 'leave' }), { now }), 'leave');
  assert.equal(employmentState(row({ status: 'inactive' }), { now }), 'inactive');
  assert.equal(employmentState(row({ status: 'former' }), { now }), 'inactive');
  assert.equal(employmentState(row({ status: 'deleted' }), { now }), 'deleted');
  assert.equal(employmentState(row({ status: 'trash' }), { now }), 'deleted');
  assert.equal(employmentState(null, { now }), 'active');
});

test('sluttdato i fortid betyr avsluttet; dagen selv er siste arbeidsdag', () => {
  assert.equal(employmentState(row({ status: 'active', periodTo: '2026-10-26' }), { now }), 'ended');
  assert.equal(employmentState(row({ status: 'active', periodTo: '26.10.2026' }), { now }), 'ended');
  assert.equal(employmentState(row({ status: 'leave', periodTo: '2026-01-01' }), { now }), 'ended');
  assert.equal(employmentState(row({ status: 'active', periodTo: '2026-10-27' }), { now }), 'active');
  assert.equal(employmentState(row({ status: 'active', periodTo: '01.12.2026' }), { now }), 'active');
  assert.equal(employmentState(row({ status: 'active', periodTo: 'snart' }), { now }), 'active');
  assert.equal(employmentEndDate(row({ periodTo: '5.3.2027' })), '2027-03-05');
  // Papirkurv og deaktivert vinner over datoen.
  assert.equal(employmentState(row({ status: 'deleted', periodTo: '2020-01-01' }), { now }), 'deleted');
});

test('aktiv = i arbeid eller permisjon', () => {
  assert.equal(isActiveEmployee(row({ status: 'active' }), { now }), true);
  assert.equal(isActiveEmployee(row({ status: 'leave' }), { now }), true);
  for (const status of ['inactive', 'former', 'deleted']) {
    assert.equal(isActiveEmployee(row({ status }), { now }), false, status);
    assert.equal(employmentClosed(row({ status }), { now }), true, status);
  }
  assert.equal(isActiveEmployee(row({ status: 'active', periodTo: '2020-01-01' }), { now }), false);
});

test('valglister og offentlig side bruker samme definisjon', () => {
  const people = [
    row({ status: 'active' }, { id: 'a', personUid: 'u-a' }),
    row({ status: 'leave' }, { id: 'b' }),
    row({ status: 'inactive' }, { id: 'c', personUid: 'u-c' }),
    row({ status: 'deleted' }, { id: 'd' }),
    row({ status: 'active', periodTo: '2001-01-01' }, { id: 'e' }),
  ];
  assert.deepEqual(filterEmployeesForPicker(people).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(publicStaff(people).map((r) => r.id), ['a', 'b']);
  assert.equal(findLinkedEmployee(people, 'u-a')?.id, 'a');
  assert.equal(findLinkedEmployee(people, 'u-c'), null, 'deaktivert er ikke «meg» i Arbeid');
});
