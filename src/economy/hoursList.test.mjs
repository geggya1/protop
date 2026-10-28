import assert from 'node:assert/strict';
import {
  dayTimesheetRows,
  employeeHourOptions,
  filterEmployeeHourOptions,
  filterHours,
  groupHours,
  hourFacets,
  hourInvoiceLabel,
  hoursOutsideSelection,
  hourTotals,
  hydrateHourEntry,
  periodBounds,
  periodLoadRange,
  projectFromHourFilter,
  projectsMatchingHourQuery,
  shiftDateKey,
  sortHours,
} from './hoursList.js';
import { shortDayLabel } from '../arbeid/calendar.js';
import { IMPORT_INVOICED_ID, WRITE_OFF_ID } from './invoiceFlow.js';

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
  // Navn fra register; tabell hydreres så Tom-filter ikke viser Geir-navn.
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
  const people = [
    { id: 'tom', name: 'Tom Kåre Hestvåg', hours: 8 },
    { id: 'geir', name: 'Geir Ove Andersen', hours: 4 },
  ];
  assert.deepEqual(filterEmployeeHourOptions(people, 'kåre').map((row) => row.id), ['tom']);
  assert.deepEqual(filterEmployeeHourOptions(people, 'andersen geir').map((row) => row.id), ['geir']);
  assert.equal(filterEmployeeHourOptions(people, '').length, 2);
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

{
  const now = new Date(2026, 9, 13, 12, 0, 0);
  const week = periodLoadRange('7', '', '', now);
  assert.equal(week.fromDate, '2026-10-06');
  assert.equal(week.toDate, '2026-10-13');
  assert.deepEqual(periodLoadRange('all', '', '', now), { all: true });
  assert.equal(periodLoadRange('custom', '', '', now), null);
  assert.deepEqual(
    periodLoadRange('custom', '01.01.2016', '31.12.2016', now),
    { fromDate: '2016-01-01', toDate: '2016-12-31' },
  );
}

{
  const projects = [
    { id: 'p1', number: '10001', name: 'Myklebust CB6-12-13 (1882)', status: 'aktiv' },
    { id: 'p2', number: '200', name: 'Annen sak', status: 'arkivert' },
  ];
  const hit = projectsMatchingHourQuery(projects, '1882');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].id, 'p1');
  assert.equal(projectsMatchingHourQuery(projects, 'myklebust')[0].id, 'p1');
  assert.equal(projectFromHourFilter(projects, 'number:10001').id, 'p1');
  assert.equal(projectFromHourFilter(projects, 'p1').id, 'p1');
  const entries = [
    { id: 'a', projectId: 'p1', date: '2026-01-02', hours: 40, billableHours: 40 },
    { id: 'b', projectId: 'p1', date: '2026-10-12', hours: 8, billableHours: 8 },
  ];
  const gap = hoursOutsideSelection(entries, [entries[1]], hit);
  assert.equal(gap.hours, 48);
  assert.equal(gap.shown, 8);
  assert.equal(hoursOutsideSelection(entries, entries, hit), null);
}

{
  // Fakturert-kolonnen og filteret i Timerapport.
  const rows = [
    { id: 'a', date: '2024-01-02', hours: 2, billableHours: 2, invoiceId: IMPORT_INVOICED_ID, source: { values: { Fakturanummer: '10234' } } },
    { id: 'b', date: '2024-01-03', hours: 1, billableHours: 1, invoiceId: IMPORT_INVOICED_ID, source: { values: { Fakturert: 'Ja' } } },
    { id: 'c', date: '2024-01-04', hours: 3, billableHours: 3, invoiceId: 'inv1' },
    { id: 'd', date: '2024-01-05', hours: 4, billableHours: 4, invoiceId: WRITE_OFF_ID },
    { id: 'e', date: '2024-01-06', hours: 5, billableHours: 5, invoiceId: null },
    { id: 'f', date: '2024-01-07', hours: 6, billableHours: 0, invoiceId: null },
  ];
  assert.deepEqual(rows.map(hourInvoiceLabel), ['Fakturert 10234', 'Fakturert', 'På faktura', 'Avskrevet', '', '']);
  assert.deepEqual(filterHours(rows, { billable: 'invoiced' }).map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(filterHours(rows, { billable: 'uninvoiced' }).map((row) => row.id), ['e']);
  assert.equal(hourTotals(rows).invoiced, 6);
}

console.log('hoursList.test.mjs: ok');
