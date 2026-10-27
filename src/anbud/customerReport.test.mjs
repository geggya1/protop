import assert from 'node:assert/strict';
import {
  CUSTOMER_REPORT_COLUMNS,
  NO_OWNER,
  customerInvoiceStats,
  customerKindCounts,
  customerKindMatches,
  customerOwnerOptions,
  customerReportRows,
  customerReportSummary,
  filterCustomerReport,
  invoiceCustomerMatcher,
} from './customerReport.js';
import { reportExportRows, reportTotals, sortReportRows, visibleColumns } from '../ui/reportTable.js';

const NOW = new Date('2026-10-27T12:00:00Z');

const customers = [
  { id: 'c1', customerNumber: '10001', name: 'Ryfylke Eiendom AS', kind: 'org', orgnr: '983858635', place: 'Sandnes', ownerUid: 'u1', ownerName: 'Kari' },
  { id: 'c2', customerNumber: '10002', name: 'Sandnes Kommune', kind: 'org', orgnr: '964965137', place: 'Sandnes' },
  { id: 'c3', customerNumber: '10003', name: 'Ola Nordmann', kind: 'person', personnummer: '01019012345', address: 'Gate 1', postalCode: '4306', place: 'Sandnes', phone: '99999999', ownerUid: 'u2' },
  { id: 'c4', customerNumber: '10004', name: 'Uten Org AS', kind: 'org' },
];
const people = [{ uid: 'u1', name: 'Kari Nordmann', role: 'adult' }, { uid: 'u2', name: 'Per Hansen', role: 'adult' }];
const projects = [
  { id: 'p1', customerId: 'c1', number: '1' },
  { id: 'p2', customerId: 'c1', number: '2' },
  { id: 'p3', customerNumber: '10002', number: '3' },
  { id: 'p4', customerId: 'c1', number: '4', status: 'arkivert' },
];
const contracts = [{ id: 'k1', customerId: 'c2' }, { id: 'k2', buyer: 'Sandnes Kommune' }];
const invoices = [
  { id: 'i1', customerId: 'c1', invoiceDate: '2026-10-06', dueDate: '2026-10-20', amountExVat: 1000, outstandingAmount: 1250, status: 'sent' },
  { id: 'i2', customerNumber: '10002', invoiceDate: '2026-09-01', dueDate: '2099-12-01', amountExVat: '4 000,00', outstandingAmount: 500, status: 'sent' },
  { id: 'i3', orgnr: '964965137', invoiceDate: '2025-12-01', amountExVat: 800, outstandingAmount: 0, status: 'paid' },
  { id: 'i4', customerName: 'ola nordmann', invoiceDate: '2026-02-01', amountExVat: 300, status: 'paid', outstanding: 'Paid' },
  { id: 'i5', customerId: 'ukjent', customerName: 'Ryfylke Eiendom AS', invoiceDate: '2026-10-01', amountExVat: 999 },
];

// Faktura til kunde: id, så kundenummer, org.nr og navn. En ukjent id kobles ikke på navnet.
const match = invoiceCustomerMatcher(customers);
assert.deepEqual(invoices.map(match), ['c1', 'c2', 'c2', 'c3', '']);

// Fakturatall per kunde, også for en periode.
const all = customerInvoiceStats(customers, invoices, { now: NOW });
assert.deepEqual(all.get('c1'), { count: 1, exVat: 1000, outstanding: 1250, overdue: 1250, lastDate: '2026-10-06' });
assert.deepEqual(all.get('c2'), { count: 2, exVat: 4800, outstanding: 500, overdue: 0, lastDate: '2026-09-01' });
assert.equal(all.has('c4'), false);
const thisYear = customerInvoiceStats(customers, invoices, { period: 'year', now: NOW });
assert.equal(thisYear.get('c2').count, 1);
assert.equal(thisYear.get('c2').exVat, 4000);

// Rapportrader: type, identitet, prosjekter, avtaler, ansvarlig, mangler og fakturatall.
const rows = customerReportRows(customers, { projects, contracts, invoices, people, now: NOW });
const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
assert.equal(byId.c1.kindLabel, 'Virksomhet');
assert.equal(byId.c1.identity, '983 858 635');
assert.equal(byId.c3.identity, '******12345');
assert.equal(byId.c1.projectCount, 2, 'arkivert prosjekt telles ikke');
assert.equal(byId.c2.projectCount, 1);
assert.equal(byId.c2.agreementCount, 2);
assert.equal(byId.c1.owner, 'Kari Nordmann');
assert.deepEqual(byId.c4.gaps, ['Mangler organisasjonsnummer.']);
assert.equal(byId.c4.invoiceCount, 0);
assert.equal(byId.c4.invoiced, 0);
assert.equal(byId.c1.lastInvoice, '2026-10-06');
const noInvoices = customerReportRows(customers, { projects, contracts, people });
assert.equal(noInvoices[0].invoiced, null, 'uten tilgang til Faktura: ingen fakturatall');

// Filtre: ansvarlig, prosjekt, faktura, søk og type.
const ids = (list) => list.map((row) => row.id);
assert.deepEqual(ids(filterCustomerReport(rows, { owner: 'u1' })), ['c1']);
assert.deepEqual(ids(filterCustomerReport(rows, { owner: NO_OWNER })), ['c2', 'c4']);
assert.deepEqual(ids(filterCustomerReport(rows, { project: 'with' })), ['c1', 'c2']);
assert.deepEqual(ids(filterCustomerReport(rows, { project: 'without' })), ['c3', 'c4']);
assert.deepEqual(ids(filterCustomerReport(rows, { invoice: 'invoiced' })), ['c1', 'c2', 'c3']);
assert.deepEqual(ids(filterCustomerReport(rows, { invoice: 'notInvoiced' })), ['c4']);
assert.deepEqual(ids(filterCustomerReport(rows, { invoice: 'outstanding' })), ['c1', 'c2']);
assert.deepEqual(ids(filterCustomerReport(rows, { invoice: 'overdue' })), ['c1']);
assert.deepEqual(ids(filterCustomerReport(rows, { query: 'per hansen' })), ['c3'], 'søk i ansvarlig');
assert.deepEqual(ids(rows.filter((row) => customerKindMatches(row, 'person'))), ['c3']);
assert.deepEqual(customerKindCounts(rows), { '': 4, org: 3, person: 1 });
assert.deepEqual(customerOwnerOptions(rows), [
  { id: NO_OWNER, label: 'Uten ansvarlig' },
  { id: 'u1', label: 'Kari Nordmann' },
  { id: 'u2', label: 'Per Hansen' },
]);
assert.deepEqual(customerReportSummary(rows), { count: 4, projects: 3, invoiced: 6100, outstanding: 1750 });

// Tabellen: standardkolonner, sortering, sum og eksport.
const shown = visibleColumns(CUSTOMER_REPORT_COLUMNS, []);
assert.deepEqual(shown.map((col) => col.key), [
  'customerNumber', 'name', 'identity', 'projectCount', 'invoiced', 'outstanding',
  'address', 'place', 'contactName', 'email', 'phone', 'owner',
]);
assert.deepEqual(ids(sortReportRows(rows, { key: 'invoiced', dir: 'desc' }, CUSTOMER_REPORT_COLUMNS)), ['c2', 'c1', 'c3', 'c4']);
assert.deepEqual(ids(sortReportRows(rows, { key: 'projectCount', dir: 'desc' }, CUSTOMER_REPORT_COLUMNS)), ['c1', 'c2', 'c3', 'c4']);
assert.deepEqual(reportTotals(rows, shown), { invoiced: 6100, outstanding: 1750 });
const sheet = reportExportRows(rows, CUSTOMER_REPORT_COLUMNS);
assert.equal(sheet[0][0], 'Nr');
assert.ok(sheet[0].includes('Mangler for faktura'));
assert.equal(sheet[4][sheet[0].indexOf('Mangler for faktura')], 'Mangler organisasjonsnummer.');
assert.equal(sheet[1][sheet[0].indexOf('Fakturert eks. mva')], 1000);

console.log('customerReport.test.mjs: ok');
