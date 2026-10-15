import assert from 'node:assert/strict';
import {
  companyProductivity,
  entryProductivity,
  productivityByEmployee,
  summarizeProductivity,
  utilizationBand,
} from './productivity.js';

{
  assert.deepEqual(entryProductivity({ hours: 8, billableHours: 6 }), {
    total: 8, billable: 6, nonBillable: 2,
  });
  assert.deepEqual(entryProductivity({ hours: 8 }), {
    total: 8, billable: 8, nonBillable: 0,
  });
  assert.deepEqual(entryProductivity({ hours: 4, billableHours: 10 }), {
    total: 4, billable: 4, nonBillable: 0,
  });
}

{
  const summary = summarizeProductivity([
    { employeeId: 'a', hours: 10, billableHours: 8 },
    { employeeId: 'a', hours: 5, billableHours: 0 },
    { employeeId: 'b', hours: 8, billableHours: 8 },
  ], { employeeId: 'a' });
  assert.equal(summary.total, 15);
  assert.equal(summary.billable, 8);
  assert.equal(summary.nonBillable, 7);
  assert.equal(summary.utilizationPct, 53.3);
}

{
  assert.equal(utilizationBand(90, 75).id, 'strong');
  assert.equal(utilizationBand(75, 75).id, 'on_target');
  assert.equal(utilizationBand(65, 75).id, 'watch');
  assert.equal(utilizationBand(40, 75).id, 'low');
}

{
  const rows = productivityByEmployee(
    [
      { employeeId: 'a', hours: 40, billableHours: 32 },
      { employeeId: 'b', hours: 40, billableHours: 20 },
    ],
    [
      { id: 'a', person: { firstName: 'Ada' }, extras: { timeSettings: { utilizationTarget: 80 } } },
      { id: 'b', person: { firstName: 'Bo' } },
    ],
  );
  assert.equal(rows[0].employeeId, 'a');
  assert.equal(rows[0].utilizationPct, 80);
  assert.equal(rows[0].targetPct, 80);
  assert.equal(rows[1].utilizationPct, 50);
  assert.equal(rows[1].band.id, 'low');
}

{
  const company = companyProductivity([
    { hours: 10, billableHours: 7 },
    { hours: 10, billableHours: 9 },
  ]);
  assert.equal(company.total, 20);
  assert.equal(company.billable, 16);
  assert.equal(company.utilizationPct, 80);
  assert.equal(company.band.id, 'on_target');
}

console.log('hr/productivity.test.mjs ok');
