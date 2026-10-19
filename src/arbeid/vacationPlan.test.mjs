import assert from 'node:assert/strict';
import {
  addIsoDays,
  buildAnnouncement,
  emptyVacationPlan,
  monthGrid,
  normalizeVacationPlan,
  pendingVacationRequests,
  planSweep,
  planningWindow,
  vacationPlanForYear,
  vacationQuota,
  weekdayKeys,
} from './vacationPlan.js';

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
  const pending = pendingVacationRequests([
    { id: 'a', employeeId: 'e2', type: 'ferie', status: 'registrert', date: '2026-07-06', hours: 8, createdAt: '2026-03-01', extraordinary: true },
    { id: 'b', employeeId: 'e2', type: 'ferie', status: 'registrert', date: '2026-07-07', hours: 8, createdAt: '2026-03-01' },
    { id: 'c', employeeId: 'e2', type: 'ferie', status: 'godkjent', date: '2026-07-08', hours: 8 },
  ], { year: 2026, today: '2026-03-20', approvalDays: 14, names: { e2: 'Bo Li' } });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].days, 2);
  assert.equal(pending[0].due, '2026-03-15');
  assert.equal(pending[0].overdue, true);
  assert.equal(pending[0].extraordinary, true);
  assert.equal(pending[0].employeeName, 'Bo Li');
}

console.log('vacationPlan.test.mjs: ok');
