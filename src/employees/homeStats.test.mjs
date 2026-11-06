/**
 * Hovedsiden: mulig tid er stillingsprosent × arbeidsdager uten røde dager.
 * Fakturerbart er kundearbeid. Interntid og fravær trekker faktureringsgraden ned.
 */
import assert from 'node:assert/strict';
import {
  absenceYear, dailyLedger, homeLoadWindow, periodBuckets, productivitySeries, recentProjects, sumLedger, weekWork,
} from './homeStats.js';

const employee = { id: 'e1', company: { workPercent: '100', periodFrom: '2020-01-01' } };
// Torsdag 5. november 2026.
const today = new Date(2026, 10, 5, 12);

{
  const win = homeLoadWindow(today);
  assert.equal(win.fromDate, '2025-11-01');
  assert.equal(win.toDate, '2026-11-08');
}

{
  const week = periodBuckets('week', today);
  assert.equal(week.buckets.length, 7);
  assert.equal(week.buckets[0].from, '2026-11-02');
  assert.equal(week.buckets[0].label, 'Ma');
  const weeks = periodBuckets('weeks12', today);
  assert.equal(weeks.buckets.length, 12);
  assert.equal(weeks.buckets[11].label, 'U45');
  const month = periodBuckets('month', today);
  assert.equal(month.buckets[0].from, '2026-11-01');
  assert.equal(month.buckets[month.buckets.length - 1].to, '2026-11-30');
  assert.equal(periodBuckets('year', today).buckets.length, 12);
}

{
  const ledger = dailyLedger({
    employee,
    fromDate: '2026-11-02',
    toDate: '2026-11-08',
    fullDayHours: 7.5,
    entries: [
      { employeeId: 'e1', date: '2026-11-02', hours: 7.5, billableHours: 6 },
      { employeeId: 'e1', date: '2026-11-03', hours: 7.5, projectId: 'own' },
      { employeeId: 'e2', date: '2026-11-03', hours: 7.5 },
    ],
    absences: [
      { employeeId: 'e1', date: '2026-11-04', hours: 7.5, type: 'ferie' },
      { employeeId: 'e1', date: '2026-11-05', hours: 2, type: 'intern_admin' },
    ],
    isOwnCompany: (row) => row.projectId === 'own',
  });
  const sum = sumLedger(ledger, '2026-11-02', '2026-11-08', { through: '2026-11-05' });
  assert.equal(sum.capacity, 30); // man–tor à 7,5
  assert.equal(sum.planned, 37.5);
  assert.equal(sum.billable, 6);
  assert.equal(sum.other, 1.5 + 7.5 + 2);
  assert.equal(sum.absence, 7.5);
  assert.equal(sum.pct, 20);
  const work = weekWork(ledger, today);
  assert.equal(work.planned, 30); // 37,5 minus ferie
  assert.equal(work.worked, 17);
  // Dag for dag til stolpene: sju dager fra mandag, i dag er markert, summen stemmer.
  assert.deepEqual(work.days.map((d) => d.label), ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']);
  assert.equal(work.days[0].key, '2026-11-02');
  assert.equal(work.days.filter((d) => d.today).length, 1);
  assert.equal(Math.round(work.days.reduce((n, d) => n + d.worked, 0) * 10) / 10, work.worked);
  const series = productivitySeries(ledger, 'week', { today });
  assert.equal(series.bars.length, 7);
  assert.equal(series.bars[5].future, true);
  assert.equal(series.total.billable, 6);
}

{
  // 50 % stilling og 17. mai.
  const ledger = dailyLedger({
    employee: { id: 'e1', company: { workPercent: '50' } }, fromDate: '2026-05-11', toDate: '2026-05-17', fullDayHours: 8,
  });
  assert.equal(sumLedger(ledger, '2026-05-11', '2026-05-17').capacity, 4 * 5 - 4 /* Kristi himmelfart 14. mai */);
}

{
  const result = absenceYear({
    employee,
    today,
    absences: [
      { employeeId: 'e1', date: '2026-07-01', hours: 7.5, type: 'ferie' },
      { employeeId: 'e1', date: '2026-07-02', percent: 100, type: 'ferie' },
      { employeeId: 'e1', date: '2026-03-02', hours: 3.75, type: 'egenmelding' },
      { employeeId: 'e1', date: '2026-03-03', hours: 7.5, type: 'intern_admin' },
      { employeeId: 'e1', date: '2025-12-01', hours: 7.5, type: 'ferie' },
    ],
    fullDayHours: 7.5,
  });
  assert.equal(result.groups.find((g) => g.id === 'ferie').days, 2);
  assert.equal(result.groups.find((g) => g.id === 'egenmelding').days, 0.5);
  assert.equal(result.total, 2.5);
}

{
  const rows = recentProjects({
    employeeId: 'e1',
    since: '2026-08-01',
    projects: [{ id: 'p1', number: '10920', name: 'Fornebubanen', client: 'ALLFUG' }],
    entries: [
      { employeeId: 'e1', projectId: 'p1', date: '2026-10-01', hours: 5 },
      { employeeId: 'e1', projectId: 'p1', date: '2026-10-02', hours: 3 },
      { employeeId: 'e1', projectId: 'p2', projectName: 'Kino', date: '2026-10-03', hours: 2 },
      { employeeId: 'e1', projectId: 'p3', date: '2026-01-03', hours: 20 },
    ],
  });
  assert.deepEqual(rows.map((r) => [r.id, r.hours]), [['p1', 8], ['p2', 2]]);
  assert.equal(rows[0].number, '10920');
}

console.log('employees/homeStats.test.mjs ok');
