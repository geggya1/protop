import assert from 'node:assert/strict';
import {
  COMPLIANCE_CATALOG,
  MOVED_TO_ISO,
  amlContractCompleteness,
  companyComplianceOverview,
  complianceSummary,
  ensureEmployeeCompliance,
  replaceEmployeeCompliance,
  syncComplianceFromEvidence,
} from './compliance.js';

// Bare det HR eier: arbeidsmiljøloven og personvern. Kompetanse og opplæring ligger i ISO.
assert.equal(COMPLIANCE_CATALOG.length, 6);
assert.ok(COMPLIANCE_CATALOG.every((row) => ['aml', 'gdpr'].includes(row.source)));
assert.ok(!COMPLIANCE_CATALOG.some((row) => MOVED_TO_ISO.some((moved) => moved.id === row.id)));
assert.ok(COMPLIANCE_CATALOG.some((row) => row.id === 'aml_written_contract' && row.required));

{
  const rows = ensureEmployeeCompliance([], 'e1');
  assert.equal(rows.length, COMPLIANCE_CATALOG.length);
  assert.ok(rows.every((row) => row.employeeId === 'e1'));
  assert.ok(rows.every((row) => row.status === 'missing'));
  const patched = rows.map((row, i) => (i < 3 ? { ...row, status: 'ok' } : row));
  const summary = complianceSummary(patched);
  assert.ok(summary.total >= 3);
  assert.equal(summary.ok, patched.filter((r) => {
    const cat = COMPLIANCE_CATALOG.find((c) => c.id === r.catalogId);
    return cat?.required && r.status === 'ok';
  }).length);
}

{
  const full = amlContractCompleteness({
    employerName: 'A', employeeName: 'B', workplace: 'C', positionTitle: 'D',
    startDate: '2020-01-01', workPercent: '100', salaryAmount: '1',
    workHours: '37.5', noticePeriod: '1 mnd',
  });
  assert.equal(full.pct, 100);
  const empty = amlContractCompleteness({});
  assert.equal(empty.filled, 0);
  // Dokumenttittel alene skal ikke telle som stilling
  assert.equal(amlContractCompleteness({ title: 'Arbeidsavtale' }).filled, 0);
}

{
  const contract = {
    employeeId: 'e1',
    status: 'active',
    employerName: 'A', employeeName: 'B', workplace: 'C', positionTitle: 'D',
    startDate: '2020-01-01', workPercent: '100', salaryAmount: '1',
    workHours: '37.5', noticePeriod: '1 mnd', probationMonths: '6',
  };
  const synced = syncComplianceFromEvidence([], {
    employeeId: 'e1',
    contracts: [contract],
    reviews: [{ employeeId: 'e1', status: 'done' }],
  });
  const byId = Object.fromEntries(synced.map((row) => [row.catalogId, row]));
  assert.equal(byId.aml_written_contract.status, 'ok');
  assert.equal(byId.aml_contract_minimum.status, 'ok');
  assert.equal(byId.aml_probation_documented.status, 'ok');
  assert.equal(byId.aml_followup_dialogue.status, 'ok');
}

{
  const overview = companyComplianceOverview(
    [{ id: 'e1', company: { status: 'active' } }, { id: 'e2', company: { status: 'deleted' } }],
    [],
  );
  assert.equal(overview.length, 1);
  assert.ok(overview[0].missing > 0);
}

{
  const contract = {
    employeeId: 'e1',
    status: 'active',
    employerName: 'A', employeeName: 'B', workplace: 'C', positionTitle: 'D',
    startDate: '2020-01-01', workPercent: '100', salaryAmount: '1',
    workHours: '37.5', noticePeriod: '1 mnd', probationMonths: '6',
  };
  const withEvidence = companyComplianceOverview(
    [{ id: 'e1', company: { status: 'active' } }],
    [],
    { contracts: [contract], reviews: [{ employeeId: 'e1', status: 'done' }], applyEvidence: true },
  );
  const withoutEvidence = companyComplianceOverview(
    [{ id: 'e1', company: { status: 'active' } }],
    [],
    { contracts: [contract], reviews: [{ employeeId: 'e1', status: 'done' }], applyEvidence: false },
  );
  assert.ok(withEvidence[0].missing < withoutEvidence[0].missing);
  assert.ok(withEvidence[0].ok > 0);
}

{
  // Punkter flyttet til ISO: lagrede rader blir stående når personens sjekkliste lagres.
  const stored = [
    { catalogId: 'ik_hms_intro', employeeId: 'e1', status: 'ok', note: 'Kurs 2024' },
    { catalogId: 'iso45001_ppe', employeeId: 'e1', status: 'ok', source: 'iso45001' },
    { catalogId: 'ik_hms_intro', employeeId: 'e2', status: 'ok' },
  ];
  const synced = syncComplianceFromEvidence(stored, { employeeId: 'e1' });
  assert.ok(synced.some((row) => row.catalogId === 'ik_hms_intro' && row.employeeId === 'e1' && row.note === 'Kurs 2024'));
  assert.ok(synced.some((row) => row.catalogId === 'ik_hms_intro' && row.employeeId === 'e2'));
  const rows = ensureEmployeeCompliance(stored, 'e1');
  assert.equal(rows.length, COMPLIANCE_CATALOG.length);
  assert.ok(!rows.some((row) => row.catalogId === 'ik_hms_intro'));
  // Verneutstyr hører nå til arbeidsmiljøloven, også for rader lagret med gammel kilde.
  assert.equal(rows.find((row) => row.catalogId === 'iso45001_ppe').source, 'aml');
  const replaced = replaceEmployeeCompliance(stored, 'e1', rows);
  assert.equal(replaced.filter((row) => row.catalogId === 'ik_hms_intro').length, 2);
  assert.equal(replaced.filter((row) => row.catalogId === 'iso45001_ppe').length, 1);
  assert.equal(replaced.filter((row) => row.employeeId === 'e1').length, COMPLIANCE_CATALOG.length + 1);
}

console.log('hr/compliance.test.mjs ok');
