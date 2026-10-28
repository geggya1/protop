import assert from 'node:assert/strict';
import { easterSunday, norwegianHolidays, agreedHoursForDate } from './holidays.js';
import { isDateLocked, lockThroughDate } from './locks.js';
import { buildTimesaldo, buildAbsenceOverview, hoursToDays, monthTimebank } from './balance.js';
import { scheduleFromPercent, scheduledHours } from './schedule.js';
import {
  importHolidayYear,
  upsertRedDay,
  toggleTimesheetLock,
  approveTimesheetLock,
  reviseLockedEntry,
  setBalanceAdjustment,
  setAbsenceAdjustment,
} from './timesheetState.js';
import { blockingFindings, reviewTimesheetEntries } from './timesheetReview.js';
import { buildReadyProjects } from '../economy/billingReady.js';
import { emptyProjectState } from '../project/engine.js';

{
  assert.equal(easterSunday(2024).toDateString(), new Date(2024, 2, 31).toDateString());
  assert.equal(easterSunday(2025).toDateString(), new Date(2025, 3, 20).toDateString());
  assert.equal(easterSunday(2026).toDateString(), new Date(2026, 3, 5).toDateString());
  const names = new Map(norwegianHolidays(2026).map((row) => [row.name, row.date]));
  assert.equal(names.get('Skjærtorsdag'), '2026-04-02');
  assert.equal(names.get('Langfredag'), '2026-04-03');
  assert.equal(names.get('Kristi Himmelfartsdag'), '2026-05-14');
  assert.equal(names.get('Offentlig høytidsdag'), '2026-05-01');
  assert.equal(names.get('1. Nyttårsdag'), '2026-01-01');
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
  state = setAbsenceAdjustment(state, {
    employeeId: 'e1', typeId: 'ferie', kind: 'opening', date: '2027-01-01', days: 27,
  }).state;
  assert.equal(state.absenceAdjustments.length, 2);
  const nextYear = buildAbsenceOverview({
    employeeId: 'e1',
    today: '2027-02-01',
    adjustments: state.absenceAdjustments,
    absences: [],
  });
  assert.equal(nextYear.summary.opening, 27);
  assert.equal(nextYear.summary.earned, 27);
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

{
  const agreed = {
    '2026-09-01': 8,
    '2026-10-01': 8,
    '2026-10-02': 8,
    '2026-10-05': 8,
  };
  const bank = monthTimebank({
    year: 2026,
    monthIndex: 9,
    employeeId: 'e1',
    entries: [
      { id: 'a', employeeId: 'e1', date: '2026-09-01', hours: 10 },
      { id: 'a', employeeId: 'e1', date: '2026-09-01', hours: 10 },
      { id: 'b', employeeId: 'e1', date: '2026-10-01', hours: 9.5 },
      { id: 'c', employeeId: 'e2', date: '2026-10-01', hours: 8 },
    ],
    absences: [
      { id: 'v', employeeId: 'e1', date: '2026-10-02', hours: 8, type: 'ferie' },
      { id: 'f', employeeId: 'e1', date: '2026-10-05', hours: 8, type: 'avspasering' },
    ],
    adjustments: [
      { employeeId: 'e1', month: 'opening', hours: 20 },
      { employeeId: 'e1', month: '2026-09', hours: -2 },
      { employeeId: 'e1', month: '2026-10', hours: -1 },
    ],
    agreedForDate: (key) => agreed[key] || 0,
  });
  assert.equal(bank.byDate.get('2026-09-01'), undefined);
  assert.equal(bank.byDate.get('2026-10-01'), 1.5);
  assert.equal(bank.byDate.get('2026-10-02'), 0);
  assert.equal(bank.byDate.get('2026-10-05'), -8);
  assert.equal(bank.incoming, 20);
  assert.equal(bank.outgoing, 12.5);
  assert.equal(bank.adjustment, -1);
}

// DRIFT-13/14: nyansatt fra 1. oktober, i dag er 14. oktober. Timesaldo teller ikke månedene
// før «Ansatt fra», og «Utgående» i timelisten er lik saldoen samme dag (ingen framtidige dager).
{
  const weekday = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6 ? 0 : 7.5;
  };
  const entries = [
    { id: 'x1', employeeId: 'e1', date: '2026-10-01', hours: 7.5 },
    { id: 'x2', employeeId: 'e1', date: '2026-10-02', hours: 8 },
    { id: 'x3', employeeId: 'e1', date: '2026-10-05', hours: 7.5 },
  ];
  const absences = [
    { id: 'v1', employeeId: 'e1', date: '2026-10-06', hours: 7.5, type: 'ferie' },
    { id: 'v2', employeeId: 'e1', date: '2026-10-07', hours: 7.5, type: 'avspasering' },
  ];
  const common = {
    employeeId: 'e1', entries, absences, adjustments: [], agreedForDate: weekday,
    employedFrom: '2026-10-01',
  };
  const saldo = buildTimesaldo({ ...common, year: 2026, throughDate: '2026-10-14' });
  const jan = saldo.rows.find((row) => row.month === '2026-01');
  assert.equal(jan.agreed, 0, 'ingen avtalte timer før ansettelsen');
  assert.equal(jan.flex, 0);
  // 1.–14. oktober: 10 virkedager à 7,5 = 75 avtalt. Registrert: 23 t + ferie 7,5 (dekker avtalen);
  // avspasering dekker ikke. 30,5 − 75 = −44,5.
  assert.equal(saldo.totals.saldo, -44.5);
  const bank = monthTimebank({ ...common, year: 2026, monthIndex: 9, throughDate: '2026-10-14' });
  assert.equal(bank.outgoing, saldo.totals.saldo, '«Utgående» = Timesaldo samme dag');
  assert.equal(bank.byDate.get('2026-10-20'), 0, 'framtidige dager teller ikke ennå');
  // Uten «Ansatt fra» gir januar–september minus (slik testboten fant).
  const before = buildTimesaldo({ ...common, employedFrom: '', year: 2026, throughDate: '2026-10-14' });
  assert.ok(before.totals.saldo < -1000);
  // Avslutningsdato: avtalte timer etter teller ikke.
  const ended = buildTimesaldo({ ...common, employedTo: '2026-10-07', year: 2026, throughDate: '2026-10-14' });
  assert.equal(ended.totals.saldo, roundHoursForTest(30.5 - 5 * 7.5));
}

function roundHoursForTest(value) {
  return Math.round(value * 100) / 100;
}

// Godkjente timer som kan faktureres (Til fakturering).
function approvedForBilling(state) {
  return buildReadyProjects({
    projects: [{ id: 'p', name: 'Prosjekt', client: 'Kunde', pricingSettings: { hourlyRate: 1000 } }],
    timeEntries: state.timeEntries,
    periodEnd: '2026-12-31',
    today: '2026-12-31',
  }).reduce((sum, project) => sum + project.hourGroups.reduce((n, group) => n + group.approvedCount, 0), 0);
}

{
  let state = emptyProjectState();
  state.timeEntries = [
    { id: 'a', employeeId: 'e1', projectId: 'p', date: '2026-10-01', hours: 7.5, description: 'Befaring og proskjektmøte', status: 'registrert' },
    { id: 'b', employeeId: 'e1', projectId: 'p', date: '2026-10-08', hours: 4, description: 'Oppfølging', status: 'registrert' },
  ];
  const locked = toggleTimesheetLock(state, { employeeId: 'e1', throughDate: '2026-10-02' });
  assert.equal(locked.state.timesheetLocks[0].readyForBilling, false);
  assert.equal(approvedForBilling(locked.state), 0);
  const typos = reviewTimesheetEntries(locked.state.timeEntries.filter((row) => row.status === 'låst'));
  assert.ok(blockingFindings(typos).some((row) => row.suggestion.includes('prosjektmøte')));
  const fixed = reviseLockedEntry(locked.state, { entryId: 'a', description: 'Befaring og prosjektmøte' });
  assert.equal(fixed.ok, true);
  assert.equal(blockingFindings(reviewTimesheetEntries([fixed.state.timeEntries[0]])).length, 0);
  const approved = approveTimesheetLock(fixed.state, { employeeId: 'e1', approvedByUid: 'boss' });
  assert.equal(approved.ok, true);
  assert.equal(approved.state.timeEntries.find((row) => row.id === 'a').status, 'godkjent');
  assert.equal(approved.state.timeEntries.find((row) => row.id === 'b').status, 'registrert');
  assert.equal(approved.state.timesheetLocks[0].readyForBilling, true);
  assert.equal(approved.state.timesheetLocks[0].periodFrom, '');
  assert.equal(approved.state.timesheetLocks[0].approvedThrough, '2026-10-02');
  assert.equal(approvedForBilling(approved.state), 1);
  const opened = toggleTimesheetLock(approved.state, { employeeId: 'e1', throughDate: '2026-10-02' });
  assert.equal(lockThroughDate(opened.state.timesheetLocks, 'e1'), '');
  assert.equal(opened.state.timesheetLockArchive[0].throughDate, '2026-10-02');
  // Leder åpner listen igjen: godkjenningen tas bort, så timene kan rettes og godkjennes på nytt (DRIFT-06).
  assert.equal(opened.state.timeEntries.find((row) => row.id === 'a').status, 'registrert');
  assert.equal(approvedForBilling(opened.state), 0);
  assert.match(opened.notice, /Godkjenningen er tatt bort på 1 føring/);
}

console.log('timesheetRules.test.mjs: ok');
