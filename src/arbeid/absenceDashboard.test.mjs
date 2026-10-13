import assert from 'node:assert/strict';
import {
  STATUTORY_VACATION_DAYS,
  buildAbsenceDashboard,
  eachWeekday,
  groupAbsencePeriods,
} from './absenceDashboard.js';

const employees = [
  { id: 'e1', company: { status: 'active' } },
  { id: 'e2', company: { status: 'active' } },
  { id: 'gone', company: { status: 'deleted' } },
];

{
  const dash = buildAbsenceDashboard({
    employees,
    employeeId: 'e1',
    today: '2026-10-13',
    absences: [],
    adjustments: [],
  });
  assert.equal(dash.allowance, STATUTORY_VACATION_DAYS);
  assert.equal(dash.summary.used, 0);
  assert.equal(dash.summary.earned, 0);
  assert.equal(dash.summary.remaining, 0);
  assert.equal(dash.hasRows, false);
  assert.equal(dash.headcount, 2);
  assert.equal(dash.chartHasData, false);
}

{
  const dash = buildAbsenceDashboard({
    employees,
    employeeId: 'e1',
    today: '2026-10-13',
    fullDayHours: 7.5,
    adjustments: [{ id: 'o', employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2026-01-01', days: 25 }],
    absences: [
      { id: 'a1', employeeId: 'e1', type: 'ferie', date: '2026-07-06', hours: 7.5 },
      { id: 'a2', employeeId: 'e1', type: 'ferie', date: '2026-07-07', hours: 7.5 },
      { id: 'a3', employeeId: 'e1', type: 'ferie', date: '2026-07-08', hours: 7.5 },
      { id: 'a4', employeeId: 'e1', type: 'ferie', date: '2026-07-09', hours: 7.5 },
      { id: 'a5', employeeId: 'e1', type: 'ferie', date: '2026-07-10', hours: 7.5 },
      { id: 's1', employeeId: 'e1', type: 'syk_melding', date: '2026-10-13', hours: 7.5 },
      { id: 'o1', employeeId: 'e1', type: 'annet', date: '2026-03-02', hours: 7.5 },
      { id: 'x1', employeeId: 'gone', type: 'ferie', date: '2026-10-13', hours: 7.5 },
    ],
    names: { e1: 'Ada' },
  });
  assert.equal(dash.summary.used, 5);
  assert.equal(dash.summary.remaining, 20);
  assert.equal(dash.allowance, 25);
  assert.equal(dash.sickNow, 1);
  assert.equal(dash.onVacation, 0);
  assert.equal(dash.otherNow, 0);
  const july = dash.months.find((month) => month.label === 'Jul');
  const march = dash.months.find((month) => month.label === 'Mar');
  assert.equal(july.ferie, 5);
  assert.equal(march.annet, 1);
  assert.equal(dash.periods[0].employeeName, 'Ada');
  assert.equal(dash.periods.find((row) => row.type === 'ferie').rangeLabel.includes('–'), true);
  assert.equal(dash.periods.find((row) => row.type === 'ferie').days, 5);
}

{
  const periods = groupAbsencePeriods([
    { id: '1', employeeId: 'e1', type: 'ferie', date: '2026-07-03', hours: 7.5 },
    { id: '2', employeeId: 'e1', type: 'ferie', date: '2026-07-06', hours: 7.5 },
    { id: '3', employeeId: 'e1', type: 'ferie', date: '2026-07-07', hours: 7.5 },
  ], '2026-07-06');
  assert.equal(periods.length, 1);
  assert.equal(periods[0].start, '2026-07-03');
  assert.equal(periods[0].end, '2026-07-07');
  assert.equal(periods[0].status, 'pagar');
}

{
  const future = groupAbsencePeriods([
    { id: '1', employeeId: 'e1', type: 'ferie', date: '2026-12-01', hours: 7.5 },
  ], '2026-10-13');
  assert.equal(future[0].status, 'planlagt');
  const past = groupAbsencePeriods([
    { id: '1', employeeId: 'e1', type: 'ferie', date: '2026-01-02', hours: 7.5 },
  ], '2026-10-13');
  assert.equal(past[0].status, 'avsluttet');
}

{
  const all = buildAbsenceDashboard({
    employees,
    employeeId: '',
    today: '2026-06-01',
    absences: [
      { id: '1', employeeId: 'e1', type: 'ferie', date: '2026-06-01', hours: 7.5 },
      { id: '2', employeeId: 'e2', type: 'annet_uten', date: '2026-06-01', hours: 7.5 },
    ],
  });
  assert.equal(all.allowance, 50);
  assert.equal(all.onVacation, 1);
  assert.equal(all.otherNow, 1);
  assert.equal(all.headcount, 2);
}

{
  const days = eachWeekday('2026-07-03', '2026-07-07');
  assert.deepEqual(days, ['2026-07-03', '2026-07-06', '2026-07-07']);
  assert.deepEqual(eachWeekday('2026-07-07', '2026-07-03'), []);
}

{
  const dash = buildAbsenceDashboard({
    employees: [{ id: 'e1', company: { status: 'active' } }],
    employeeId: 'e1',
    today: '2026-03-01',
    absences: [{ id: 'd1', employeeId: 'e1', type: 'ferie', date: '2026-12-14', hours: 7.5 }],
  });
  assert.equal(dash.months.at(-1).label, 'Des');
  assert.equal(dash.months.at(-1).ferie, 1);
}

console.log('absenceDashboard ok');
