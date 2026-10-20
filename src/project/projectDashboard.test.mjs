import assert from 'node:assert/strict';
import {
  expenseSummaryForProject,
  hoursByMonth,
  hoursChartForOverview,
  projectDashboardKpis,
  projectPeriodProgress,
  salesSummaryForProject,
} from './projectDashboard.js';

{
  const bars = hoursByMonth([
    { date: '2025-01-10', hours: 2 },
    { date: '2025-01-12', hours: 3 },
    { date: '2025-03-01', hours: 10 },
  ], 3, new Date('2025-03-15'));
  assert.equal(bars.length, 3);
  assert.equal(bars[0].key, '2025-01');
  assert.equal(bars[0].hours, 5);
  assert.equal(bars[2].hours, 10);
}

{
  const exp = expenseSummaryForProject([
    { projectId: 'a', amountExVat: 100, status: 'approved' },
    { projectId: 'a', amountExVat: 50, status: 'invoiced' },
    { projectId: 'b', amountExVat: 999, status: 'draft' },
  ], 'a');
  assert.equal(exp.count, 2);
  assert.equal(exp.total, 150);
  assert.equal(exp.unbilled, 100);
  assert.equal(exp.billed, 50);
}

{
  const sales = salesSummaryForProject([
    { projectId: 'a', amountExVat: 200, costExVat: 50, quantity: 2, status: 'draft' },
  ], 'a');
  assert.equal(sales.total, 200);
  assert.equal(sales.margin, 50);
}

{
  const kpis = projectDashboardKpis({
    cross: { honorarAmount: 1000, totals: { amountExVat: 400 } },
    summary: { hours: 10 },
    members: [{ id: 1 }, { id: 2 }],
    project: { projectStatus: 'Under arbeid', totalPlanned: 20 },
  });
  assert.equal(kpis.invoicedPct, 40);
  assert.equal(kpis.hoursPct, 50);
  assert.equal(kpis.memberCount, 2);
}

{
  const empty = projectPeriodProgress('', '2025-12-01');
  assert.equal(empty.ready, false);
  const mid = projectPeriodProgress('2025-01-01', '2025-12-31', new Date('2025-07-01'));
  assert.equal(mid.ready, true);
  assert.ok(mid.pct >= 45 && mid.pct <= 55);
}

{
  const chart = hoursChartForOverview([
    { date: '2024-03-01', hours: 8 },
    { date: '2024-06-01', hours: 4 },
  ], new Date('2025-04-01'));
  assert.equal(chart.fallback, true);
  assert.equal(chart.titleYear, 2024);
  assert.equal(chart.total, 12);
}

console.log('projectDashboard.test.mjs: ok');
