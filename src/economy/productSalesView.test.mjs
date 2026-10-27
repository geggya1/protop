import assert from 'node:assert/strict';
import { emptyProduct, saleFromProduct } from './products.js';
import { upsertProduct, upsertSale } from './opsState.js';
import { filterProductSales, productSalesForViewer } from './productSalesView.js';

const catalog = upsertProduct(
  { products: [], sales: [] },
  emptyProduct({ name: 'Hansker', sku: 'H-1', priceExVat: 120 }),
);
const product = catalog.product;
const sold = upsertSale(
  { products: [product], sales: [] },
  saleFromProduct(product, {
    date: '2026-10-16',
    quantity: 2,
    customerName: 'CONSULT1 AS',
    customerNumber: '1001',
    projectName: 'Verksted',
    projectNumber: '42',
  }),
);
const timesheet = upsertSale(sold.state, {
  date: '2026-09-01',
  name: 'Eget salg',
  employeeId: 'emp-1',
  customerName: 'Annen kunde',
  quantity: 1,
  unitPrice: 50,
});
const other = upsertSale(timesheet.state, {
  date: '2026-10-01',
  name: 'Kollegaens salg',
  employeeId: 'emp-2',
  quantity: 1,
  unitPrice: 10,
});

const mine = productSalesForViewer(other.state.sales, 'emp-1', { scope: 'mine' });
assert.deepEqual(mine.map((row) => row.name), ['Hansker', 'Eget salg']);
assert.equal(mine[0].customerName, 'CONSULT1 AS');
assert.equal(mine[0].sku, 'H-1');

const found = filterProductSales(mine, 'consult1');
assert.equal(found.length, 1);
assert.equal(found[0].name, 'Hansker');

const bySku = filterProductSales(mine, 'h-1');
assert.equal(bySku[0].projectNumber, '42');

const drafts = filterProductSales(mine, '', 'draft');
assert.equal(drafts.length, 2);
assert.equal(filterProductSales(mine, '', 'invoiced').length, 0);
assert.equal(filterProductSales(mine, 'finnes-ikke').length, 0);

const everyone = productSalesForViewer(other.state.sales, '');
assert.equal(everyone.length, 3);

// Sortering, filter, lås, prosjektkobling og eksport.
const {
  productSalesExportRows,
  productSalesToCsv,
  saleFilterOptions,
  saleIsLocked,
  saleProjectKey,
  saleTotals,
  salesForProject,
  sortProductSales,
} = await import('./productSalesView.js');

const table = productSalesForViewer([
  { id: 's1', date: '2026-10-15', name: 'Fremleie', quantity: 3, unitPrice: 100, customerName: 'Løyning AS', projectId: 'p1', projectNumber: '10844', projectName: 'Fremleie kontor', status: 'invoiced', invoiceId: 'inv-1' },
  { id: 's2', date: '2026-08-31', name: 'Dronefotografering', quantity: 1, unitPrice: 2000, customerName: 'Sandnes Kommune', projectId: 'p2', projectNumber: '10427', projectName: 'SHA', status: 'approved' },
  { id: 's3', date: '2026-07-16', name: 'Dronefotografering', quantity: 0.5, unitPrice: 2000, customerName: 'Sandnes Kommune', projectNumber: '10427', projectName: 'SHA', status: 'draft' },
  { id: 's4', date: '', name: 'Uten dato', quantity: 1, unitPrice: 10 },
]);

assert.deepEqual(sortProductSales(table, { key: 'date', dir: 'desc' }).map((row) => row.id), ['s1', 's2', 's3', 's4'], 'nyeste først, tom dato sist');
assert.deepEqual(sortProductSales(table, { key: 'date', dir: 'asc' }).map((row) => row.id), ['s3', 's2', 's1', 's4'], 'tom dato sist også stigende');
assert.deepEqual(sortProductSales(table, { key: 'amount', dir: 'desc' }).map((row) => row.id), ['s2', 's3', 's1', 's4']);
assert.deepEqual(sortProductSales(table, { key: 'quantity', dir: 'asc' }).map((row) => row.id), ['s3', 's2', 's4', 's1']);
assert.deepEqual(sortProductSales(table, { key: 'status', dir: 'asc' }).map((row) => row.status), ['draft', 'draft', 'approved', 'invoiced']);
assert.equal(sortProductSales(table, { key: 'customer', dir: 'asc' })[0].customerName, 'Løyning AS');
assert.notEqual(sortProductSales(table, { key: 'name' }), table, 'sortering lager ny liste');

assert.equal(saleIsLocked(table.find((row) => row.id === 's1')), true);
assert.equal(saleIsLocked({ status: 'approved', invoiceId: 'inv-2' }), true, 'faktura-id låser også');
assert.equal(saleIsLocked(table.find((row) => row.id === 's2')), false);

const options = saleFilterOptions(table);
assert.deepEqual(options.projects.map((row) => row.id), ['nr:10427', 'nr:10844'], 'samme prosjektnummer er ett valg');
assert.equal(options.projects[0].hint, '2 salg');
assert.equal(options.projects[1].label, '#10844 Fremleie kontor');
assert.equal(options.customers.find((row) => row.label === 'Sandnes Kommune').hint, '2 salg');
assert.equal(filterProductSales(table, '', '', { project: 'nr:10427' }).length, 2);
assert.equal(saleProjectKey({ projectId: 'p7' }), 'id:p7');
assert.equal(saleProjectKey({ projectName: 'Uten Nummer' }), 'navn:uten nummer');
assert.equal(filterProductSales(table, 'drone', 'draft', { customer: 'navn:sandnes kommune' }).length, 1);

const totals = saleTotals(table);
assert.equal(totals.exVat, 300 + 2000 + 1000 + 10);
assert.equal(totals.invoiced, 300);
assert.equal(totals.open, 3010);

// Prosjektet ser salg med prosjekt-id, og rader uten id med samme prosjektnummer.
const onProject = salesForProject(table, { id: 'p2', number: '10427' });
assert.deepEqual(onProject.map((row) => row.id).sort(), ['s2', 's3']);
assert.equal(onProject.find((row) => row.id === 's3').projectId, 'p2');
assert.equal(salesForProject(table, { id: 'p9', number: '' }).length, 0);

const exported = productSalesExportRows([table[0]]);
assert.equal(exported[0][0], 'Dato');
assert.equal(exported.length, 2);
assert.equal(exported[1][4], 3, 'antall er tall i Excel');
assert.equal(exported[1][20], 'Fakturert');
const csv = productSalesToCsv([table[0]]);
assert.ok(csv.startsWith('﻿"Dato";'));
assert.match(csv, /"Løyning AS"/);

console.log('productSalesView.test.mjs ok');
