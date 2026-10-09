import assert from 'node:assert/strict';
import { dayTimesheetRows, shiftDateKey } from './hoursList.js';
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

console.log('hoursList.test.mjs: ok');
