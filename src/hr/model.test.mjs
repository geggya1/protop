import assert from 'node:assert/strict';
import {
  APPLICATION_BOARD,
  applicationsByBoard,
  compareReviews,
  daysUntil,
  caseFromExpiringContract,
  caseFromPeopleEvent,
  employeeDraftFromApplication,
  employeeVisibleSlice,
  emptyHrState,
  countHrEmployees,
  expiringContracts,
  filterHrEmployees,
  formatMoney,
  formatNbDate,
  hasOpenCaseLike,
  nextOccurrence,
  hrStateHasData,
  moveApplicationBoard,
  normalizeApplication,
  normalizeContract,
  normalizeHrState,
  normalizeSalary,
  onboardingTasksFor,
  openFollowUps,
  recruitmentFunnel,
  salarySeriesWithPercents,
  upcomingPeopleEvents,
  upsertActiveContract,
  upsertRow,
  yearsBetween,
} from './model.js';

{
  const empty = emptyHrState();
  assert.equal(empty.compliance.length, 0);
  assert.equal(empty.version, 2);
}

{
  const contract = normalizeContract({
    employeeId: 'e1',
    employerName: 'AS',
    employeeName: 'Ada',
    workplace: 'Oslo',
    title: 'Arbeidsavtale',
    positionTitle: 'Konsulent',
    startDate: '01.03.2020',
    workPercent: '100',
    salaryAmount: '700000',
    workHours: '37,5',
    noticePeriod: '3 måneder',
  });
  assert.equal(contract.startDate, '2020-03-01');
  assert.equal(contract.title, 'Arbeidsavtale');
  assert.equal(contract.positionTitle, 'Konsulent');
  assert.equal(contract.aml.filled, 9);
  assert.equal(contract.aml.pct, 100);
}

{
  // v1 stage → board migration
  const hired = normalizeApplication({ name: 'Bo', stage: 'hired' });
  assert.equal(hired.board, 'completed');
  assert.equal(hired.outcome, 'hired');
  const neu = normalizeApplication({ name: 'Ny', stage: 'new' });
  assert.equal(neu.board, 'received');
  const moved = moveApplicationBoard(neu, 'processing');
  assert.equal(moved.board, 'processing');
  assert.equal(moved.outcome, 'pending');
  const awaiting = moveApplicationBoard(moved, 'completed');
  assert.equal(awaiting.board, 'completed');
  assert.equal(awaiting.outcome, 'pending');
  const won = moveApplicationBoard(moved, 'completed', 'hired');
  assert.equal(won.outcome, 'hired');
  assert.equal(won.stage, 'hired');
  const lost = moveApplicationBoard(awaiting, 'completed', 'rejected');
  assert.equal(lost.outcome, 'rejected');
}

{
  const apps = [
    normalizeApplication({ name: 'A', board: 'received' }),
    normalizeApplication({ name: 'B', board: 'processing' }),
    normalizeApplication({ name: 'C', board: 'completed', outcome: 'hired' }),
  ];
  const buckets = applicationsByBoard(apps);
  assert.equal(buckets.received.length, 1);
  assert.equal(buckets.processing.length, 1);
  assert.equal(buckets.completed.length, 1);
  assert.equal(APPLICATION_BOARD.length, 3);
  const funnel = recruitmentFunnel(apps);
  assert.equal(funnel.board.find((b) => b.id === 'received').count, 1);
  assert.equal(funnel.outcomes.find((o) => o.id === 'hired').count, 1);
}

{
  const from = new Date('2026-10-15T12:00:00Z');
  const events = upcomingPeopleEvents([
    {
      id: 'e1',
      person: { firstName: 'Geir', lastName: 'H', birthDate: '1990-10-20' },
      company: { periodFrom: '2018-10-18', status: 'active' },
    },
  ], { withinDays: 20, today: from });
  const birthday = events.find((e) => e.type === 'birthday');
  assert.equal(birthday.date, '2026-10-20');
  assert.equal(birthday.days, 5);
  assert.ok(events.some((e) => e.type === 'anniversary' && e.years === 8));
  assert.equal(daysUntil('2026-10-20', from), 5);
  assert.equal(yearsBetween('2020-03-15', '2026-03-15'), 6);
  // Kalenderdato skal ikke flyttes én dag (lokal midnatt → UTC).
  const osloNoon = new Date(2026, 9, 16, 12, 0, 0);
  assert.equal(nextOccurrence('1987-12-29', osloNoon), '2026-12-29');
  assert.equal(daysUntil('2026-12-29', osloNoon), 74);
  assert.equal(formatNbDate('2026-12-29'), '29.12.2026');
}

{
  const counts = countHrEmployees([
    { company: { status: 'active' } },
    { company: { status: 'leave' } },
    { company: { status: 'inactive' } },
    { company: { status: 'former' } },
    { company: { status: 'deleted' } },
  ]);
  assert.equal(counts.active, 2);
  assert.equal(counts.inactive, 2);
  assert.equal(filterHrEmployees([
    { id: 'a', company: { status: 'active' } },
    { id: 'b', company: { status: 'inactive' } },
  ], 'inactive').length, 1);
}

{
  const salaries = [
    normalizeSalary({ employeeId: 'e1', kind: 'actual', effectiveDate: '2023-01-01', annualAmount: 600000 }),
    normalizeSalary({ employeeId: 'e1', kind: 'actual', effectiveDate: '2025-01-01', annualAmount: 660000 }),
    normalizeSalary({ employeeId: 'e1', kind: 'planned', effectiveDate: '2027-01-01', annualAmount: 700000, previousAmount: 660000 }),
  ];
  const series = salarySeriesWithPercents('e1', salaries);
  assert.equal(series.length, 2);
  assert.equal(series[1].changePercent, 10);
  assert.match(formatMoney(660000), /660/);
  assert.equal(formatNbDate('2025-01-01'), '01.01.2025');
  assert.equal(salaries[2].changePercent, Math.round((40000 / 660000) * 1000) / 10);

  // Lagret prosent vinner når mellomliggende rad er skjult for ansatt.
  const visibleOnly = salarySeriesWithPercents('e1', [
    normalizeSalary({
      employeeId: 'e1', kind: 'actual', effectiveDate: '2023-01-01',
      annualAmount: 500000, changePercent: null,
    }),
    normalizeSalary({
      employeeId: 'e1', kind: 'actual', effectiveDate: '2025-01-01',
      annualAmount: 600000, previousAmount: 550000, changePercent: 9.1,
    }),
  ]);
  assert.equal(visibleOnly[1].changePercent, 9.1);
}

{
  // Ny avtale uten id skal ikke gjenbruke forrige aktive id.
  const first = upsertActiveContract([], {
    id: 'c1', employeeId: 'e1', title: 'Gammel', startDate: '2024-01-01',
  });
  const fresh = normalizeContract({
    employeeId: 'e1', title: 'Ny', startDate: '2025-06-01',
  });
  assert.ok(!fresh.id || fresh.id !== 'c1');
  const next = upsertActiveContract(first, fresh);
  assert.equal(next.filter((c) => c.status === 'active').length, 1);
  assert.equal(next.find((c) => c.id === 'c1').status, 'ended');
  assert.equal(next.find((c) => c.status === 'active').title, 'Ny');
}

{
  const a = { id: 'r2', summary: 'Bra', goals: 'Lære X', wellbeing: '4', status: 'done', date: '2026-01-01' };
  const b = { id: 'r1', summary: 'Ok', goals: 'Lære X', wellbeing: '3', status: 'done', date: '2025-01-01' };
  const cmp = compareReviews(a, b);
  assert.equal(cmp.hasChanges, true);
  assert.ok(cmp.deltas.find((d) => d.key === 'summary').changed);
  assert.equal(cmp.deltas.find((d) => d.key === 'goals').changed, false);
}

{
  const tasks = onboardingTasksFor('e1');
  assert.ok(tasks.length >= 3);
  assert.equal(tasks[0].employeeId, 'e1');
}

{
  const state = normalizeHrState({
    memos: [
      { id: 'm-vis', employeeId: 'e1', title: 'Synlig', employeeVisible: true, attachments: [{ name: 'a.pdf', url: 'https://x' }] },
      { id: 'm-priv', employeeId: 'e1', title: 'Privat', employeeVisible: false },
    ],
    files: [
      { id: 'f1', employeeId: 'e1', name: 'cv.pdf', memoId: '' },
      { id: 'f2', employeeId: 'e1', name: 'privat.pdf', memoId: 'm-priv' },
      { id: 'f3', employeeId: 'e1', name: 'synlig.pdf', memoId: 'm-vis' },
    ],
    applications: [{ name: 'Ada', stage: 'interview' }],
  });
  assert.equal(state.applications[0].board, 'processing');
  assert.equal(state.memos[0].attachments.length, 1);
  const slice = employeeVisibleSlice(state, 'e1');
  assert.equal(slice.memos.length, 1);
  // f1 uten employeeVisible er HR-intern; f3 følger synlig memo.
  assert.equal(slice.files.length, 1);
  assert.ok(slice.files.every((f) => f.id !== 'f2'));
  assert.ok(!slice.files.some((f) => f.id === 'f1'));
  assert.ok(slice.files.some((f) => f.id === 'f3'));
}

{
  const first = upsertActiveContract([], {
    id: 'c1', employeeId: 'e1', title: 'Avtale 1', startDate: '2024-01-01', status: 'active',
  });
  const second = upsertActiveContract(first, {
    id: 'c2', employeeId: 'e1', title: 'Avtale 2', startDate: '2025-01-01', status: 'active',
  });
  assert.equal(second.filter((c) => c.status === 'active').length, 1);
  assert.equal(second.find((c) => c.id === 'c1').status, 'ended');
  assert.equal(second.find((c) => c.id === 'c2').status, 'active');
}

{
  const ending = expiringContracts([
    { id: 'c1', status: 'active', endDate: '2026-11-01', employeeId: 'e1' },
  ], { withinDays: 45, today: new Date('2026-10-15T12:00:00Z') });
  assert.equal(ending[0].days, 17);
}

{
  const open = openFollowUps({
    cases: [{ status: 'open', dueDate: '2026-12-01' }, { status: 'open', dueDate: '2026-11-01' }],
    tasks: [{ status: 'doing' }],
    reviews: [{ status: 'planned' }],
  });
  assert.equal(open.cases[0].dueDate, '2026-11-01');
}

{
  const draft = employeeDraftFromApplication(
    { name: 'Ada Lovelace', email: 'ada@example.com', notes: 'Sterk' },
    { title: 'Konsulent' },
  );
  assert.equal(draft.person.firstName, 'Ada');
  assert.match(draft.company.comment, /rekruttering/);
}

{
  const list = upsertRow([], { employeeId: 'e1', annualAmount: 1, effectiveDate: '2024-01-01' }, normalizeSalary);
  assert.equal(list.length, 1);
  assert.equal(hrStateHasData(emptyHrState()), false);
  assert.equal(hrStateHasData({ contracts: [{ employeeId: 'e1', title: 'Avtale' }] }), true);
}

{
  const eventCase = caseFromPeopleEvent({
    type: 'anniversary', employeeId: 'e1', name: 'Ada', label: '5-årsjubileum',
    date: '2026-11-01', days: 17,
  });
  assert.match(eventCase.title, /jubileum/i);
  assert.equal(eventCase.priority, 'normal');
  assert.equal(hasOpenCaseLike([eventCase], eventCase), true);
  const urgent = caseFromExpiringContract({
    employeeId: 'e1', title: 'Avtale', endDate: '2026-10-20', days: 5,
  });
  assert.equal(urgent.priority, 'high');
  const rejected = normalizeApplication({ name: 'Bo', outcome: 'rejected', rejectReason: 'Annen kandidat' });
  assert.equal(rejected.rejectReason, 'Annen kandidat');
}

console.log('hr/model.test.mjs ok');
