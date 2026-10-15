import assert from 'node:assert/strict';
import {
  COMPLIANCE_CATALOG,
  amlContractCompleteness,
  complianceSummary,
  ensureEmployeeCompliance,
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

console.log('hr/compliance.test.mjs ok');
