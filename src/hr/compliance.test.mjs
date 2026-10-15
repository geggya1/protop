import assert from 'node:assert/strict';
import {
  COMPLIANCE_CATALOG,
  amlContractCompleteness,
  companyComplianceOverview,
  complianceSummary,
  ensureEmployeeCompliance,
  syncComplianceFromEvidence,
} from './compliance.js';

assert.ok(COMPLIANCE_CATALOG.length >= 10);
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
    employerName: 'A', employeeName: 'B', workplace: 'C', title: 'D',
    startDate: '2020-01-01', workPercent: '100', salaryAmount: '1',
    workHours: '37.5', noticePeriod: '1 mnd',
  });
  assert.equal(full.pct, 100);
  const empty = amlContractCompleteness({});
  assert.equal(empty.filled, 0);
}

{
  const contract = {
    employeeId: 'e1',
    status: 'active',
    employerName: 'A', employeeName: 'B', workplace: 'C', title: 'D',
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

console.log('hr/compliance.test.mjs ok');
