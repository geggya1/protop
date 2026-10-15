import assert from 'node:assert/strict';
import {
  APPLICATION_STAGES,
  activeContractFor,
  currentSalaryFor,
  employeeVisibleSlice,
  emptyHrState,
  formatMoney,
  formatNbDate,
  forEmployee,
  nextOccurrence,
  normalizeApplication,
  normalizeHrState,
  normalizeSalary,
  employeeDraftFromApplication,
  expiringContracts,
  openFollowUps,
  plannedSalariesFor,
  recruitmentFunnel,
  removeRow,
  salarySeriesFor,
  upcomingPeopleEvents,
  upsertRow,
  yearsBetween,
} from './model.js';

{
  const empty = emptyHrState();
  assert.equal(empty.contracts.length, 0);
  assert.equal(empty.jobs.length, 0);
}

{
  const state = normalizeHrState({
    contracts: [{ employeeId: 'e1', title: ' Fast ', status: 'active', startDate: '01.03.2020' }],
    applications: [{ name: 'Ada', stage: 'unknown-stage', score: 15 }],
  });
  assert.equal(state.contracts[0].startDate, '2020-03-01');
  assert.equal(state.contracts[0].title, 'Fast');
  assert.equal(state.applications[0].stage, 'new');
  assert.equal(state.applications[0].score, 10);
}

{
  const list = upsertRow([], { employeeId: 'e1', annualAmount: 700000, effectiveDate: '2024-01-01' }, normalizeSalary);
  assert.equal(list.length, 1);
  const next = upsertRow(list, { ...list[0], annualAmount: 750000 }, normalizeSalary);
  assert.equal(next.length, 1);
  assert.equal(next[0].annualAmount, 750000);
  assert.equal(removeRow(next, next[0].id).length, 0);
}

{
  const from = new Date('2026-03-10T12:00:00Z');
  assert.equal(nextOccurrence('1990-03-15', from), '2026-03-15');
  assert.equal(nextOccurrence('1990-03-01', from), '2027-03-01');
  assert.equal(yearsBetween('2020-03-15', new Date('2026-03-15')), 6);
  assert.equal(yearsBetween('2020-03-15', new Date('2026-03-14')), 5);
}

{
  const employees = [
    {
      id: 'e1',
      person: { firstName: 'Geir', lastName: 'Hansen', birthDate: '1990-10-20' },
      company: { periodFrom: '2018-10-18', status: 'active' },
    },
    {
      id: 'e2',
      person: { firstName: 'Kari', lastName: 'Nord', birthDate: '1985-01-02' },
      company: { periodFrom: '2024-01-01', status: 'active' },
    },
  ];
  const events = upcomingPeopleEvents(employees, {
    withinDays: 20,
    today: new Date('2026-10-15T12:00:00Z'),
  });
  assert.ok(events.some((e) => e.type === 'birthday' && e.employeeId === 'e1'));
  assert.ok(events.some((e) => e.type === 'anniversary' && e.employeeId === 'e1' && e.years === 8));
  assert.ok(!events.some((e) => e.employeeId === 'e2'));
}

{
  const salaries = [
    normalizeSalary({ employeeId: 'e1', kind: 'actual', effectiveDate: '2023-01-01', annualAmount: 600000 }),
    normalizeSalary({ employeeId: 'e1', kind: 'actual', effectiveDate: '2025-01-01', annualAmount: 680000 }),
    normalizeSalary({ employeeId: 'e1', kind: 'planned', effectiveDate: '2027-01-01', annualAmount: 720000 }),
  ];
  assert.equal(currentSalaryFor('e1', salaries, { onDate: '2024-06-01' }).annualAmount, 600000);
  assert.equal(currentSalaryFor('e1', salaries, { onDate: '2026-01-01' }).annualAmount, 680000);
  assert.equal(plannedSalariesFor('e1', salaries).length, 1);
  assert.equal(salarySeriesFor('e1', salaries).length, 2);
  assert.match(formatMoney(680000), /680/);
  assert.equal(formatNbDate('2025-01-01'), '01.01.2025');
}

{
  const contracts = [
    { id: 'c1', employeeId: 'e1', status: 'ended', startDate: '2018-01-01' },
    { id: 'c2', employeeId: 'e1', status: 'active', startDate: '2020-01-01' },
  ];
  assert.equal(activeContractFor('e1', contracts).id, 'c2');
  assert.equal(forEmployee(contracts, 'e1').length, 2);
}

{
  const state = normalizeHrState({
    memos: [
      { employeeId: 'e1', title: 'HR only', employeeVisible: false },
      { employeeId: 'e1', title: 'Synlig', employeeVisible: true, body: 'Hei' },
    ],
    tasks: [
      { employeeId: 'e1', title: 'Gjør dette', employeeVisible: true, status: 'open' },
      { employeeId: 'e2', title: 'Annen', employeeVisible: true },
    ],
    reviews: [{ employeeId: 'e1', summary: 'Bra', employeeVisible: true, status: 'done' }],
    cases: [{ employeeId: 'e1', title: 'Hemmelig', employeeVisible: false, status: 'open' }],
    salaries: [{ employeeId: 'e1', annualAmount: 1, employeeVisible: true, kind: 'actual', effectiveDate: '2024-01-01' }],
    contracts: [{ employeeId: 'e1', status: 'active', startDate: '2020-01-01' }],
  });
  const slice = employeeVisibleSlice(state, 'e1');
  assert.equal(slice.memos.length, 1);
  assert.equal(slice.memos[0].title, 'Synlig');
  assert.equal(slice.tasks.length, 1);
  assert.equal(slice.cases.length, 0);
  assert.equal(slice.reviews.length, 1);
  assert.equal(slice.salaries.length, 1);
  assert.equal(slice.contracts.length, 1);
}

{
  const funnel = recruitmentFunnel([
    normalizeApplication({ stage: 'new' }),
    normalizeApplication({ stage: 'interview' }),
    normalizeApplication({ stage: 'interview' }),
    normalizeApplication({ stage: 'hired' }),
  ]);
  assert.equal(funnel.length, APPLICATION_STAGES.length);
  assert.equal(funnel.find((s) => s.id === 'new').count, 1);
  assert.equal(funnel.find((s) => s.id === 'interview').count, 2);
  assert.equal(funnel.find((s) => s.id === 'hired').count, 1);
}

{
  const open = openFollowUps({
    cases: [
      { status: 'open', dueDate: '2026-12-01' },
      { status: 'open', dueDate: '2026-11-01' },
      { status: 'closed' },
    ],
    tasks: [{ status: 'doing' }, { status: 'done' }],
    reviews: [{ status: 'planned' }, { status: 'done' }],
  });
  assert.equal(open.cases.length, 2);
  assert.equal(open.cases[0].dueDate, '2026-11-01');
  assert.equal(open.tasks.length, 1);
  assert.equal(open.reviews.length, 1);
}

{
  const ending = expiringContracts([
    { id: 'c1', status: 'active', endDate: '2026-11-01', employeeId: 'e1' },
    { id: 'c2', status: 'active', endDate: '2027-06-01', employeeId: 'e2' },
    { id: 'c3', status: 'ended', endDate: '2026-10-20', employeeId: 'e3' },
  ], { withinDays: 45, today: new Date('2026-10-15T12:00:00Z') });
  assert.equal(ending.length, 1);
  assert.equal(ending[0].id, 'c1');
}

{
  const draft = employeeDraftFromApplication(
    { name: 'Ada Lovelace', email: 'ada@example.com', phone: '999', notes: 'Sterk' },
    { title: 'Konsulent' },
  );
  assert.equal(draft.person.firstName, 'Ada');
  assert.equal(draft.person.lastName, 'Lovelace');
  assert.equal(draft.person.email, 'ada@example.com');
  assert.equal(draft.company.title, 'Konsulent');
  assert.match(draft.company.comment, /rekruttering/);
}

console.log('hr/model.test.mjs ok');
