import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeContract } from './model.js';
import {
  directoryFacetCounts,
  filterHrDirectory,
  hrControlCells,
  hrKindBucket,
  hrKindLabel,
  splitPeopleEventsByKind,
} from './directory.js';

function person(id, {
  first = 'Ada',
  last = 'Nordmann',
  status = 'active',
  kind = 'staff',
  title = 'Konsulent',
  email = '',
} = {}) {
  return {
    id,
    person: { firstName: first, lastName: last, email },
    company: { status, personnelKind: kind, title, email },
  };
}

{
  const rows = [
    person('a', { first: 'Åse', kind: 'staff' }),
    person('b', { first: 'Bo', kind: 'external' }),
    person('c', { first: 'Celine', kind: 'innleid', status: 'inactive' }),
    person('d', { first: 'Dina', status: 'deleted' }),
    person('e', { first: 'Eva', status: 'leave' }),
    person('f', { first: 'Finn', status: 'former' }),
  ];
  assert.equal(hrKindBucket(rows[0]), 'internal');
  assert.equal(hrKindBucket(rows[1]), 'external');
  assert.equal(hrKindBucket(rows[2]), 'external');
  assert.equal(hrKindLabel(rows[2]), 'Innleid');
  assert.equal(hrKindLabel(rows[0]), 'Intern');

  const active = filterHrDirectory(rows, { status: 'active', kind: 'all' });
  assert.deepEqual(active.map((row) => row.id).sort(), ['a', 'b', 'e']);
  assert.deepEqual(active.map((row) => row.id), ['b', 'e', 'a']);

  const external = filterHrDirectory(rows, { status: 'all', kind: 'external' });
  assert.deepEqual(external.map((row) => row.id), ['b', 'c']);

  const inactiveInternal = filterHrDirectory(rows, { status: 'inactive', kind: 'internal' });
  assert.deepEqual(inactiveInternal.map((row) => row.id), ['f']);

  const searched = filterHrDirectory(rows, { status: 'all', query: 'konsulent celine' });
  assert.equal(searched.length, 0);
  const byMail = filterHrDirectory(
    [person('m', { email: 'post@protop.no', first: 'Mia' })],
    { query: 'protop.no' },
  );
  assert.equal(byMail.length, 1);

  const counts = directoryFacetCounts(rows, { status: 'active', kind: 'external' });
  assert.equal(counts.active, 1);
  assert.equal(counts.inactive, 1);
  assert.equal(counts.external, 1);
  assert.equal(counts.internal, 2);
}

{
  const events = [
    { employeeId: 'ext', name: 'Bo', days: 1 },
    { employeeId: 'staff', name: 'Ada', days: 4 },
    { employeeId: 'inn', name: 'Celine', days: 2 },
    { employeeId: 'missing', name: 'Ukjent', days: 3 },
  ];
  const split = splitPeopleEventsByKind(events, [
    person('staff', { kind: 'staff' }),
    person('ext', { kind: 'external' }),
    person('inn', { kind: 'innleid' }),
  ]);
  assert.deepEqual(split.internal.map((row) => row.name), ['Ada', 'Ukjent']);
  assert.deepEqual(split.external.map((row) => row.name), ['Bo', 'Celine']);
}

{
  const employee = person('e1', { first: 'Geir', last: 'Andersen' });
  const contract = normalizeContract({
    employeeId: 'e1',
    status: 'active',
    title: 'Arbeidsavtale',
    employerName: 'Protop AS',
    employeeName: 'Geir Andersen',
    workplace: 'Oslo',
    positionTitle: 'Rådgiver',
    startDate: '2020-01-02',
    probationMonths: '6',
    holidayTerms: 'Etter ferieloven',
    noticePeriod: '3 mnd',
    salaryAmount: '600000',
    workPercent: '100',
    workHours: '37,5',
    breakLength: '30 min',
  });
  const cells = hrControlCells(employee, {
    hr: {
      contracts: [contract],
      salaries: [{
        id: 's1',
        employeeId: 'e1',
        kind: 'actual',
        effectiveDate: '2024-01-01',
        annualAmount: 600000,
        currency: 'NOK',
      }],
      reviews: [{ id: 'r1', employeeId: 'e1', status: 'done', date: '2026-03-01' }],
      cases: [
        { id: 'c1', employeeId: 'e1', status: 'open' },
        { id: 'c2', employeeId: 'e1', status: 'closed' },
      ],
      tasks: [{ id: 't1', employeeId: 'e1', status: 'open' }],
      compliance: [],
    },
    entries: [{ employeeId: 'e1', hours: 10, billableHours: 8 }],
  });
  assert.equal(cells.contractTitle, 'Arbeidsavtale');
  assert.match(cells.contract, /^AML \d+ %$/);
  assert.equal(cells.contractFrom, '02.01.2020');
  assert.equal(cells.review, '01.03.2026');
  assert.equal(cells.salary.includes('600'), true);
  assert.equal(cells.utilization, '80 %');
  assert.equal(cells.openCases, '1');
  assert.equal(cells.openTasks, '1');
  assert.equal(cells.kindLabel, 'Intern');
}

{
  const cells = hrControlCells(person('e2'), { hr: {}, entries: [] });
  assert.equal(cells.contract, 'Mangler');
  assert.equal(cells.review, 'Mangler');
  assert.equal(cells.salary, 'Mangler');
  assert.equal(cells.utilization, '—');
  assert.equal(cells.checklistMissing > 0, true);
}

{
  const contracts = readFileSync(new URL('../../screens/hr/HrContracts.jsx', import.meta.url), 'utf8');
  const salary = readFileSync(new URL('../../screens/hr/HrSalary.jsx', import.meta.url), 'utf8');
  const follow = readFileSync(new URL('../../screens/hr/HrFollowUp.jsx', import.meta.url), 'utf8');
  const compliance = readFileSync(new URL('../../screens/hr/HrCompliance.jsx', import.meta.url), 'utf8');
  const people = readFileSync(new URL('../../screens/hr/HrPeople.jsx', import.meta.url), 'utf8');
  const screen = readFileSync(new URL('../../screens/hr/HrScreen.jsx', import.meta.url), 'utf8');
  assert.match(contracts, /Registrer avtale/);
  assert.match(contracts, /composerOpen/);
  assert.doesNotMatch(contracts, /people\.map/);
  assert.match(contracts, /flexDirection: 'row'/);
  assert.doesNotMatch(salary, /displayName/);
  assert.match(follow, /lockedEmployeeId/);
  assert.doesNotMatch(follow, /title="Medarbeider"/);
  assert.doesNotMatch(compliance, /people\.map/);
  assert.match(people, /Sjekkliste/);
  assert.match(people, /Ansettelsesavtale/);
  assert.match(people, /Medarbeidersamtale/);
  assert.match(people, /Fakturerbarhet/);
  assert.doesNotMatch(people, /Hurtigregistrer kontrakt/);
  assert.match(screen, /HrControl/);
  assert.doesNotMatch(screen, /from '\.\/HrContracts'/);
}

console.log('hr directory ok');
