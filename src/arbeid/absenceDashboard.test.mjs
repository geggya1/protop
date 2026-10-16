import assert from 'node:assert/strict';
import {
  ABSENCE_DAY_HOURS,
  STATUTORY_VACATION_DAYS,
  absenceRoster,
  absenceYears,
  buildAbsenceDashboard,
  buildAbsencePeriodGrid,
  buildAbsenceWebBoard,
  summarizeAbsenceSpan,
  buildCompanyAbsenceLedger,
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

{
  const dash = buildAbsenceDashboard({
    employees,
    employeeId: '',
    category: 'ferie',
    today: '2026-10-13',
    fullDayHours: 7.5,
    absences: [
      { id: 'f1', employeeId: 'e1', type: 'ferie', date: '2026-05-04', hours: 7.5 },
      { id: 'f2', employeeId: 'e1', type: 'ferie', date: '2026-07-06', hours: 7.5 },
      { id: 's1', employeeId: 'e2', type: 'syk_melding', date: '2026-10-13', hours: 7.5 },
      { id: 's2', employeeId: 'e1', type: 'egenmelding', date: '2026-08-03', hours: 7.5 },
      { id: 'p1', employeeId: 'e2', type: 'foreldre', date: '2026-09-14', hours: 7.5 },
      { id: 'o1', employeeId: 'e1', type: 'annet', date: '2026-06-02', hours: 7.5 },
      { id: 'old', employeeId: 'e1', type: 'ferie', date: '2026-01-05', hours: 7.5 },
    ],
  });
  assert.deepEqual(dash.recentMonths.map((month) => month.label), ['Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt']);
  assert.equal(dash.recentMonths.find((month) => month.label === 'Jul').ferie, 1);
  assert.equal(dash.recentMonths.find((month) => month.label === 'Okt').sykdom, 1);
  assert.equal(dash.recentMonths.find((month) => month.label === 'Jun').annet, 1);
  assert.equal(dash.recentMonths.some((month) => month.label === 'Jan'), false);
  assert.equal(dash.allowance, 50);
  assert.equal(dash.summary.used, 3);
  assert.equal(dash.sickNow, 1);
  assert.equal(dash.hasQuota, true);
  assert.equal(dash.focusTitle, 'Ferie');
  assert.equal(dash.year, '2026');
}

{
  const sick = buildAbsenceDashboard({
    employees,
    category: 'sykdom',
    today: '2026-10-13',
    fullDayHours: 7.5,
    absences: [
      { id: 's1', employeeId: 'e1', type: 'syk_melding', date: '2026-10-01', hours: 7.5 },
      { id: 's2', employeeId: 'e1', type: 'egenmelding', date: '2026-10-02', hours: 7.5 },
      { id: 'f1', employeeId: 'e1', type: 'ferie', date: '2026-07-06', hours: 7.5 },
    ],
  });
  assert.equal(sick.summary.used, 2);
  assert.equal(sick.focusTitle, 'Sykdom');
  assert.equal(sick.hasQuota, false);
  assert.equal(sick.recentMonths.find((month) => month.label === 'Jul').ferie, 1);
}

{
  const leave = buildAbsenceDashboard({
    employees,
    category: 'permisjon',
    today: '2026-10-13',
    fullDayHours: 7.5,
    absences: [
      { id: 'p1', employeeId: 'e1', type: 'foreldre', date: '2026-09-01', hours: 7.5 },
      { id: 'p2', employeeId: 'e1', type: 'permisjon', date: '2026-09-02', hours: 7.5 },
      { id: 'f1', employeeId: 'e1', type: 'ferie', date: '2026-09-03', hours: 7.5 },
    ],
  });
  assert.equal(leave.summary.used, 2);
  assert.equal(leave.focusTitle, 'Permisjon');
  assert.equal(leave.periods.every((row) => row.type !== 'ferie'), true);
}

{
  const windowed = buildAbsenceDashboard({
    employees: [{ id: 'e1', company: { status: 'active' } }],
    employeeId: 'e1',
    category: 'ferie',
    today: '2026-03-01',
    absences: [{ id: 'd1', employeeId: 'e1', type: 'ferie', date: '2025-12-14', hours: 7.5 }],
  });
  assert.deepEqual(windowed.recentMonths.map((month) => month.label), ['Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar']);
  assert.equal(windowed.recentMonths.find((month) => month.key === '2025-12').ferie, 1);
  assert.equal(windowed.recentMonths.find((month) => month.key === '2026-01').ferie, 0);
}

{
  const ledger = buildCompanyAbsenceLedger({
    employees,
    today: '2026-10-13',
    fullDayHours: 7.5,
    names: { e1: 'Ada', e2: 'Bo' },
    adjustments: [{ id: 'o', employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2026-01-01', days: 10 }],
    absences: [
      { id: 'a1', employeeId: 'e1', type: 'ferie', date: '2026-07-06', hours: 7.5 },
      { id: 's1', employeeId: 'e2', type: 'syk_melding', date: '2026-10-13', hours: 7.5 },
    ],
  });
  assert.equal(ledger.summary.earned, 10);
  assert.equal(ledger.summary.used, 1);
  assert.equal(ledger.summary.remaining, 9);
  assert.equal(ledger.rows.some((row) => row.employeeName === 'Ada' && row.kind === 'absence'), true);
  assert.equal(ledger.rows.some((row) => row.employeeName === 'Bo'), false);
  assert.equal(ledger.summary.earned === employees.length * STATUTORY_VACATION_DAYS, false);
}

{
  const board = buildAbsenceWebBoard({
    employees: [
      ...employees,
      { id: 'e3', company: { status: 'active' } },
    ],
    today: '2026-10-14',
    fullDayHours: 7.5,
    names: { e1: 'Ada Nord', e2: 'Bo Berg', e3: 'Cato' },
    adjustments: [{ id: 'o', employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2026-01-02', days: 21 }],
    absences: [
      { id: 'a1', employeeId: 'e1', type: 'ferie', date: '2026-07-06', hours: 7.5 },
      { id: 'a2', employeeId: 'e1', type: 'ferie', date: '2026-07-07', hours: 7.5 },
      { id: 'a3', employeeId: 'e1', type: 'ferie', date: '2026-07-08', hours: 7.5 },
      { id: 's1', employeeId: 'e2', type: 'syk_melding', date: '2026-10-14', hours: 7.5 },
    ],
  });
  const ada = board.staff.find((row) => row.name === 'Ada Nord');
  const bo = board.staff.find((row) => row.name === 'Bo Berg');
  assert.equal(board.staff.some((row) => row.name === 'Cato'), false);
  assert.equal(ada.months[6].ferie, 3);
  assert.equal(ada.earned, 21);
  assert.equal(ada.remaining, 18);
  assert.equal(ada.vacationUsed, 3);
  assert.equal(bo.months[9].sykdom, 1);
  assert.equal(bo.earned, 0);
  assert.equal(board.lines.length, 2);
  assert.equal(board.dash.summary.earned, 21);
  assert.equal(board.dash.summary.used, 3);
  assert.equal(board.dash.sickNow, 1);
  assert.equal(board.planned.length, 0);
}

{
  const board = buildAbsenceWebBoard({
    employees,
    today: '2026-10-14',
    fullDayHours: 7.5,
    names: { e1: 'Ada Nord' },
    absences: [
      { id: 'now', employeeId: 'e1', type: 'ferie', date: '2026-10-14', hours: 7.5 },
      { id: 'tail', employeeId: 'e1', type: 'ferie', date: '2026-10-15', hours: 7.5 },
      { id: 'dec', employeeId: 'e1', type: 'ferie', date: '2026-12-14', hours: 7.5 },
      { id: 'next', employeeId: 'e1', type: 'ferie', date: '2027-01-04', hours: 7.5 },
    ],
  });
  assert.equal(board.staff.find((row) => row.name === 'Ada Nord').vacationUsed, 3);
  assert.deepEqual(board.planned.map((row) => row.start), ['2026-12-14', '2027-01-04']);
  assert.equal(board.planned.every((row) => row.status === 'planlagt'), true);
  assert.equal(board.planned.some((row) => row.start === '2026-10-15'), false);
  assert.equal(board.lines.find((row) => row.start === '2026-10-14').status, 'pagar');
  assert.equal(board.lines.some((row) => row.start === '2027-01-04'), false);
  assert.equal(board.yearTotals.ferie, 3);
}

{
  const board = buildAbsenceWebBoard({
    employees,
    today: '2026-10-14',
    names: { e1: 'Ada Nord' },
    absences: [{ id: 'old', employeeId: 'e1', type: 'ferie', date: '2024-07-01', hours: 7.5 }],
  });
  assert.equal(board.staff.length, 0);
  assert.equal(board.yearTotals.ferie, 0);
}

{
  const roster = [
    { id: 'own', company: { status: 'active', personnelKind: 'staff' } },
    { id: 'ext', company: { status: 'active', personnelKind: 'external' } },
    { id: 'hire', company: { status: 'active', personnelKind: 'innleid' } },
    { id: 'off', company: { status: 'inactive', personnelKind: 'staff' } },
    { id: 'old', company: { status: 'former', personnelKind: 'staff' } },
    { id: 'bin', company: { status: 'deleted', personnelKind: 'staff' } },
  ];
  assert.deepEqual(absenceRoster(roster).map((row) => row.id), ['own']);
  assert.deepEqual(absenceRoster(roster, { kinds: ['external', 'innleid'] }).map((row) => row.id), ['ext', 'hire']);
  assert.deepEqual(
    absenceRoster(roster, { kinds: ['staff'], includeInactive: true }).map((row) => row.id),
    ['own', 'off', 'old'],
  );
}

{
  const grid = buildAbsencePeriodGrid({
    employees: [
      { id: 'e1' },
      { id: 'e2' },
    ],
    names: { e1: 'Ada Nord', e2: 'Bo Berg' },
    start: '2026-10-12',
    end: '2026-10-18',
    fullDayHours: 7.5,
    absences: [
      { id: 'a1', employeeId: 'e1', type: 'ferie', date: '2026-10-14', hours: 7.5 },
      { id: 'a2', employeeId: 'e1', type: 'ferie', date: '2026-10-15', hours: 7.5 },
      { id: 's1', employeeId: 'e2', type: 'syk_melding', date: '2026-10-14', hours: 7.5 },
      { id: 'out', employeeId: 'e9', type: 'ferie', date: '2026-10-14', hours: 7.5 },
    ],
  });
  assert.equal(grid.days.length, 7);
  assert.equal(grid.days[0].key, '2026-10-12');
  assert.deepEqual(grid.people.map((row) => row.id), ['e1', 'e2']);
  assert.equal(grid.people[0].awayDays, 2);
  assert.equal(grid.people[0].cells[2].bucket, 'ferie');
  assert.equal(grid.totals[2].ferie, 1);
  assert.equal(grid.totals[2].sykdom, 1);
  assert.equal(grid.totals[0].ferie, 0);
}

{
  const mixed = [
    { id: 'own', company: { status: 'active', personnelKind: 'staff' } },
    { id: 'ext', company: { status: 'active', personnelKind: 'external' } },
    { id: 'off', company: { status: 'inactive', personnelKind: 'staff' } },
  ];
  const roster = absenceRoster(mixed);
  const dash = buildAbsenceDashboard({
    employees: roster,
    today: '2026-10-14',
    fullDayHours: ABSENCE_DAY_HOURS,
    absences: [
      { id: 'a1', employeeId: 'own', type: 'ferie', date: '2026-06-01', hours: 8 },
      { id: 'a2', employeeId: 'own', type: 'ferie', date: '2026-06-02', hours: 4 },
      { id: 'a3', employeeId: 'ext', type: 'ferie', date: '2026-06-03', hours: 8 },
      { id: 'a4', employeeId: 'off', type: 'ferie', date: '2026-06-04', hours: 8 },
    ],
  });
  const span = summarizeAbsenceSpan({
    employeeIds: ['e1', 'e2'],
    names: { e1: 'Ada', e2: 'Bo' },
    today: '2026-10-16',
    fullDayHours: 7.5,
    start: '2026-10-16',
    end: '2026-10-16',
    absences: [
      { id: 'today', employeeId: 'e1', type: 'ferie', date: '2026-10-16', hours: 7.5 },
      { id: 'later', employeeId: 'e2', type: 'syk_melding', date: '2026-10-20', hours: 7.5 },
      { id: 'week', employeeId: 'e1', type: 'egenmelding', date: '2026-10-14', hours: 7.5 },
    ],
  });
  assert.equal(span.ferie, 1);
  assert.equal(span.sykdom, 0);
  assert.equal(span.away.length, 1);
  assert.equal(span.planned.length, 0);
  const week = summarizeAbsenceSpan({
    employeeIds: ['e1', 'e2'],
    names: { e1: 'Ada', e2: 'Bo' },
    today: '2026-10-16',
    fullDayHours: 7.5,
    start: '2026-10-12',
    end: '2026-10-18',
    absences: [
      { id: 'today', employeeId: 'e1', type: 'ferie', date: '2026-10-16', hours: 7.5 },
      { id: 'later', employeeId: 'e2', type: 'syk_melding', date: '2026-10-20', hours: 7.5 },
      { id: 'week', employeeId: 'e1', type: 'egenmelding', date: '2026-10-14', hours: 7.5 },
    ],
  });
  assert.equal(week.ferie, 1);
  assert.equal(week.sykdom, 1);
  assert.equal(week.away.length, 2);
  assert.equal(week.planned.map((row) => row.start).includes('2026-10-20'), false);
  const future = summarizeAbsenceSpan({
    employeeIds: ['e2'],
    names: { e2: 'Bo' },
    today: '2026-10-16',
    start: '2026-10-19',
    end: '2026-10-25',
    absences: [
      { id: 'later', employeeId: 'e2', type: 'syk_melding', date: '2026-10-20', hours: 7.5 },
    ],
  });
  assert.equal(future.planned.length, 1);
  assert.equal(future.sykdom, 1);

  assert.deepEqual(absenceYears([
    { employeeId: 'own', date: '14.07.2024', hours: 8, type: 'ferie' },
    { employeeId: 'own', date: '2023-01-02', hours: 8, type: 'ferie' },
  ], roster), ['2023', '2024']);
  const linked = buildAbsenceWebBoard({
    employees: [{
      id: 'own',
      person: { firstName: 'Ada', lastName: 'Nord' },
      company: { status: 'active', personnelKind: 'staff', externalEmployeeNumber: '12' },
    }],
    today: '2026-10-16',
    fullDayHours: 8,
    names: { own: 'Ada Nord' },
    year: '2024',
    absences: [{
      id: 'old-id',
      employeeId: 'moment-99',
      employeeName: 'Ada Nord',
      employeeNumber: '12',
      type: 'ferie',
      date: '01.07.2024',
      hours: 8,
    }],
  });
  assert.equal(linked.staff.length, 1);
  assert.equal(linked.yearTotals.ferie, 1);
  assert.equal(linked.lines[0].start, '2024-07-01');
  assert.equal(ABSENCE_DAY_HOURS, 8);
  assert.equal(dash.headcount, 1);
  assert.equal(dash.summary.used, 1.5);
}

console.log('absenceDashboard ok');
