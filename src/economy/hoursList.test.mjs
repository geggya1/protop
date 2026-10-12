import assert from 'node:assert/strict';
import {
  dayTimesheetRows,
  employeeHourOptions,
  filterHours,
  groupHours,
  hourFacets,
  hydrateHourEntry,
  periodBounds,
  shiftDateKey,
  sortHours,
} from './hoursList.js';
import { shortDayLabel } from '../arbeid/calendar.js';

assert.equal(shortDayLabel('2023-10-09'), '9 okt');
assert.equal(shortDayLabel(new Date(2023, 9, 9)), '9 okt');
assert.equal(shiftDateKey('2023-10-09', -1), '2023-10-08');
assert.equal(shiftDateKey('2023-10-09', 1), '2023-10-10');

{
  const { rows, totalHours } = dayTimesheetRows({
    date: '2023-10-09',
    employeeId: 'emp1',
    projects: [
      { id: 'p1', number: '10563', name: 'Kvitsøy skole - PL', client: 'Kvitsøy Kommune' },
      { id: 'p2', number: '10610', name: 'Kino Kino', client: 'Sandnes Kommune' },
      { id: 'p3', number: '10315', name: 'Sporafjell barnehage', client: 'Klepp Kommune' },
    ],
    members: [
      { projectId: 'p1', employeeId: 'emp1', role: 'Prosjekteringsleder', active: true },
      { projectId: 'p2', employeeId: 'emp1', role: 'Prosjektleder', active: true },
      { projectId: 'p3', employeeId: 'emp1', role: 'Prosjektleder', active: true },
    ],
    entries: [
      { projectId: 'p1', employeeId: 'emp1', date: '2023-10-09', hours: 6 },
      { projectId: 'p2', employeeId: 'emp1', date: '2023-10-09', hours: 1.5 },
    ],
  });
  assert.equal(totalHours, 7.5);
  assert.equal(rows.length, 3);
  const withHours = rows.filter((row) => row.hours > 0);
  assert.equal(withHours.length, 2);
  assert.equal(rows.find((row) => row.number === '10563').role, 'Prosjekteringsleder');
  assert.equal(rows.find((row) => row.number === '10315').hours, 0);
}

{
  const entries = [
    { id: '1', employeeId: 'geir', employeeName: 'Geir Ove Andersen', date: '2026-10-10', hours: 8, billableHours: 8, projectName: 'A' },
    { id: '2', employeeId: 'tom', employeeName: 'Tom Kåre Hestvåg', date: '2025-01-01', hours: 8, billableHours: 8, projectName: 'B' },
    { id: '3', employeeId: 'tom', employeeName: 'Tom Kåre Hestvåg', date: '2026-10-10', hours: 0, billableHours: 0, projectName: 'C' },
  ];
  const yearSlice = filterHours(entries, { period: 'year' }, new Date('2026-10-12'));
  assert.equal(yearSlice.length, 2);
  const options = employeeHourOptions(yearSlice);
  assert.deepEqual(options.map((row) => row.id), ['geir']);
  const sorted = sortHours(yearSlice, 'hours-desc');
  assert.equal(sorted[0].employeeId, 'geir');
  const groups = groupHours(yearSlice, 'employee');
  assert.equal(groups.length, 2);
}

{
  // Chip-navn fra register; tabell hydreres så Tom-filter ikke viser Geir-navn.
  const employees = [
    { id: 'tom', person: { firstName: 'Tom', middleName: 'Kåre', lastName: 'Hestvåg' } },
    { id: 'geir', person: { firstName: 'Geir', middleName: 'Ove', lastName: 'Andersen' } },
  ];
  const entries = [{
    id: '1',
    employeeId: 'tom',
    employeeName: 'Geir Ove Andersen',
    date: '2026-10-06',
    hours: 8,
    projectId: 'p1',
    projectNumber: '',
    projectName: '',
    customerId: 'c1',
    customerName: '',
  }];
  const options = employeeHourOptions(entries, employees);
  assert.equal(options[0].id, 'tom');
  assert.equal(options[0].name, 'Tom Kåre Hestvåg');
  const filtered = filterHours(entries, { employeeId: 'tom' });
  assert.equal(filtered.length, 1);
  const hydrated = hydrateHourEntry(filtered[0], {
    employeesById: new Map(employees.map((row) => [row.id, row])),
    projectsById: new Map([['p1', {
      id: 'p1', number: '10857', name: 'Sikker skolevei', customerId: 'c1', client: 'Sola Kommune',
    }]]),
    customersById: new Map([['c1', { id: 'c1', name: 'Sola Kommune', customerNumber: '10010' }]]),
  });
  assert.equal(hydrated.employeeName, 'Tom Kåre Hestvåg');
  assert.equal(hydrated.projectName, 'Sikker skolevei');
  assert.equal(hydrated.projectNumber, '10857');
  assert.equal(hydrated.customerName, 'Sola Kommune');
}

{
  // Facetter uten id må fortsatt kunne filtreres (name:/number: nøkler).
  const entries = [{
    id: '1',
    employeeId: 'geir',
    employeeName: 'Geir',
    customerName: 'Sola Kommune',
    projectNumber: '10857',
    projectName: 'Skole',
    date: '2026-10-06',
    hours: 2,
  }];
  const facets = hourFacets(entries);
  assert.ok(facets.customers[0].id.startsWith('name:'));
  assert.ok(facets.projects[0].id.startsWith('number:'));
  assert.equal(filterHours(entries, { customerId: facets.customers[0].id }).length, 1);
  assert.equal(filterHours(entries, { projectId: facets.projects[0].id }).length, 1);
}

{
  // Egen periode med norsk datoformat må filtrere ISO-rader.
  const bounds = periodBounds('custom', '01.01.2016', '31.12.2016');
  assert.equal(bounds.minDate, '2016-01-01');
  assert.equal(bounds.maxDate, '2016-12-31');
  const entries = [
    { id: '1', employeeId: 'a', date: '2016-06-15', hours: 8 },
    { id: '2', employeeId: 'a', date: '2026-10-10', hours: 8 },
  ];
  const filtered = filterHours(entries, {
    period: 'custom',
    fromDate: '01.01.2016',
    toDate: '31.12.2016',
  });
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, '1');
}

console.log('hoursList.test.mjs: ok');
