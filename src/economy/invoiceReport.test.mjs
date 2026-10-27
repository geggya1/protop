import assert from 'node:assert/strict';
import { filterInvoicesByPeriod } from './invoices.js';
import {
  INVOICE_PERIODS,
  INVOICE_REPORT_COLUMNS,
  filterInvoiceReport,
  invoiceCustomerKey,
  invoiceDaysOverdue,
  invoiceFilterOptions,
  invoiceProjectKey,
  invoiceReportStatus,
  invoiceReportSummary,
  invoiceStatusChoices,
} from './invoiceReport.js';
import {
  matchesColumnFilters,
  reportExportRows,
  reportTotals,
  sortReportRows,
  visibleColumns,
} from '../ui/reportTable.js';

const TODAY = '2026-10-27';
const NOW = new Date('2026-10-27T12:00:00Z');

const invoices = [
  {
    id: 'i1', invoiceNumber: '10001', invoiceDate: '2026-10-06', dueDate: '2026-10-20',
    customerId: 'c-ry', customerNumber: '10231', customerName: 'RYFYLKE EIENDOM AS',
    projectId: 'p-gol', projectNumber: '10869', projectName: 'Golhaug VVA',
    amountExVat: 1000, vat: 250, amountInclVat: 1250, outstandingAmount: 1250, status: 'sent', sent: 'sent',
  },
  {
    id: 'i2', invoiceNumber: '10002', invoiceDate: '2026-09-01', dueDate: '2026-09-15',
    customerNumber: '10025', customerName: 'Sandnes Kommune', projectNumber: '10857', projectName: 'Skolevei',
    amountExVat: 4000, vat: 1000, amountInclVat: 5000, outstanding: 'Paid', paidAt: '2026-09-10', status: 'paid',
  },
  {
    id: 'i3', invoiceNumber: '10003', invoiceDate: '2025-12-01', dueDate: '2025-12-15',
    customerName: 'AS Betong', amountExVat: 800, vat: 200, amountInclVat: 1000, outstandingAmount: 0, status: 'paid',
  },
  {
    id: 'i4', invoiceNumber: '10004', invoiceDate: '2026-10-25', dueDate: '2026-11-08',
    customerId: 'c-ry', customerNumber: '10231', customerName: 'RYFYLKE EIENDOM AS',
    amountExVat: 200, vat: 50, amountInclVat: 250, status: 'draft', exportStatus: 'Utkast',
  },
];

// Status: sendt faktura etter forfall uten betaling er forfalt. Betalt og utkast endres ikke.
assert.equal(invoiceReportStatus(invoices[0], TODAY), 'overdue');
assert.equal(invoiceReportStatus(invoices[0], '2026-10-19'), 'sent');
assert.equal(invoiceReportStatus(invoices[1], TODAY), 'paid');
assert.equal(invoiceReportStatus(invoices[3], TODAY), 'draft');
assert.equal(invoiceReportStatus({}, TODAY), 'registered');
assert.equal(invoiceDaysOverdue(invoices[0], TODAY), 7);
assert.equal(invoiceDaysOverdue(invoices[1], TODAY), null);

// Statusvalg med antall. Statuser uten fakturaer vises ikke.
assert.deepEqual(invoiceStatusChoices(invoices, TODAY).map((row) => `${row.id}:${row.count}`), [':4', 'overdue:1', 'paid:2', 'draft:1']);

// Kunde og prosjekt: nøkkel på id, så nummer, så navn. Valgene er unike og sortert.
assert.equal(invoiceCustomerKey(invoices[0]), 'id:c-ry');
assert.equal(invoiceCustomerKey(invoices[1]), 'nr:10025');
assert.equal(invoiceCustomerKey(invoices[2]), 'navn:asbetong');
assert.equal(invoiceProjectKey(invoices[2]), '');
const options = invoiceFilterOptions(invoices);
assert.deepEqual(options.customers.map((row) => row.label), ['10025 · Sandnes Kommune', '10231 · RYFYLKE EIENDOM AS', 'AS Betong']);
assert.deepEqual(options.projects.map((row) => row.id), ['nr:10857', 'id:p-gol']);

// Filtre: kunde, prosjekt, søk og periode.
const ids = (rows) => rows.map((row) => row.id);
assert.deepEqual(ids(filterInvoiceReport(invoices, { customer: 'id:c-ry' }, NOW)), ['i1', 'i4']);
assert.deepEqual(ids(filterInvoiceReport(invoices, { project: 'nr:10857' }, NOW)), ['i2']);
assert.deepEqual(ids(filterInvoiceReport(invoices, { query: 'betong' }, NOW)), ['i3']);
assert.deepEqual(ids(filterInvoiceReport(invoices, { period: 'year' }, NOW)), ['i1', 'i2', 'i4']);
assert.deepEqual(ids(filterInvoiceReport(invoices, { period: 'lastYear' }, NOW)), ['i3']);
assert.deepEqual(ids(filterInvoiceReport(invoices, { period: '365' }, NOW)), ['i1', 'i2', 'i3', 'i4']);
assert.deepEqual(ids(filterInvoiceReport(invoices, { period: '30' }, NOW)), ['i1', 'i4']);
assert.deepEqual(ids(filterInvoicesByPeriod(invoices, 'lastYear', new Date('2027-01-02T12:00:00Z'))), ['i1', 'i2', 'i4']);
assert.ok(INVOICE_PERIODS.some((row) => row.id === 'lastYear'));

// Sum over linjen: beløp, utestående og forfalt.
assert.deepEqual(invoiceReportSummary(invoices, TODAY), {
  count: 4, exVat: 6000, inclVat: 7500, outstanding: 1250, overdueCount: 1, overdueAmount: 1250,
});

// Kolonnene i tabellen: filter, sortering, sum og eksport.
const shown = visibleColumns(INVOICE_REPORT_COLUMNS, []);
assert.deepEqual(shown.map((col) => col.key), [
  'invoiceNumber', 'docs', 'invoiceDate', 'dueDate', 'customerNumber', 'customerName', 'projectNumber',
  'projectName', 'status', 'amountExVat', 'vat', 'amountInclVat', 'outstanding',
]);
assert.deepEqual(ids(invoices.filter((row) => matchesColumnFilters(row, { dueDate: '20.10' }, shown))), ['i1']);
assert.deepEqual(ids(invoices.filter((row) => matchesColumnFilters(row, { status: 'betalt' }, shown))), ['i2', 'i3']);
assert.deepEqual(ids(invoices.filter((row) => matchesColumnFilters(row, { customerName: 'ryfylke' }, shown))), ['i1', 'i4']);
assert.deepEqual(ids(sortReportRows(invoices, { key: 'amountInclVat', dir: 'desc' }, INVOICE_REPORT_COLUMNS)), ['i2', 'i1', 'i3', 'i4']);
assert.deepEqual(ids(sortReportRows(invoices, { key: 'invoiceDate', dir: 'asc' }, INVOICE_REPORT_COLUMNS)), ['i3', 'i2', 'i1', 'i4']);
assert.deepEqual(ids(sortReportRows(invoices, { key: 'outstanding', dir: 'desc' }, INVOICE_REPORT_COLUMNS)), ['i1', 'i2', 'i3', 'i4'], 'betalt (0) før ukjent');
assert.deepEqual(reportTotals(invoices, shown), { amountExVat: 6000, vat: 1500, amountInclVat: 7500, outstanding: 1250 });
assert.deepEqual(reportTotals(invoices, visibleColumns(INVOICE_REPORT_COLUMNS, ['loss'])), { loss: 0 }, 'Tap ligger under «Kolonner»');
const sheet = reportExportRows(invoices, INVOICE_REPORT_COLUMNS);
assert.equal(sheet[0].includes('PDF'), false, 'PDF-ikonet eksporteres ikke');
assert.equal(sheet[0].includes('KID'), true, 'eksporten har alle kolonner, også skjulte');
const header = sheet[0];
assert.equal(sheet[1][header.indexOf('Fakturadato')], '06.10.2026');
assert.equal(sheet[1][header.indexOf('Ink. mva')], 1250);
assert.equal(sheet[2][header.indexOf('Utestående')], 0);
assert.equal(sheet[4][header.indexOf('Utestående')], '');

console.log('invoiceReport.test.mjs: ok');
