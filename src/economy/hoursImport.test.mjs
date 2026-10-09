import assert from 'node:assert/strict';
import {
  companyHourRow,
  hourColumnField,
  hourFingerprint,
  linkImportPlanEmployee,
  matchEmployee,
  planHourImport,
  reviewRowsForHourPlan,
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
  const plan = planHourImport([], [], [], [], [{
    date: '01.01.2023',
    employeeName: 'Ukjent Person',
    employeeNumber: '99',
    projectNumber: '1',
    projectName: 'X',
    hours: '4',
  }]);
  assert.equal(plan.rows[0].severity, 'block');
  const linked = linkImportPlanEmployee(plan, 0, {
    id: 'emp9',
    person: { firstName: 'Ukjent', lastName: 'Person' },
    company: { externalEmployeeNumber: '99' },
  });
  // Prosjekt mangler fortsatt i registeret
  assert.equal(linked.rows[0].employeeId, 'emp9');
  assert.equal(linked.rows[0].severity, 'block');
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

console.log('hoursImport.test.mjs: ok');
