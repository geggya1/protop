import assert from 'node:assert/strict';
import { easterSunday, norwegianHolidays, agreedHoursForDate } from './holidays.js';
import { isDateLocked, lockThroughDate } from './locks.js';
import { buildTimesaldo, buildAbsenceOverview, hoursToDays } from './balance.js';
import { scheduleFromPercent, scheduledHours } from './schedule.js';
import {
  importHolidayYear,
  upsertRedDay,
  toggleTimesheetLock,
  setBalanceAdjustment,
  setAbsenceAdjustment,
} from './timesheetState.js';
import { emptyProjectState } from '../project/engine.js';

{
  assert.equal(easterSunday(2024).toDateString(), new Date(2024, 2, 31).toDateString());
  assert.equal(easterSunday(2025).toDateString(), new Date(2025, 3, 20).toDateString());
  assert.equal(easterSunday(2026).toDateString(), new Date(2026, 3, 5).toDateString());
  const names = new Map(norwegianHolidays(2026).map((row) => [row.name, row.date]));
  assert.equal(names.get('Skjærtorsdag'), '2026-04-02');
  assert.equal(names.get('Langfredag'), '2026-04-03');
  assert.equal(names.get('Kristi himmelfartsdag'), '2026-05-14');
  assert.equal(names.get('1. pinsedag'), '2026-05-24');
  assert.equal(names.get('Grunnlovsdag'), '2026-05-17');
  assert.equal(names.get('1. juledag'), '2026-12-25');
}

{
  const holiday = agreedHoursForDate(new Date(2026, 4, 1), {
    fullDayHours: 8,
    redDays: [{ date: '2026-05-01', kind: 'holiday', portion: 'full', name: 'Arbeidernes dag' }],
    scheduleHours: 8,
  });
  assert.equal(holiday.hours, 0);
  assert.equal(holiday.red, true);
  const half = agreedHoursForDate(new Date(2026, 11, 24), {
    fullDayHours: 8,
    redDays: [{ date: '2026-12-24', kind: 'dayoff', portion: 'half', name: 'Julaften' }],
    scheduleHours: 8,
  });
  assert.equal(half.hours, 4);
  assert.equal(half.half, true);
}

{
  let state = emptyProjectState();
  state = importHolidayYear(state, 2026).state;
  assert.ok(state.redDays.some((row) => row.date === '2026-05-17' && row.kind === 'holiday'));
  const again = importHolidayYear(state, 2026);
  assert.equal(again.state.redDays.filter((row) => row.date === '2026-05-17').length, 1);
  state = upsertRedDay(state, { date: '2026-12-24', name: 'Julaften', portion: 'half', kind: 'dayoff' }).state;
  assert.equal(state.redDays.find((row) => row.date === '2026-12-24').portion, 'half');
}

{
  let state = emptyProjectState();
  state.timeEntries = [
    { id: 'a', employeeId: 'e1', projectId: 'p', date: '2026-10-08', hours: 8, status: 'registrert' },
    { id: 'b', employeeId: 'e1', projectId: 'p', date: '2026-10-13', hours: 4, status: 'registrert' },
  ];
  state.absences = [
    { id: 'f', employeeId: 'e1', date: '2026-10-09', hours: 8, type: 'ferie', status: 'registrert' },
  ];
  const locked = toggleTimesheetLock(state, { employeeId: 'e1', throughDate: '2026-10-09' });
  assert.equal(locked.ok, true);
  assert.equal(lockThroughDate(locked.state.timesheetLocks, 'e1'), '2026-10-09');
  assert.equal(locked.state.timeEntries.find((row) => row.id === 'a').status, 'låst');
  assert.equal(locked.state.timeEntries.find((row) => row.id === 'b').status, 'registrert');
  assert.equal(locked.state.absences[0].status, 'låst');
  assert.equal(isDateLocked('2026-10-09', '2026-10-09'), true);
  assert.equal(isDateLocked('2026-10-09', '2026-10-10'), false);
  const cleared = toggleTimesheetLock(locked.state, { employeeId: 'e1', throughDate: '2026-10-09' });
  assert.equal(lockThroughDate(cleared.state.timesheetLocks, 'e1'), '');
  assert.equal(cleared.state.timeEntries.find((row) => row.id === 'a').status, 'registrert');
}

{
  const saldo = buildTimesaldo({
    year: 2026,
    throughDate: '2026-01-31',
    employeeId: 'e1',
    entries: [{ employeeId: 'e1', date: '2026-01-05', hours: 165, timeType: 'ordinary' }],
    absences: [],
    adjustments: [
      { employeeId: 'e1', month: 'opening', hours: 708 },
      { employeeId: 'e1', month: '2026-01', hours: 1000 },
    ],
    agreedForDate: (key) => (key === '2026-01-05' ? 168 : 0),
  });
  const jan = saldo.rows.find((row) => row.month === '2026-01');
  assert.equal(jan.actual, 165);
  assert.equal(jan.agreed, 168);
  assert.equal(jan.flex, -3);
  assert.equal(jan.adjustment, 1000);
  assert.equal(jan.saldo, 1705);
  assert.equal(saldo.rows[0].saldo, 708);
}

{
  let state = emptyProjectState();
  state = setBalanceAdjustment(state, { employeeId: 'e1', month: '2026-03', hours: -7.5, note: 'Overtid ut i lønn' }).state;
  assert.equal(state.balanceAdjustments[0].hours, -7.5);
  state = setBalanceAdjustment(state, { employeeId: 'e1', month: '2026-03', hours: 0 }).state;
  assert.equal(state.balanceAdjustments.length, 0);
}

{
  assert.equal(hoursToDays(75, 7.5), 10);
  const overview = buildAbsenceOverview({
    employeeId: 'e1',
    typeId: 'ferie',
    fullDayHours: 7.5,
    today: '2026-08-01',
    adjustments: [{ id: 'o', employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2026-01-01', days: 56 }],
    absences: Array.from({ length: 10 }, (_, i) => ({
      id: `a${i}`,
      employeeId: 'e1',
      type: 'ferie',
      date: `2026-07-${String(i + 1).padStart(2, '0')}`,
      hours: 7.5,
    })),
  });
  assert.equal(overview.summary.opening, 56);
  assert.equal(overview.summary.used, 10);
  assert.equal(overview.summary.remaining, 46);
  assert.equal(overview.summary.planned, 0);
  let state = emptyProjectState();
  state = setAbsenceAdjustment(state, {
    employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2026-01-01', days: 25,
  }).state;
  state = setAbsenceAdjustment(state, {
    employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2026-01-01', days: 30,
  }).state;
  assert.equal(state.absenceAdjustments.length, 1);
  assert.equal(state.absenceAdjustments[0].days, 30);
}

{
  const days = scheduleFromPercent(100, 8);
  assert.equal(days.mon.hours, 8);
  assert.equal(days.sat.hours, 0);
  assert.equal(scheduleFromPercent(50, 8).wed.hours, 4);
  const employee = {
    company: { workPercent: '80' },
    extras: { schedules: [{ from: '2016-04-01', days: scheduleFromPercent(100, 8) }] },
  };
  assert.equal(scheduledHours(employee, new Date(2026, 9, 13), 7.5), 8);
  assert.equal(scheduledHours(employee, new Date(2026, 9, 17), 7.5), 0);
  assert.equal(scheduledHours({ company: { workPercent: '50' } }, new Date(2026, 9, 13), 8), 4);
}

console.log('timesheetRules.test.mjs: ok');
