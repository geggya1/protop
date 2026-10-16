import assert from 'node:assert/strict';
import {
  filterTimesheetProjects,
  timesheetActivityRange,
  timesheetColumnMetrics,
  timesheetHoursLoadRange,
} from './timesheetProjects.js';

{
  const range = timesheetActivityRange(new Date(2026, 9, 14)); // 14. okt 2026
  assert.equal(range.fromDate, '2026-08-01');
  assert.equal(range.toDate, '2026-10-14');
}

{
  const load = timesheetHoursLoadRange(
    { fromDate: '2026-08-01', toDate: '2026-10-14' },
    { fromDate: '2026-06-01', toDate: '2026-06-30' },
  );
  assert.equal(load.fromDate, '2026-06-01');
  assert.equal(load.toDate, '2026-10-14');
}

{
  const rows = [
    { project: { id: 'old' }, member: { addedAt: '2025-01-01' }, starred: false },
    { project: { id: 'star' }, member: { addedAt: '2025-01-01' }, starred: true },
    { project: { id: 'new' }, member: { addedAt: '2026-09-20T12:00:00.000Z' }, starred: false },
    { project: { id: 'hours' }, member: { addedAt: '2025-01-01' }, starred: false },
    { project: { id: 'viewOnly' }, member: { addedAt: '2025-01-01' }, starred: false },
  ];
  const entries = [
    { employeeId: 'e1', projectId: 'hours', date: '2026-09-05', hours: 7.5 },
    { employeeId: 'e1', projectId: 'viewOnly', date: '2026-06-10', hours: 4 },
    { employeeId: 'e1', projectId: 'old', date: '2025-03-01', hours: 8 },
  ];
  const visible = filterTimesheetProjects(rows, {
    timeEntries: entries,
    employeeId: 'e1',
    activityFrom: '2026-08-01',
    activityTo: '2026-10-14',
    viewFrom: '2026-06-01',
    viewTo: '2026-06-30',
  }).map((row) => row.project.id);
  assert.deepEqual(visible.sort(), ['hours', 'star', 'viewOnly']);
}

{
  const rows = [
    { project: { id: 'fresh' }, member: { addedAt: '2026-10-01' }, starred: false },
    { project: { id: 'objectDate' }, member: { addedAt: '[object Object]' }, starred: false },
  ];
  const visible = filterTimesheetProjects(rows, {
    timeEntries: [],
    employeeId: 'e1',
    activityFrom: '2026-08-01',
    activityTo: '2026-10-14',
    viewFrom: '2026-10-01',
    viewTo: '2026-10-31',
  }).map((row) => row.project.id);
  assert.deepEqual(visible, []);
}

{
  const rows = [
    { project: { id: 'old' }, member: { addedAt: '2025-01-01' }, starred: false },
  ];
  assert.equal(filterTimesheetProjects(rows, { keepAll: true }).length, 1);
  assert.equal(filterTimesheetProjects(rows, {
    employeeId: 'e1',
    activityFrom: '2026-08-01',
    activityTo: '2026-10-14',
  }).length, 0);
}

{
  const narrow = timesheetColumnMetrics(800, 31);
  assert.ok(narrow.dayW >= 40);
  assert.equal(narrow.gridWidth, narrow.labelW + narrow.dayW * 31 + narrow.totalW);
  const wide = timesheetColumnMetrics(2000, 31);
  assert.ok(wide.dayW > 40);
  assert.ok(wide.gridWidth <= 2000);
  assert.ok(wide.dayW > narrow.dayW);
}

console.log('timesheetProjects.test.mjs: ok');
