import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companyProjectRow,
  linkImportPlanCustomer,
  matchCustomer,
  planProjectImport,
  readCompanyProjectTable,
} from './projectImport.js';
import { createProject, emptyProjectState, importProjects, projectMissingAgreement, updateProject } from './engine.js';

{
  const customer = matchCustomer(
    [{ id: 'c1', name: 'Sandnes Kommune', customerNumber: '10025', orgnr: '964965137' }],
    { customerNumber: '10025' },
  );
  assert.equal(customer.id, 'c1');
}

{
  // Kundenummer i registeret kan mangle/være annet; org.nr og mykt navn skal fortsatt treffe.
  const byOrgnr = matchCustomer(
    [{ id: 'c-org', name: 'Sandnes kommune', customerNumber: '12', orgnr: '964965137' }],
    { customerNumber: '10025', client: 'Sandnes Kommune', orgnr: '964 965 137' },
  );
  assert.equal(byOrgnr.id, 'c-org');

  const bySoftName = matchCustomer(
    [{ id: 'c-name', name: 'Stavanger kommune', customerNumber: '9', orgnr: '' }],
    { customerNumber: '10062', client: 'Stavanger Kommune Bymiljø Og Utbygging', orgnr: '' },
  );
  assert.equal(bySoftName.id, 'c-name');

  const byNormalizedNumber = matchCustomer(
    [{ id: 'c-num', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' }],
    { customerNumber: '10115.0', client: 'Annet navn' },
  );
  assert.equal(byNormalizedNumber.id, 'c-num');

  const byNotesNumber = matchCustomer(
    [{ id: 'c-notes', name: 'Sandnes kommune', customerNumber: '7', notes: 'Kundenr 10025', orgnr: '964965137' }],
    { customerNumber: '10025', client: 'Sandnes Kommune' },
  );
  assert.equal(byNotesNumber.id, 'c-notes');

  const byShortestSoft = matchCustomer(
    [
      { id: 'c-dept', name: 'Sandnes kommune Bymiljø', customerNumber: '8', orgnr: '' },
      { id: 'c-legal', name: 'Sandnes kommune', customerNumber: '9', orgnr: '' },
    ],
    { customerNumber: '999', client: 'Sandnes Kommune Bymiljø Og Utbygging', orgnr: '' },
  );
  assert.equal(byShortestSoft.id, 'c-legal');
}

{
  const row = companyProjectRow({
    number: '10951',
    name: 'Nykirkebakken Fasade Rehab. KU',
    customerNumber: '10102',
    client: 'Sameiet Nytorget 6',
    orgnr: '981671155',
    manager: 'Torbjørn Øgreid Coll',
    status: 'Under arbeid',
  }, [{ id: 'c2', name: 'Sameiet Nytorget 6', customerNumber: '10102', orgnr: '981671155' }]);
  assert.equal(row.severity, 'review');
  assert.equal(row.project.customerId, 'c2');
  assert.equal(row.project.phase, 'produksjon');
  assert.match(row.issues.join(' '), /Ingen avtale/);
  assert.equal(row.issues.some((issue) => /kunde/i.test(issue)), false);
}

{
  let state = emptyProjectState();
  state = createProject(state, {
    name: 'Uten avtale',
    number: 'P-1',
    client: 'Kunde',
    customerId: 'c1',
  }).state;
  assert.equal(projectMissingAgreement(state.projects[0]), true);
  state = updateProject(state, state.projects[0].id, {
    contractId: 'ctr1',
    agreementKind: 'oppdrag',
  }).state;
  assert.equal(projectMissingAgreement(state.projects[0]), false);
  state = updateProject(state, state.projects[0].id, {
    agreementKind: 'avrop',
    contractId: 'avrop1',
    frameworkAgreementId: '',
  }).state;
  assert.equal(projectMissingAgreement(state.projects[0]), true);
}

{
  const plan = planProjectImport(
    emptyProjectState(),
    [{ id: 'c1', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' }],
    [],
    [{ number: '10948', name: 'Nabokontakt Oddahagen', customerNumber: '10115', client: 'Lyse Neo AS' }],
  );
  assert.equal(plan.rows.length, 1);
  assert.equal(plan.rows[0].project.customerId, 'c1');
  const imported = importProjects(emptyProjectState(), plan.rows.map((row) => row.project));
  assert.equal(imported.ok, true);
  assert.equal(imported.created.length, 1);
  assert.equal(projectMissingAgreement(imported.created[0]), true);
}

{
  const blocked = companyProjectRow({ number: 'Totalt', name: '6330912.48' });
  assert.equal(blocked.severity, 'block');
  assert.equal(blocked.project, null);
}

{
  let state = emptyProjectState();
  state = createProject(state, { name: 'Nykirkebakken', number: '10951' }).state;
  const plan = planProjectImport(
    state,
    [],
    [],
    [
      { number: '10951.0', name: 'Nykirkebakken Fasade' },
      { number: '10952', name: 'Nytt prosjekt' },
      { number: '10952', name: 'Samme nummer i filen' },
    ],
  );
  assert.equal(plan.rows[0].severity, 'block');
  assert.match(plan.rows[0].issues.join(' '), /finnes allerede/);
  assert.equal(plan.rows[0].project, null);
  assert.equal(plan.rows[1].severity !== 'block', true);
  assert.equal(plan.rows[2].severity, 'block');
  assert.match(plan.rows[2].issues.join(' '), /flere ganger/);

  const imported = importProjects(state, plan.rows.map((row) => row.project).filter(Boolean));
  assert.equal(imported.ok, true);
  assert.equal(imported.created.length, 1);
  assert.equal(imported.created[0].number, '10952');
  assert.equal(state.projects.filter((row) => row.number === '10951').length, 1);

  const mixed = importProjects(imported.state, [
    { number: '10951', name: 'Skal ikke oppdateres', manager: 'Ny' },
    { number: '10999', name: 'Helt ny' },
  ]);
  assert.equal(mixed.ok, true);
  assert.equal(mixed.created.length, 1);
  assert.equal(mixed.created[0].number, '10999');
  assert.equal(mixed.skipped.length, 1);
  assert.equal(mixed.state.projects.find((row) => row.number === '10951').name, 'Nykirkebakken');

  const replay = importProjects(mixed.state, [
    { number: '10951', name: 'Skal ikke oppdateres' },
    { number: '10952', name: 'Skal heller ikke oppdateres' },
  ]);
  assert.equal(replay.ok, false);
  assert.match(replay.error, /finnes allerede/);

  let archived = emptyProjectState();
  archived = createProject(archived, { name: 'Gammel', number: '200' }).state;
  archived = updateProject(archived, archived.projects[0].id, { status: 'arkivert' }).state;
  const archivedPlan = planProjectImport(archived, [], [], [{ number: '200', name: 'Ny med samme nummer' }]);
  assert.equal(archivedPlan.rows[0].severity, 'block');
  const fromArchive = importProjects(archived, [{ number: '200', name: 'Ny med samme nummer' }]);
  assert.equal(fromArchive.ok, false);
  assert.match(fromArchive.error, /finnes allerede/);
}

{
  const customers = [
    { id: 'c-sandnes', name: 'Sandnes kommune', customerNumber: '7', orgnr: '964965137' },
    { id: 'c-other', name: 'Annen AS', customerNumber: '8', orgnr: '999999999' },
  ];
  const plan = planProjectImport(
    emptyProjectState(),
    customers,
    [],
    [
      { number: '10947', name: 'Lura Skole', customerNumber: '10025', client: 'Sandnes Kommune', orgnr: '964965137' },
      { number: '10945', name: 'Kino Kino', customerNumber: '10025', client: 'Sandnes Kommune', orgnr: '964965137' },
      { number: '10948', name: 'Nabokontakt', customerNumber: '10115', client: 'Lyse Neo AS', orgnr: '982929733' },
    ],
  );
  assert.equal(plan.rows[0].customerId, 'c-sandnes');
  assert.equal(plan.rows[1].customerId, 'c-sandnes');
  assert.equal(plan.rows[2].customerId, '');
  assert.match(plan.rows[2].issues.join(' '), /Velg kunde under/);

  const linked = linkImportPlanCustomer(plan, 2, customers[1], { applyGroup: true });
  // Feil kunde i listen over — koble Lyse-raden til en ny kunde med riktig identitet
  const lyse = { id: 'c-lyse', name: 'Lyse Neo AS', customerNumber: '10115', orgnr: '982929733' };
  const linkedLyse = linkImportPlanCustomer(plan, 2, lyse, { applyGroup: true });
  assert.equal(linkedLyse.rows[2].customerId, 'c-lyse');
  assert.equal(linkedLyse.rows[2].project.customerId, 'c-lyse');
  assert.equal(linkedLyse.rows[2].issues.some((issue) => /kunde/i.test(issue)), false);
  assert.equal(linked.rows[2].customerId, 'c-other');
}

try {
  const bytes = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/overview__3__a29a.xlsx');
  const rows = await readCompanyProjectTable(bytes, 'overview.xlsx');
  assert.ok(rows.length > 20);
  assert.equal(rows[0].number, '10951');
  assert.match(rows[0].name, /Nykirkebakken/);
  assert.equal(rows[0].customerNumber, '10102');
  assert.ok(rows[0].orgnr || rows[0].manager || rows[0].pricingModel);
  const planned = planProjectImport(
    emptyProjectState(),
    [{ id: 'c2', name: 'Sameiet Nytorget 6', customerNumber: '10102', orgnr: '981671155' }],
    [],
    rows.slice(0, 1),
  );
  const imported = importProjects(emptyProjectState(), planned.rows.map((row) => row.project).filter(Boolean));
  assert.equal(imported.ok, true);
  const project = imported.created[0];
  assert.equal(project.number, '10951');
  assert.equal(project.customerId, 'c2');
  assert.equal(project.pricingModel, 'hourly');
  assert.ok(project.manager);
  assert.ok(project.projectStatus);
  assert.equal(project.inboxEmail, null);
  assert.equal(project.hoursPeriod, null);
  console.log('projectImport.test.mjs: ok (with sample xlsx)');
} catch (cause) {
  if (cause?.code === 'ENOENT') {
    console.log('projectImport.test.mjs: ok (sample xlsx skipped)');
  } else {
    throw cause;
  }
}
