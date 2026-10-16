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
