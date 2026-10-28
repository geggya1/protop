import assert from 'node:assert/strict';
import {
  employeeDisplayName,
  employeePickerEmail,
  filterEmployeesForPicker,
  groupEmployeesForTimesheetPicker,
} from './roles.js';

{
  const rows = [
    {
      id: 'a',
      person: { firstName: 'Aina', middleName: 'Berg', lastName: 'Helen Jespersen', email: 'aina@example.com' },
      company: { status: 'active', accessRole: 'Regnskap eksternt', externalEmployeeNumber: '11', personnelKind: 'external' },
    },
    {
      id: 'b',
      person: { firstName: 'Anders', lastName: 'Rolandsen' },
      company: {
        status: 'active',
        accessRole: 'Øverste leder',
        title: 'Prosjekt- og byggeleder',
        externalEmployeeNumber: '22',
        email: 'anders@consult.no',
        personnelKind: 'staff',
      },
    },
    {
      id: 'c',
      person: { firstName: 'Tom', lastName: 'Kåre Hestvåg', email: 'tom@old.no' },
      company: { status: 'former', accessRole: 'Medarbeider', personnelKind: 'staff' },
    },
    {
      id: 'd',
      person: { firstName: 'Slettet', lastName: 'Person' },
      company: { status: 'deleted', personnelKind: 'staff' },
    },
    {
      id: 'e',
      person: { firstName: 'Eva', lastName: 'Ekstern' },
      company: { status: 'inactive', accessRole: 'Innleie eksternt', email: 'eva@hire.no', personnelKind: 'innleid' },
    },
  ];

  // Valglisten viser bare aktive (samme definisjon som tilgangen). Rapporter tar med avsluttede.
  assert.deepEqual(filterEmployeesForPicker(rows).map((row) => row.id).sort(), ['a', 'b']);
  assert.deepEqual(filterEmployeesForPicker(rows, '', { includeClosed: true }).map((row) => row.id).sort(), ['a', 'b', 'c', 'e']);
  assert.deepEqual(filterEmployeesForPicker(rows, 'anders').map((row) => row.id), ['b']);
  assert.deepEqual(filterEmployeesForPicker(rows, 'leder').map((row) => row.id), ['b']);
  assert.deepEqual(filterEmployeesForPicker(rows, '11').map((row) => row.id), ['a']);
  assert.deepEqual(filterEmployeesForPicker(rows, 'aina@').map((row) => row.id), ['a']);
  assert.equal(filterEmployeesForPicker(rows, 'hestvåg').length, 0);
  assert.deepEqual(filterEmployeesForPicker(rows, 'jespersen aina').map((row) => row.id), ['a']);
  assert.deepEqual(filterEmployeesForPicker(rows, 'berg').map((row) => row.id), ['a']);
  assert.equal(employeeDisplayName(rows[1]), 'Anders Rolandsen');
  assert.equal(employeePickerEmail(rows[1]), 'anders@consult.no');
  assert.equal(employeePickerEmail(rows[0]), 'aina@example.com');

  const groups = groupEmployeesForTimesheetPicker(rows);
  assert.deepEqual(groups.company.active.map((row) => row.id), ['b']);
  assert.deepEqual(groups.company.inactive.map((row) => row.id), ['c']);
  assert.deepEqual(groups.external.active.map((row) => row.id), ['a']);
  assert.deepEqual(groups.external.inactive.map((row) => row.id), ['e']);
  assert.ok(!groups.company.active.some((row) => row.id === 'd'));
  assert.ok(!groups.company.inactive.some((row) => row.id === 'd'));

  const searched = groupEmployeesForTimesheetPicker(rows, 'eva');
  assert.deepEqual(searched.external.inactive.map((row) => row.id), ['e']);
  assert.equal(searched.company.active.length, 0);
  assert.equal(searched.external.active.length, 0);
}

console.log('roles.test.mjs: ok');
