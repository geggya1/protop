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

  const regnskap = person('r', { first: 'Ron', kind: 'staff' });
  regnskap.company.accessLevel = 'regnskap_ekstern';
  const andre = person('o', { first: 'Oda', kind: 'staff' });
  andre.company.accessLevel = 'ansatt_andre_avdelinger';
  const innleie = person('i', { first: 'Ivar', kind: 'staff' });
  innleie.company.accessLevel = 'innleie_ekstern';
  const typed = person('t', { first: 'Tina', kind: 'staff' });
  typed.company.employmentType = 'Ekstern';
  const mixed = person('mix', { first: 'Mia', kind: 'staff' });
  mixed.company.accessLevel = 'tilbud';
  mixed.company.accessLevels = ['ansatt', 'tilbud', 'regnskap_ekstern'];
  assert.equal(hrKindBucket(regnskap), 'external');
  assert.equal(hrKindLabel(regnskap), 'Ekstern');
  assert.equal(hrKindBucket(andre), 'external');
  assert.equal(hrKindLabel(andre), 'Ekstern');
  assert.equal(hrKindBucket(innleie), 'external');
  assert.equal(hrKindLabel(innleie), 'Innleid');
  assert.equal(hrKindBucket(typed), 'external');
  assert.equal(hrKindBucket(mixed), 'internal');
  assert.equal(hrKindLabel(mixed), 'Intern');
  const onlyInternal = filterHrDirectory(
    [rows[0], regnskap, andre, innleie, typed, mixed],
    { status: 'active', kind: 'internal' },
  );
  assert.deepEqual(onlyInternal.map((row) => row.id), ['mix', 'a']);

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
    // Punktene som kom inn i AML § 14-6 fra 1.7.2024.
    terminationProcedure: 'Skriftlig. Søksmål innen 8 uker.',
    paySchedule: 'Den 15. hver måned',
    overtimeTerms: 'Minst 40 % tillegg',
    collectiveAgreement: 'Ingen',
    competenceDevelopment: 'Kurs etter plan',
    pensionInsurance: 'OTP',
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
      hmsCards: [{ employeeId: 'e1', number: 'HMS 123', validTo: '2099-12-31' }],
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
  assert.equal(cells.checklistOk, 3, 'avtale, minimumskrav og gyldig HMS-kort');
  assert.equal(cells.checklist, 'personvern', 'listen sier hva som mangler, ikke 3/4');
  assert.equal(cells.checklistCount, '3/4');
  // HMS-introduksjon og kompetanse følges opp i ISO, ikke i HR-sjekklisten.
  assert.equal(cells.checklistGaps, 'Personverninformasjon gitt');
  assert.doesNotMatch(cells.checklistGaps, /Skriftlig arbeidsavtale/);

  // Avtale uten punktene fra 2024: minimumskravet står som mangel.
  const older = normalizeContract({ ...contract, pensionInsurance: '', competenceDevelopment: '' });
  const olderCells = hrControlCells(employee, { hr: { contracts: [older], compliance: [], hmsCards: [] }, entries: [] });
  assert.match(olderCells.checklistGaps, /Gyldig HMS-kort/, 'uten registrert HMS-kort er punktet en mangel');
  assert.match(olderCells.contract, /^AML \d+ %$/);
  assert.notEqual(olderCells.contract, 'AML 100 %');
  assert.match(olderCells.checklistGaps, /Avtalen dekker minimumskrav/);
}

{
  const cells = hrControlCells(person('e2'), { hr: {}, entries: [] });
  assert.equal(cells.contract, 'Mangler');
  assert.equal(cells.review, 'Mangler');
  assert.equal(cells.salary, 'Mangler');
  assert.equal(cells.utilization, '—');
  assert.equal(cells.checklistMissing > 0, true);
  assert.match(cells.checklistGaps, /Skriftlig arbeidsavtale/);
  assert.equal(cells.checklist, 'HMS-kort, personvern', 'avtalen står i egen kolonne og gjentas ikke');
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
  assert.match(people, /label: 'Lovpålagt', width: 200, sheet: 'compliance'/);
  assert.doesNotMatch(people, /Sjekkliste/);
  // Lønn står bare under HR → Lønn, ikke i personellisten eller som fane på personen.
  assert.doesNotMatch(people, /key: 'salary'/);
  assert.doesNotMatch(people, /\{ id: 'lonn', label: 'Lønn' \}/);
  assert.doesNotMatch(people, /label="Lønn"/);
  assert.match(people, /onSheet\?\.\(col\?\.sheet \|\| 'oversikt'\)/);
  assert.match(screen, /scrollRef\.current\?\.scrollTo\?\.\(\{ y: 0, animated: false \}\);\n  \}, \[page, selectedEmployeeId, employeeSheet\]\);/);
  assert.match(people, /Ansettelsesavtale/);
  assert.match(people, /Medarbeidersamtale/);
  assert.match(people, /Fakturerbarhet/);
  assert.doesNotMatch(people, /Hurtigregistrer kontrakt/);
  assert.match(screen, /HrControl/);
  // Undersidene ligger i modulmenyen i skallet (ModuleTabs), ikke i en egen HR-meny (UX-19).
  assert.doesNotMatch(screen, /HrSectionNav/);
  assert.doesNotMatch(screen, /from '\.\/HrContracts'/);
}

console.log('hr directory ok');
