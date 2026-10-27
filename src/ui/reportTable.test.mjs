import assert from 'node:assert/strict';
import {
  compareByColumn,
  defaultVisibleKeys,
  foldReportText,
  hasColumnFilter,
  matchesColumnFilters,
  nextReportSort,
  normalizeVisibleKeys,
  parseStoredKeys,
  reportExportRows,
  reportMinWidth,
  reportPrefsKey,
  reportTotals,
  sortReportRows,
  toggleColumnKey,
  visibleColumns,
} from './reportTable.js';

const COLUMNS = [
  { key: 'number', label: 'Nr', width: 80 },
  { key: 'name', label: 'Navn', width: 200, flex: 1 },
  { key: 'date', label: 'Dato', width: 100, kind: 'date', text: (row) => (row.date ? row.date.split('-').reverse().join('.') : '') },
  { key: 'amount', label: 'Beløp', width: 120, kind: 'money', text: (row) => (row.amount == null ? '' : `kr ${row.amount}`) },
  { key: 'notes', label: 'Notat', width: 200, defaultVisible: false },
  { key: 'secret', label: 'Hemmelig', width: 50, export: false },
];

const rows = [
  { id: 'a', number: '10', name: 'Ålesund Bygg', date: '2026-10-27', amount: 1500, notes: 'Viktig' },
  { id: 'b', number: '9', name: 'Bergen Rør', date: '', amount: null, notes: '' },
  { id: 'c', number: '100', name: 'Arendal Elektro', date: '2026-01-05', amount: -200, notes: '' },
];

// Kolonnevalg: standard, lagring, ukjente nøkler og minst én kolonne.
assert.deepEqual(defaultVisibleKeys(COLUMNS), ['number', 'name', 'date', 'amount', 'secret']);
assert.deepEqual(normalizeVisibleKeys(COLUMNS, ['amount', 'ukjent', 'number']), ['number', 'amount'], 'definert rekkefølge');
assert.deepEqual(normalizeVisibleKeys(COLUMNS, ['ukjent']), defaultVisibleKeys(COLUMNS));
assert.deepEqual(parseStoredKeys(COLUMNS, JSON.stringify({ visible: ['notes', 'name'] })), ['name', 'notes']);
assert.deepEqual(parseStoredKeys(COLUMNS, '{ødelagt'), defaultVisibleKeys(COLUMNS));
assert.deepEqual(parseStoredKeys(COLUMNS, null), defaultVisibleKeys(COLUMNS));
assert.deepEqual(toggleColumnKey(COLUMNS, ['number', 'name'], 'notes', true), ['number', 'name', 'notes']);
assert.deepEqual(toggleColumnKey(COLUMNS, ['number'], 'number', false), ['number'], 'siste kolonne blir stående');
assert.deepEqual(visibleColumns(COLUMNS, ['name', 'amount']).map((col) => col.key), ['name', 'amount']);
assert.equal(reportMinWidth(visibleColumns(COLUMNS, ['name', 'amount']), 44), 364);
assert.equal(reportPrefsKey('invoices', 'u1'), 'protop.report.invoices.columns.v1.u1');
assert.equal(reportPrefsKey('invoices', ''), 'protop.report.invoices.columns.v1.anon');

// Filter per kolonne treffer visning og råverdi, uten hensyn til store bokstaver og æøå.
assert.equal(foldReportText('Ålesund Bygg'), 'alesundbygg');
assert.equal(hasColumnFilter({ name: '  ' }), false);
assert.equal(hasColumnFilter({ name: 'b' }), true);
const hit = (filters) => rows.filter((row) => matchesColumnFilters(row, filters, COLUMNS)).map((row) => row.id);
assert.deepEqual(hit({ name: 'ålesund' }), ['a']);
assert.deepEqual(hit({ date: '27.10' }), ['a'], 'visning dd.mm');
assert.deepEqual(hit({ date: '2026-01' }), ['c'], 'råverdi ISO');
assert.deepEqual(hit({ amount: '1500' }), ['a']);
assert.deepEqual(hit({ name: 'r', number: '9' }), ['b'], 'flere filtre samtidig');
assert.deepEqual(hit({}), ['a', 'b', 'c']);

// Sortering: tall som tall, tekst med tall riktig, tomme nederst i begge retninger.
const sorted = (sort) => sortReportRows(rows, sort, COLUMNS).map((row) => row.id);
assert.deepEqual(sorted({ key: 'number', dir: 'asc' }), ['b', 'a', 'c']);
assert.deepEqual(sorted({ key: 'number', dir: 'desc' }), ['c', 'a', 'b']);
assert.deepEqual(sorted({ key: 'amount', dir: 'desc' }), ['a', 'c', 'b']);
assert.deepEqual(sorted({ key: 'amount', dir: 'asc' }), ['c', 'a', 'b'], 'tom verdi nederst også stigende');
assert.deepEqual(sorted({ key: 'date', dir: 'desc' }), ['a', 'c', 'b']);
assert.deepEqual(sorted({ key: 'name', dir: 'asc' }), ['c', 'b', 'a'], 'Å sist');
assert.deepEqual(sorted(null), ['a', 'b', 'c']);
assert.equal(compareByColumn(rows[0], rows[1], { key: 'ukjent' }, COLUMNS), 0);

// Ny kolonne: dato og beløp synkende, tekst stigende. Samme kolonne snur.
assert.deepEqual(nextReportSort({ key: 'name', dir: 'asc' }, COLUMNS[3]), { key: 'amount', dir: 'desc' });
assert.deepEqual(nextReportSort({ key: 'amount', dir: 'desc' }, COLUMNS[3]), { key: 'amount', dir: 'asc' });
assert.deepEqual(nextReportSort(null, COLUMNS[1]), { key: 'name', dir: 'asc' });

// Eksport: overskrift, beløp som tall, tomme som tom celle, kolonner med export: false utelates.
const table = reportExportRows(rows, COLUMNS);
assert.deepEqual(table[0], ['Nr', 'Navn', 'Dato', 'Beløp', 'Notat']);
assert.deepEqual(table[1], ['10', 'Ålesund Bygg', '27.10.2026', 1500, 'Viktig']);
assert.deepEqual(table[2], ['9', 'Bergen Rør', '', '', '']);
assert.equal(table.length, 4);

// Sum for beløpskolonner.
assert.deepEqual(reportTotals(rows, COLUMNS), { amount: 1300 });
assert.deepEqual(reportTotals([], COLUMNS), { amount: 0 });

console.log('reportTable.test.mjs: ok');
