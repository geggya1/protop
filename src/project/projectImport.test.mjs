import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  companyProjectRow,
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

try {
  const bytes = readFileSync('/home/ubuntu/.cursor/projects/workspace/uploads/overview__3__a29a.xlsx');
  const rows = await readCompanyProjectTable(bytes, 'overview.xlsx');
  assert.ok(rows.length > 20);
  assert.equal(rows[0].number, '10951');
  assert.match(rows[0].name, /Nykirkebakken/);
  assert.equal(rows[0].customerNumber, '10102');
  console.log('projectImport.test.mjs: ok (with sample xlsx)');
} catch (cause) {
  if (cause?.code === 'ENOENT') {
    console.log('projectImport.test.mjs: ok (sample xlsx skipped)');
  } else {
    throw cause;
  }
}
