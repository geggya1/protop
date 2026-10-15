import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  absenceReportTotals,
  dayRowAsPeriod,
  filterAbsenceReport,
  hydrateAbsenceReportRow,
  sortAbsenceReport,
} from './absenceReport.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const rows = [
  {
    id: 'a1',
    employeeId: 'e1',
    employeeName: 'Ada',
    type: 'ferie',
    date: '2018-06-15',
    hours: 7.5,
    status: 'godkjent',
    description: 'Sommer',
  },
  {
    id: 'a2',
    employeeId: 'e2',
    employeeName: 'Bjørn',
    type: 'syk_melding',
    date: '2022-03-01',
    hours: 8,
    status: 'registrert',
    description: 'Feber',
    percent: 100,
  },
  {
    id: 'a3',
    employeeId: 'e1',
    employeeName: 'Ada',
    type: 'avspasering',
    date: '2026-01-10',
    hours: 4,
    status: 'låst',
    description: 'Avspasering',
  },
].map((row) => hydrateAbsenceReportRow(row));

{
  const all = filterAbsenceReport(rows, { period: 'all' }, new Date('2026-10-14'));
  assert.equal(all.length, 3, 'periode Alle skal vise historiske år');
}

{
  const year = filterAbsenceReport(rows, { period: 'year' }, new Date('2026-10-14'));
  assert.equal(year.length, 1);
  assert.equal(year[0].id, 'a3');
}

{
  const ferie = filterAbsenceReport(rows, { period: 'all', category: 'ferie' }, new Date('2026-10-14'));
  assert.equal(ferie.length, 1);
  assert.equal(ferie[0].type, 'ferie');
}

{
  const search = filterAbsenceReport(rows, { period: 'all', query: 'feber' }, new Date('2026-10-14'));
  assert.equal(search.length, 1);
  assert.equal(search[0].id, 'a2');
}

{
  const custom = filterAbsenceReport(rows, {
    period: 'custom',
    fromDate: '01.01.2018',
    toDate: '31.12.2018',
  }, new Date('2026-10-14'));
  assert.equal(custom.length, 1);
  assert.equal(custom[0].id, 'a1');
}

{
  const sorted = sortAbsenceReport(rows, 'date-asc');
  assert.deepEqual(sorted.map((row) => row.id), ['a1', 'a2', 'a3']);
}

{
  const totals = absenceReportTotals(rows);
  assert.equal(totals.count, 3);
  assert.equal(totals.ferie, 1);
  assert.equal(totals.sykdom, 1);
  assert.equal(totals.annet, 1);
  assert.ok(totals.hours > 0);
}

{
  const period = dayRowAsPeriod(rows[0]);
  assert.equal(period.start, '2018-06-15');
  assert.equal(period.end, '2018-06-15');
  assert.deepEqual(period.ids, ['a1']);
}

{
  // Regression: fraværsrapport crashed with ReferenceError when these were dropped (#289).
  const desktop = readFileSync(join(ROOT, 'screens/arbeid/CompanyAbsenceDesktop.jsx'), 'utf8');
  assert.match(desktop, /const TABLE_MIN_FALLBACK = 720/);
  assert.match(desktop, /const PAGE_STEP = 80/);
  assert.match(desktop, /useState\(PAGE_STEP\)/);
  assert.match(desktop, /TABLE_MIN_FALLBACK/);
}

console.log('absenceReport.test.mjs: ok');
