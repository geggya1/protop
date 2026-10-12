import assert from 'node:assert/strict';
import {
  employeeDisplayName,
  filterEmployeesForPicker,
} from './roles.js';

{
  const rows = [
    {
      id: 'a',
      person: { firstName: 'Aina', lastName: 'Helen Jespersen', email: 'aina@example.com' },
      company: { status: 'active', accessRole: 'Regnskap eksternt', externalEmployeeNumber: '11' },
    },
    {
      id: 'b',
      person: { firstName: 'Anders', lastName: 'Rolandsen' },
      company: { status: 'active', accessRole: 'Øverste leder', title: 'Prosjekt- og byggeleder', externalEmployeeNumber: '22' },
    },
    {
      id: 'c',
      person: { firstName: 'Tom', lastName: 'Kåre Hestvåg' },
      company: { status: 'former', accessRole: 'Medarbeider' },
    },
  ];

  assert.equal(filterEmployeesForPicker(rows).length, 2);
  assert.deepEqual(filterEmployeesForPicker(rows, 'anders').map((row) => row.id), ['b']);
  assert.deepEqual(filterEmployeesForPicker(rows, 'leder').map((row) => row.id), ['b']);
  assert.deepEqual(filterEmployeesForPicker(rows, '11').map((row) => row.id), ['a']);
  assert.deepEqual(filterEmployeesForPicker(rows, 'aina@').map((row) => row.id), ['a']);
  assert.equal(filterEmployeesForPicker(rows, 'hestvåg').length, 0);
  assert.equal(employeeDisplayName(rows[1]), 'Anders Rolandsen');
}

console.log('roles.test.mjs: ok');
