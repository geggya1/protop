import assert from 'node:assert/strict';
import {
  buildHourImportReview,
  companyHourRow,
  hourColumnField,
  hourFingerprint,
  hoursLookDuplicate,
  linkImportPlanEmployee,
  linkImportPlanProject,
  matchEmployee,
  planHourImport,
  readHourTable,
  reviewRowsForHourPlan,
  splitEmployeeHint,
  toggleHourReviewRow,
} from './hoursImport.js';
import {
  createProject,
  emptyProjectState,
  importTimeEntries,
  addProjectMember,
} from '../project/engine.js';

{
  assert.equal(hourColumnField('Dato'), 'date');
  assert.equal(hourColumnField('Ansatt'), 'employeeName');
  assert.equal(hourColumnField('Ansattnummer'), 'employeeNumber');
  assert.equal(hourColumnField('Prosjektnummer'), 'projectNumber');
  assert.equal(hourColumnField('Timer'), 'hours');
  assert.equal(hourColumnField('Fakturerbare timer'), 'billableHours');
  assert.equal(hourColumnField('Beskrivelse'), 'description');
  assert.equal(hourColumnField('Aktivitet'), 'activityName');
  assert.equal(hourColumnField('Opprettet dato'), 'date');
  assert.equal(hourColumnField('Antall timer i valgt periode'), 'hours');
  assert.equal(hourColumnField('Number of hours in selected period'), 'hours');
  assert.equal(hourColumnField('Created date'), 'date');
  assert.equal(hourColumnField('Medarbeider (Eksternt ansattnummer)'), 'employeeName');
  assert.equal(hourColumnField('Fakturerbart'), 'billable');
  assert.equal(hourColumnField('Internt notat'), 'internalNote');
  assert.equal(hourColumnField('Opprettet av'), '');
  assert.equal(splitEmployeeHint('Geir Andersen (12)').name, 'Geir Andersen');
  assert.equal(splitEmployeeHint('Geir Andersen (12)').number, '12');
}

{
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const hit = matchEmployee(employees, { employeeNumber: '12', employeeName: 'Geir Andersen' });
  assert.equal(hit.id, 'emp1');
  assert.equal(matchEmployee(employees, { employeeName: 'Geir Andersen' }).id, 'emp1');
}

{
  // Nummer som peker på Tom skal ikke vinne over Geirs navn.
  const employees = [
    {
      id: 'tom',
      person: { firstName: 'Tom', middleName: 'Kåre', lastName: 'Hestvåg' },
      company: { externalEmployeeNumber: '12' },
    },
    {
      id: 'geir',
      person: { firstName: 'Geir', middleName: 'Ove', lastName: 'Andersen' },
      company: { externalEmployeeNumber: '99' },
    },
  ];
  const byName = matchEmployee(employees, {
    employeeNumber: '12',
    employeeName: 'Geir Ove Andersen',
  });
  assert.equal(byName?.id, 'geir');
  assert.equal(matchEmployee(employees, {
    employeeNumber: '12',
    employeeName: 'Tom Kåre Hestvåg',
  })?.id, 'tom');
}

{
  // Prosjekt-treff uten kundekolonner fyller kunde fra prosjekt + register.
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const customers = [{ id: 'c1', name: 'Sola Kommune', customerNumber: '10010', orgnr: '123' }];
  const projects = [{
    id: 'p1', number: '10857', name: 'Sikker skolevei', customerId: 'c1', client: 'Sola Kommune',
  }];
  const row = companyHourRow({
    date: '06.10.2026',
    employeeNumber: '12',
    employeeName: 'Geir Andersen',
    projectNumber: '10857',
    projectName: 'Sikker skolevei',
    hours: '8',
    description: 'Arbeid',
  }, { employees, customers, projects });
  assert.equal(row.severity, 'ok');
  assert.equal(row.entry.projectId, 'p1');
  assert.equal(row.entry.customerId, 'c1');
  assert.equal(row.entry.customerName, 'Sola Kommune');
  assert.equal(row.entry.customerNumber, '10010');
}

{
  // Manuell prosjektkobling gjelder hele gruppen med samme prosjektnr.
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const customers = [{ id: 'c1', name: 'Sola Kommune', customerNumber: '10010' }];
  const projects = [{
    id: 'p1', number: '10857', name: 'Sikker skolevei', customerId: 'c1', client: 'Sola Kommune',
  }];
  const plan = planHourImport([], employees, [], [], [
    {
      date: '06.10.2026', employeeNumber: '12', employeeName: 'Geir Andersen',
      projectNumber: '10857', projectName: 'Sikker skolevei', hours: '4', description: 'A',
    },
    {
      date: '07.10.2026', employeeNumber: '12', employeeName: 'Geir Andersen',
      projectNumber: '10857', projectName: 'Sikker skolevei', hours: '4', description: 'B',
    },
  ]);
  assert.equal(plan.rows.every((row) => row.severity === 'review'), true);
  const linked = linkImportPlanProject(plan, 0, projects[0], { applyGroup: true, customers });
  assert.equal(linked.rows[0].projectId, 'p1');
  assert.equal(linked.rows[1].projectId, 'p1');
  assert.equal(linked.rows[0].customerName, 'Sola Kommune');
  assert.equal(linked.rows[1].customerName, 'Sola Kommune');
  assert.equal(linked.rows.every((row) => row.severity === 'ok'), true);
}

{
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const customers = [{ id: 'c1', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137' }];
  const projects = [{
    id: 'p1', number: '10857', name: 'Sikker skolevei', customerId: 'c1',
  }];
  const row = companyHourRow({
    date: '15.03.2023',
    employeeNumber: '12',
    employeeName: 'Geir Andersen',
    customerNumber: '10025',
    customerName: 'Sandnes Kommune',
    projectNumber: '10857',
    projectName: 'Sikker skolevei',
    activityName: 'Prosjektering',
    hours: '7:30',
    billableHours: '7:30',
    description: 'Tegningskontroll',
    _sourceValues: { Dato: '15.03.2023', Timer: '7:30' },
  }, { employees, customers, projects });
  assert.equal(row.severity, 'ok');
  assert.equal(row.entry.employeeId, 'emp1');
  assert.equal(row.entry.projectId, 'p1');
  assert.equal(row.entry.customerId, 'c1');
  assert.equal(row.entry.hours, 7.5);
  assert.equal(row.entry.date, '2023-03-15');
  assert.ok(row.entry.importFingerprint);
  assert.equal(row.entry.source.values.Dato, '15.03.2023');
}

{
  const blocked = companyHourRow({ employeeName: 'Totalt', hours: '100' });
  assert.equal(blocked.severity, 'block');
  assert.equal(blocked.entry, null);
}

{
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const projects = [{ id: 'p1', number: '10857', name: 'Sikker skolevei' }];
  const raw = {
    date: '15.03.2023',
    employeeNumber: '12',
    employeeName: 'Geir Andersen',
    projectNumber: '10857',
    projectName: 'Sikker skolevei',
    hours: '8',
    description: 'Arbeid',
  };
  const first = planHourImport([], employees, [], projects, [raw, raw]);
  assert.equal(first.rows[0].severity, 'ok');
  assert.equal(first.rows[1].severity, 'existing');
  assert.match(first.rows[1].issues.join(' '), /Duplikat/);

  const fp = hourFingerprint(first.rows[0].entry);
  const second = planHourImport(
    [{ ...first.rows[0].entry, importFingerprint: fp }],
    employees,
    [],
    projects,
    [raw],
  );
  assert.equal(second.rows[0].severity, 'existing');
}

{
  // Duplikat krever dato + person + timer + beskrivelse — ikke bare dato/person.
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const projects = [
    { id: 'p1', number: '10857', name: 'Sikker skolevei' },
    { id: 'p2', number: '10999', name: 'Annet prosjekt' },
  ];
  const base = {
    date: '15.03.2023',
    employeeNumber: '12',
    employeeName: 'Geir Andersen',
    projectNumber: '10857',
    projectName: 'Sikker skolevei',
    hours: '8',
    description: 'Befaring',
  };
  assert.equal(hoursLookDuplicate(base, { ...base, projectNumber: '10999', projectName: 'Annet' }), true);
  assert.equal(hoursLookDuplicate(base, { ...base, hours: '4' }), false);
  assert.equal(hoursLookDuplicate(base, { ...base, description: 'Annet arbeid' }), false);
  assert.equal(hoursLookDuplicate(base, { ...base, date: '16.03.2023' }), false);
  assert.equal(hoursLookDuplicate(base, {
    ...base, employeeNumber: '99', employeeName: 'Noen Andre',
  }), false);

  // Ulik beskrivelse / timer → ikke duplikat mot eksisterende, selv med gammel fingerprint-streng.
  const existing = [{
    date: '2023-03-15',
    employeeId: 'emp1',
    employeeNumber: '12',
    employeeName: 'Geir Andersen',
    hours: 8,
    description: 'Befaring',
    importFingerprint: 'gammel|kort|nokkel',
  }];
  const same = planHourImport(existing, employees, [], projects, [base]);
  assert.equal(same.rows[0].severity, 'existing');

  const differentHours = planHourImport(existing, employees, [], projects, [{ ...base, hours: '4' }]);
  assert.equal(differentHours.rows[0].severity, 'ok');

  const differentText = planHourImport(existing, employees, [], projects, [{
    ...base, description: 'Tegningskontroll',
  }]);
  assert.equal(differentText.rows[0].severity, 'ok');

  // Gammel fingerprint-streng alene skal ikke gi falske treff.
  const stale = planHourImport([{
    date: '2023-01-01',
    employeeId: 'emp1',
    employeeNumber: '12',
    employeeName: 'Geir Andersen',
    hours: 1,
    description: 'X',
    importFingerprint: hourFingerprint({
      date: '15.03.2023',
      employeeId: 'emp1',
      employeeNumber: '12',
      hours: 8,
      description: 'Befaring',
    }),
  }], employees, [], projects, [base]);
  assert.equal(stale.rows[0].severity, 'ok');
}

{
  // Oppstykkede føringer samme dag og samme prosjekt er OK når timer/tekst avviker.
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const projects = [{ id: 'p1', number: '10857', name: 'Sikker skolevei' }];
  const chunks = [
    {
      date: '15.03.2023', employeeNumber: '12', employeeName: 'Geir Andersen',
      projectNumber: '10857', projectName: 'Sikker skolevei',
      hours: '2', description: 'Befaring formiddag',
    },
    {
      date: '15.03.2023', employeeNumber: '12', employeeName: 'Geir Andersen',
      projectNumber: '10857', projectName: 'Sikker skolevei',
      hours: '3', description: 'Befaring ettermiddag',
    },
    {
      date: '15.03.2023', employeeNumber: '12', employeeName: 'Geir Andersen',
      projectNumber: '10857', projectName: 'Sikker skolevei',
      hours: '3', description: 'Tegningskontroll',
    },
  ];
  const split = planHourImport([], employees, [], projects, chunks);
  assert.equal(split.rows.filter((row) => row.severity === 'ok').length, 3);
  assert.equal(split.rows.some((row) => row.severity === 'existing'), false);

  // Kun helt identisk rad (dato+person+timer+beskrivelse) er duplikat.
  const withClone = planHourImport([], employees, [], projects, [...chunks, chunks[0]]);
  assert.equal(withClone.rows.filter((row) => row.severity === 'ok').length, 3);
  assert.equal(withClone.rows.filter((row) => row.severity === 'existing').length, 1);
  assert.match(withClone.rows.find((row) => row.severity === 'existing').issues.join(' '), /dato, person, timer og beskrivelse/);
}

{
  const plan = planHourImport([], [], [], [], [{
    date: '01.01.2023',
    employeeName: 'Ukjent Person',
    employeeNumber: '99',
    projectNumber: '1',
    projectName: 'X',
    hours: '4',
  }]);
  assert.equal(plan.rows[0].severity, 'review');
  const linked = linkImportPlanEmployee(plan, 0, {
    id: 'emp9',
    person: { firstName: 'Ukjent', lastName: 'Person' },
    company: { externalEmployeeNumber: '99' },
  });
  // Prosjekt mangler fortsatt i registeret
  assert.equal(linked.rows[0].employeeId, 'emp9');
  assert.equal(linked.rows[0].severity, 'review');
  assert.match(linked.rows[0].issues.join(' '), /Prosjekt/);
}

{
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Ada', lastName: 'Lovelace' },
    company: { externalEmployeeNumber: '1' },
  }];
  const projects = [{ id: 'p1', number: '10', name: 'Demo' }];
  const plan = planHourImport([], employees, [], projects, [
    {
      date: '01.02.2023', employeeNumber: '1', employeeName: 'Ada Lovelace',
      projectNumber: '10', projectName: 'Demo', hours: '2', description: 'A',
    },
    {
      date: '02.02.2023', employeeNumber: '1', employeeName: 'Ada Lovelace',
      projectNumber: '10', projectName: 'Demo', hours: '3', description: 'B',
    },
    { employeeName: 'Totalt', hours: '5' },
  ]);
  const review = reviewRowsForHourPlan(plan);
  assert.ok(review.some((row) => row.severity === 'block'));
  assert.ok(review.some((row) => row.id === 'ok-group'));
  const ok = review.find((row) => row.id === 'ok-group');
  const dropped = toggleHourReviewRow(new Set(), ok, plan);
  assert.equal(dropped.size, 2);

  const built = buildHourImportReview(plan);
  assert.equal(built.readyCount, 2);
  assert.equal(built.okRows.length, 2);
  assert.equal(built.blockCount, 1);
  assert.match(built.cards.find((row) => row.severity === 'block').title, /Summeringsrad|Totalt|ugyldig/i);

  const afterDrop = buildHourImportReview(plan, { dropped });
  assert.equal(afterDrop.readyCount, 0);
  assert.equal(afterDrop.okRows.every((row) => !row.included), true);
}

{
  let state = emptyProjectState();
  state = createProject(state, {
    name: 'Demo',
    number: '10',
    client: 'Kunde',
    pricingModel: 'hourly',
  }).state;
  const projectId = state.activeProjectId;
  const result = importTimeEntries(state, [{
    projectId,
    employeeId: 'emp1',
    employeeName: 'Ada Lovelace',
    employeeNumber: '1',
    customerId: 'c1',
    customerName: 'Kunde AS',
    projectNumber: '10',
    projectName: 'Demo',
    activityName: 'Prosjektering',
    date: '2023-02-01',
    hours: 8,
    billableHours: 8,
    description: 'Arbeid',
    importFingerprint: 'fp-1',
    source: { filename: 'hours 2023.xlsx', importedAt: '2023-01-01T00:00:00.000Z', values: { Timer: '8' } },
  }]);
  assert.equal(result.ok, true);
  assert.equal(result.added.length, 1);
  assert.equal(result.state.timeEntries.length, 1);
  assert.ok(result.state.members.some((row) => row.employeeId === 'emp1' && row.projectId === projectId));
  assert.ok(result.state.activities.some((row) => row.name === 'Prosjektering'));
  assert.equal(result.state.projects.find((row) => row.id === projectId).hoursPeriod, 8);

  const again = importTimeEntries(result.state, [{
    projectId,
    employeeId: 'emp1',
    date: '2023-02-01',
    hours: 8,
    description: 'Arbeid',
    importFingerprint: 'fp-1',
  }]);
  assert.equal(again.added.length, 0);
  assert.equal(again.skipped.length, 1);
  assert.equal(again.state.timeEntries.length, 1);
}

{
  // Batch-append: mange rader uten O(n²), og kunde fylles fra prosjekt.client.
  let state = emptyProjectState();
  state = createProject(state, {
    name: 'Batch',
    number: '20',
    client: 'Batch Kunde',
    customerId: 'c-batch',
    pricingModel: 'hourly',
  }).state;
  const projectId = state.activeProjectId;
  const drafts = Array.from({ length: 200 }, (_, index) => ({
    projectId,
    employeeId: 'emp1',
    employeeName: 'Ada Lovelace',
    date: `2023-04-${String((index % 28) + 1).padStart(2, '0')}`,
    hours: 1,
    description: `Rad ${index}`,
    importFingerprint: `batch-${index}`,
  }));
  const result = importTimeEntries(state, drafts);
  assert.equal(result.ok, true);
  assert.equal(result.added.length, 200);
  assert.equal(result.state.timeEntries.length, 200);
  assert.equal(result.added[0].customerName, 'Batch Kunde');
  assert.equal(result.added[0].projectNumber, '20');
  assert.equal(result.added[199].customerName, 'Batch Kunde');
}

{
  let state = emptyProjectState();
  state = createProject(state, { name: 'Demo', number: '10' }).state;
  state = addProjectMember(state, {
    projectId: state.activeProjectId,
    employeeId: 'emp1',
    employeeName: 'Ada',
  }).state;
  const before = state.members.length;
  const result = importTimeEntries(state, [{
    projectId: state.activeProjectId,
    employeeId: 'emp1',
    employeeName: 'Ada',
    date: '2023-03-01',
    hours: 1,
    importFingerprint: 'fp-member',
  }]);
  assert.equal(result.state.members.filter((row) => row.active !== false).length, before);
}

{
  const csv = [
    'Opprettet dato;Medarbeider (Eksternt ansattnummer);Prosjektnummer;Prosjekt;Kundenavn;Aktivitet;Fakturerbart;Beskrivelse;Antall timer i valgt periode',
    '02.01.2016 08:00;Geir Andersen (12);10563;Kvitsøy skole;Sandnes Kommune;Prosjektering;Ja;Tegning;7:30',
  ].join('\n');
  const rows = await readHourTable(new TextEncoder().encode(csv), 'hours 2016.csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hours, '7:30');
  assert.equal(rows[0].billable, 'Ja');
  const employees = [{
    id: 'emp1',
    person: { firstName: 'Geir', lastName: 'Andersen' },
    company: { externalEmployeeNumber: '12' },
  }];
  const projects = [{ id: 'p1', number: '10563', name: 'Kvitsøy skole', customerId: 'c1' }];
  const customers = [{ id: 'c1', name: 'Sandnes Kommune', customerNumber: '10025' }];
  const planned = planHourImport([], employees, customers, projects, rows);
  assert.equal(planned.rows[0].severity, 'ok');
  assert.equal(planned.rows[0].entry.date, '2016-01-02');
  assert.equal(planned.rows[0].entry.hours, 7.5);
  assert.equal(planned.rows[0].entry.billableHours, 7.5);
  assert.equal(planned.rows[0].entry.employeeId, 'emp1');
  assert.equal(planned.rows[0].entry.employeeNumber, '12');
}

console.log('hoursImport.test.mjs: ok');
