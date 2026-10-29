import assert from 'node:assert/strict';
import {
  addIsoDays,
  approvedVacationRequests,
  buildAnnouncement,
  defaultVacationPlanYear,
  emptyVacationPlan,
  firstWorkingDayBalanceReminder,
  isPlanningEmployee,
  isUpcomingVacationPlanYear,
  monthGrid,
  normalizeVacationPlan,
  openingBalanceYearLabel,
  pendingVacationRequests,
  planSweep,
  planningWindow,
  vacationPlanForYear,
  vacationQuota,
  vacationRequestBalance,
  weekdayKeys,
} from './vacationPlan.js';
import { normalizeAbsenceRow, setAbsenceStatuses } from '../project/engine.js';

const ada = {
  id: 'e1',
  person: { firstName: 'Ada', lastName: 'Nord', birthDate: '1966-04-02', email: 'ada@example.com' },
  company: { status: 'active', personnelKind: 'staff' },
};
const young = {
  id: 'e2',
  person: { firstName: 'Bo', lastName: 'Li', birthDate: '1990-01-01', email: 'bo@example.com' },
  company: { status: 'active' },
};

{
  const plan = normalizeVacationPlan({
    year: 2026,
    ordinaryDays: 25,
    seniorDays: 5,
    seniorAge: 60,
    carryoverMax: 10,
    extraAgreedDays: 2,
    fixedExtras: [
      { id: 'a', label: 'Inneklemte dager i påsken', days: 2 },
      { id: 'b', label: 'Mellom jul og nyttår', from: '2026-12-28', to: '2026-12-30' },
    ],
    grants: { e1: { carryoverDays: 14, senior: null } },
  });
  const quota = vacationQuota(ada, plan, { today: '2026-03-01' });
  assert.equal(quota.senior, true);
  assert.equal(quota.carryover, 10);
  assert.equal(quota.carryoverCapped, true);
  assert.equal(plan.fixedExtras[1].days, 3);
  assert.equal(quota.total, 25 + 5 + 10 + 2 + 3 + 2);
  const youngQuota = vacationQuota(young, plan, { today: '2026-03-01' });
  assert.equal(youngQuota.senior, false);
  assert.equal(youngQuota.total, 25 + 2 + 3 + 2);
}

{
  const unknown = vacationQuota(
    { id: 'e3', person: { firstName: 'C' }, company: { status: 'active' } },
    emptyVacationPlan(2026),
  );
  assert.equal(unknown.senior, false);
  assert.equal(unknown.seniorUnknown, true);
}

{
  const plan = normalizeVacationPlan({
    year: 2026,
    ordinaryDays: 25,
    grants: { e2: { carryoverDays: 4 } },
  });
  const quota = vacationQuota(young, plan, {
    today: '2026-08-01',
    dayHours: 8,
    absences: [
      { employeeId: 'e2', type: 'ferie', date: '2026-07-06', hours: 8 },
      { employeeId: 'e2', type: 'ferie', date: '2026-07-07', hours: 8 },
      { employeeId: 'e2', type: 'ferie', date: '2026-12-14', hours: 8 },
      { employeeId: 'e2', type: 'sykdom', date: '2026-12-15', hours: 8 },
    ],
  });
  assert.equal(quota.taken, 2);
  assert.equal(quota.planned, 1);
  assert.equal(quota.remaining, 25 + 4 - 3);
  assert.equal(quota.main, 2);
}

{
  const plan = { planDeadline: '2026-04-30', announcedAt: '2026-01-02' };
  assert.equal(planningWindow(plan, '2026-04-26').phase, 'open');
  assert.equal(planningWindow(plan, '2026-04-27').phase, 'reminder');
  assert.equal(planningWindow(plan, '2026-04-30').phase, 'reminder');
  assert.equal(planningWindow(plan, '2026-05-01').extensionDue, true);
  const extended = normalizeVacationPlan({ ...plan, extendedDeadline: '2026-05-07' });
  assert.equal(planningWindow(extended, '2026-05-07').locked, false);
  assert.equal(planningWindow(extended, '2026-05-08').phase, 'locked');
  assert.equal(addIsoDays('2026-04-30', 7), '2026-05-07');
  assert.equal(addIsoDays('2026-04-30', -3), '2026-04-27');
}

{
  const plan = normalizeVacationPlan({
    year: 2026,
    ordinaryDays: 10,
    planDeadline: '2026-04-30',
    announcedAt: '2026-01-02',
    seniorEnabled: false,
  });
  const open = planSweep({ plan, employees: [young], absences: [], today: '2026-04-01' });
  assert.equal(open.messages.length, 0);

  const remind = planSweep({ plan, employees: [young], absences: [], today: '2026-04-28' });
  assert.equal(remind.messages.length, 1);
  assert.equal(remind.messages[0].kind, 'reminder');
  assert.equal(remind.plan.notices.e2.reminderAt, '2026-04-28');
  const again = planSweep({ plan: remind.plan, employees: [young], absences: [], today: '2026-04-29' });
  assert.equal(again.messages.length, 0);

  const done = planSweep({
    plan,
    employees: [young],
    today: '2026-04-28',
    dayHours: 8,
    absences: Array.from({ length: 10 }, (_, i) => ({
      employeeId: 'e2',
      type: 'ferie',
      date: `2026-07-${String(i + 6).padStart(2, '0')}`,
      hours: 8,
    })),
  });
  assert.equal(done.messages.length, 0);

  const dunning = planSweep({ plan, employees: [young, ada], absences: [], today: '2026-05-01' });
  assert.equal(dunning.plan.extendedDeadline, '2026-05-07');
  assert.equal(dunning.messages.every((row) => row.kind === 'dunning'), true);
  assert.equal(dunning.messages.length, 2);

  const locked = planSweep({
    plan: dunning.plan,
    employees: [young],
    absences: [],
    today: '2026-05-08',
  });
  assert.equal(locked.messages[0].kind, 'lock');
  assert.match(locked.messages[0].text, /særskilt godkjenning/);
}

{
  const plan = emptyVacationPlan(2026);
  plan.memo = 'Husk hovedferien.';
  plan.planDeadline = '2026-04-30';
  const note = buildAnnouncement({
    companyName: 'CONSULTI AS',
    employee: ada,
    plan: normalizeVacationPlan(plan),
    quota: vacationQuota(ada, plan),
  });
  assert.match(note.subject, /2026/);
  assert.match(note.text, /Ada Nord/);
  assert.match(note.text, /ordinær ferie/);
  assert.match(note.text, /senioruke/);
  assert.match(note.text, /Husk hovedferien/);
  assert.match(note.html, /<li>/);
}

{
  const next = vacationPlanForYear({
    ...emptyVacationPlan(2026),
    planDeadline: '2026-04-30',
    announcedAt: '2026-01-01',
    grants: { e1: { carryoverDays: 3 } },
  }, 2027);
  assert.equal(next.year, 2027);
  assert.equal(next.planDeadline, '');
  assert.equal(next.announcedAt, '');
  assert.equal(next.grants.e1, undefined);
  assert.equal(next.archive['2026'].planDeadline, '2026-04-30');
  const back = vacationPlanForYear(next, 2026);
  assert.equal(back.planDeadline, '2026-04-30');
  assert.equal(back.grants.e1.carryoverDays, 3);
}

{
  const cells = monthGrid(2026, 4);
  assert.equal(cells[0], null);
  assert.equal(cells[2], '2026-04-01');
  assert.equal(weekdayKeys('2026-04-03', '2026-04-06').join(','), '2026-04-03,2026-04-06');
}

{
  const rows = [
    { id: 'a', employeeId: 'e2', type: 'ferie', status: 'registrert', date: '2026-07-06', hours: 8, createdAt: '2026-03-01', extraordinary: true },
    { id: 'b', employeeId: 'e2', type: 'ferie', status: 'registrert', date: '2026-07-07', hours: 8, createdAt: '2026-03-01' },
    { id: 'c', employeeId: 'e2', type: 'ferie', status: 'godkjent', date: '2026-07-08', hours: 8 },
    { id: 'd', employeeId: 'e2', type: 'ferie', status: 'låst', date: '2026-08-03', hours: 8 },
  ];
  const pending = pendingVacationRequests(rows, {
    year: 2026, today: '2026-03-20', approvalDays: 14, names: { e2: 'Bo Li' },
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].days, 2);
  assert.equal(pending[0].due, '2026-03-15');
  assert.equal(pending[0].overdue, true);
  assert.equal(pending[0].extraordinary, true);
  assert.equal(pending[0].employeeName, 'Bo Li');
  const approved = approvedVacationRequests(rows, {
    year: 2026, today: '2026-03-20', approvalDays: 14, names: { e2: 'Bo Li' },
  });
  assert.equal(approved.length, 2);
  assert.equal(approved[0].days, 1);
  assert.equal(approved[1].days, 1);
}

{
  assert.equal(isPlanningEmployee(ada), true);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'inactive' } }), false);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'former' } }), false);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'active', personnelKind: 'external' } }), false);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'active', external: true } }), false);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'active', personnelKind: 'staff' } }), true);
  // Innleid er ikke intern ansatt i ferieplanen, verken som personelltype eller tilgangsnivå.
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'active', personnelKind: 'innleid' } }), false);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'active', employmentType: 'Innleid' } }), false);
  assert.equal(isPlanningEmployee({ id: 'x', company: { status: 'active', accessLevel: 'innleie_ekstern', levelIds: ['innleie_ekstern'] } }), false);
}

// DRIFT-12: i oktober er planåret neste år, men ferie søkt for nov/des i år skal godkjennes.
{
  const rows = [
    { id: 'n1', employeeId: 'e1', type: 'ferie', status: 'registrert', date: '2026-11-02', hours: 7.5, createdAt: '2026-10-20' },
    { id: 'n2', employeeId: 'e1', type: 'ferie', status: 'registrert', date: '2026-11-03', hours: 7.5, createdAt: '2026-10-20' },
    { id: 'j1', employeeId: 'e2', type: 'ferie', status: 'registrert', date: '2027-07-05', hours: 7.5, createdAt: '2026-10-21' },
    { id: 'g1', employeeId: 'e3', type: 'ferie', status: 'godkjent', date: '2026-12-21', hours: 7.5 },
    { id: 'g0', employeeId: 'e3', type: 'ferie', status: 'godkjent', date: '2026-07-01', hours: 7.5 },
    { id: 'old', employeeId: 'e4', type: 'ferie', status: 'registrert', date: '2025-12-29', hours: 7.5 },
  ];
  const opts = { year: 2027, today: '2026-10-28', approvalDays: 14, dayHours: 7.5 };
  const pending = pendingVacationRequests(rows, opts);
  assert.deepEqual(pending.map((row) => row.ids.join('+')).sort(), ['j1', 'n1+n2']);
  const approved = approvedVacationRequests(rows, opts);
  // Det som er godkjent, blir liggende under Godkjent (også ferie som er tatt ut), senest først.
  assert.deepEqual(approved.map((row) => row.ids.join('+')), ['g1', 'g0']);
  // Planåret er inneværende år: bare det året.
  assert.deepEqual(pendingVacationRequests(rows, { ...opts, year: 2026 }).map((row) => row.ids.join('+')), ['n1+n2']);
  // Uten dagens dato: bare planåret, som før.
  assert.deepEqual(pendingVacationRequests(rows, { ...opts, today: '' }).map((row) => row.ids.join('+')), ['j1']);
}

{
  assert.equal(defaultVacationPlanYear(new Date('2026-09-15T12:00:00+02:00')), 2026);
  assert.equal(defaultVacationPlanYear(new Date('2026-10-01T12:00:00+02:00')), 2027);
  assert.equal(isUpcomingVacationPlanYear(2027, '2026-10-20'), true);
  assert.equal(isUpcomingVacationPlanYear(2026, '2026-10-20'), false);
  assert.match(openingBalanceYearLabel(2027, '2026-10-20'), /Inngående feriedagssaldo til 2027/);
  assert.match(openingBalanceYearLabel(2026, '2026-03-01'), /Inngående feriedagssaldo for 2026/);
  assert.match(firstWorkingDayBalanceReminder(2027), /første virkedag i 2027/);
  assert.match(firstWorkingDayBalanceReminder(2027), /start fraværssaldo/);
}

// Godkjenning: dato og godkjenner lagres på raden, følger med i Godkjent og fjernes ved angring.
{
  const state = {
    absences: [
      { id: 'p1', employeeId: 'e1', type: 'ferie', status: 'registrert', date: '2026-11-16', hours: 7.5 },
      { id: 'p2', employeeId: 'e1', type: 'ferie', status: 'registrert', date: '2026-11-17', hours: 7.5 },
      { id: 'p3', employeeId: 'e2', type: 'ferie', status: 'godkjent', date: '2026-12-01', hours: 7.5, approvedAt: '2026-10-01T08:00:00.000Z', approvedByName: 'Eva' },
    ],
  };
  const done = setAbsenceStatuses(state, ['p1', 'p2'], 'godkjent', { uid: 'u-hr', name: 'Hanne HR' });
  assert.equal(done.ok, true);
  const row = done.state.absences.find((item) => item.id === 'p1');
  assert.equal(row.status, 'godkjent');
  assert.equal(row.approvedByUid, 'u-hr');
  assert.equal(row.approvedByName, 'Hanne HR');
  assert.match(row.approvedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(normalizeAbsenceRow(row).approvedByName, 'Hanne HR', 'lagres med raden');
  const approved = approvedVacationRequests(done.state.absences, { year: 2027, today: '2026-10-29', dayHours: 7.5, names: { e1: 'Ada Nord' } });
  assert.deepEqual(approved.map((item) => item.ids.join('+')), ['p1+p2', 'p3'], 'sist godkjent først');
  assert.equal(approved[0].approvedByName, 'Hanne HR');
  assert.equal(approved[0].days, 2);
  assert.equal(approved[1].approvedByName, 'Eva');
  // Godkjent på nytt beholder første godkjenning.
  const again = setAbsenceStatuses(done.state, ['p1'], 'godkjent', { uid: 'u-2', name: 'Noen andre' });
  assert.equal(again.state.absences.find((item) => item.id === 'p1').approvedByName, 'Hanne HR');
  const back = setAbsenceStatuses(done.state, ['p1', 'p2'], 'registrert');
  const reopened = back.state.absences.find((item) => item.id === 'p1');
  assert.equal(reopened.status, 'registrert');
  assert.equal(reopened.approvedAt, undefined);
  assert.equal(reopened.approvedByName, undefined);
  // Gamle felt i skyen følger ikke med når raden ikke er godkjent.
  assert.equal(normalizeAbsenceRow({ ...row, status: 'registrert' }).approvedAt, undefined);
}

// Saldo per søknad: hva personen har igjen før og etter, i søknadens år.
{
  const plan = normalizeVacationPlan({ year: 2027, ordinaryDays: 25, seniorEnabled: false, extraAgreedDays: 0 });
  const absences = [
    ...weekdayKeys('2026-07-06', '2026-07-31').map((date, index) => ({ id: `s${index}`, employeeId: 'e2', type: 'ferie', status: 'godkjent', date, hours: 7.5 })),
    ...weekdayKeys('2026-11-16', '2026-11-20').map((date, index) => ({ id: `n${index}`, employeeId: 'e2', type: 'ferie', status: 'registrert', date, hours: 7.5 })),
  ];
  const request = pendingVacationRequests(absences, { year: 2027, today: '2026-10-29', dayHours: 7.5 })[0];
  assert.equal(request.days, 5);
  const balance = vacationRequestBalance(young, plan, request, { absences, today: '2026-10-29', dayHours: 7.5 });
  assert.equal(balance.year, 2026);
  assert.equal(balance.total, 25);
  assert.equal(balance.before, 5);
  assert.equal(balance.after, 0);
  assert.equal(balance.over, false);
  const more = [...absences, { id: 'x', employeeId: 'e2', type: 'ferie', status: 'registrert', date: '2026-11-23', hours: 7.5 }];
  const longer = pendingVacationRequests(more, { year: 2027, today: '2026-10-29', dayHours: 7.5 })[0];
  const over = vacationRequestBalance(young, plan, longer, { absences: more, today: '2026-10-29', dayHours: 7.5 });
  assert.equal(over.after, -1);
  assert.equal(over.over, true);
  // Innleide og eksterne er utenfor ferieplanen.
  assert.equal(vacationRequestBalance({ id: 'x', company: { status: 'active', personnelKind: 'innleid' } }, plan, request), null);
}

console.log('vacationPlan.test.mjs: ok');
