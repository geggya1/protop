import assert from 'node:assert/strict';
import { emptyProduct, normalizeProduct, productsToCsv, saleFromProduct } from './products.js';
import { deleteProduct, setProductArchived, upsertProduct, upsertSale } from './opsState.js';
import {
  catalogIndex,
  catalogTotals,
  filterCatalog,
  productMargin,
  productRemoval,
  productStats,
  salesByProduct,
  usageByProduct,
} from './productCatalog.js';
import { mergeProjectStates, normalizeProjectState } from '../project/engine.js';

const now = new Date(2026, 9, 27);

let state = { products: [], sales: [] };
const rental = upsertProduct(state, emptyProduct({
  name: 'Fremleie',
  sku: '104',
  priceExVat: 8500,
  costExVat: 6000,
  kind: 'service',
  description: 'Fremleie av kontorplass.\nFaktureres månedlig.',
}));
state = rental.state;
const drone = upsertProduct(state, emptyProduct({ name: 'Dronefotografering', sku: '103', priceExVat: 2000 }));
state = drone.state;
const unused = upsertProduct(state, emptyProduct({ name: 'Ubrukt vare', sku: '200', priceExVat: 10 }));
state = unused.state;

// Linjeskift i beskrivelsen beholdes.
assert.equal(rental.product.description, 'Fremleie av kontorplass.\nFaktureres månedlig.');
assert.equal(rental.product.archived, false);

// Nytt varenr som allerede finnes stoppes. Uendret varenr på gamle dubletter går.
const twin = upsertProduct(state, emptyProduct({ name: 'Kopi', sku: '104', priceExVat: 1 }));
assert.equal(twin.ok, false);
assert.match(twin.error, /Varenr 104 brukes allerede av Fremleie/);
const rename = upsertProduct(state, { ...rental.product, name: 'Fremleie kontor' });
assert.equal(rename.ok, true);
assert.equal(rename.product.id, rental.product.id);
state = rename.state;

// Salg fra katalogen, fra timelisten (bare navn) og fra import (bare varenr).
state = upsertSale(state, saleFromProduct(rental.product, {
  date: '2026-10-02', quantity: 1, customerName: 'CONSULT1 AS', customerId: 'k1', projectNumber: '42', projectName: 'Frøya', status: 'invoiced',
})).state;
state = upsertSale(state, saleFromProduct(rental.product, {
  date: '2026-09-02', quantity: 2, customerName: 'CONSULT1 AS', customerId: 'k1', status: 'approved',
})).state;
state = upsertSale(state, {
  date: '2025-12-01', name: 'fremleie kontor', quantity: 1, unitPrice: 8000, customerName: 'Annen AS',
}).state;
state = upsertSale(state, {
  date: '2025-11-20', name: 'Fremleie kontor', quantity: 1, unitPrice: 8500, customerName: 'Consult1 AS', projectNumber: '42', projectName: 'Frøya',
}).state;
state = upsertSale(state, {
  date: '2026-03-10', name: 'Drone (import)', sku: '103', quantity: 3, unitPrice: 2000,
}).state;
state = upsertSale(state, { date: '2026-03-11', name: 'Noe helt annet', quantity: 1, unitPrice: 5 }).state;

const index = catalogIndex(state.products);
assert.equal(index.resolve({ productId: rental.product.id }), rental.product.id);
assert.equal(index.resolve({ sku: '103', name: 'X' }), drone.product.id);
assert.equal(index.resolve({ name: 'Fremleie Kontor' }), rental.product.id);
assert.equal(index.resolve({ name: 'Noe helt annet' }), '');

const grouped = salesByProduct(state.products, state.sales);
assert.equal(grouped.get(rental.product.id).length, 4);
assert.equal(grouped.get(drone.product.id).length, 1);
assert.equal(grouped.has(unused.product.id), false);
assert.equal(grouped.get(rental.product.id)[0].date, '2026-10-02', 'nyeste først');

const usage = usageByProduct(grouped);
const rentalUsage = usage.get(rental.product.id);
assert.equal(rentalUsage.count, 4);
assert.equal(rentalUsage.quantity, 5);
assert.equal(rentalUsage.amountExVat, 8500 * 4 + 8000);
assert.equal(rentalUsage.firstDate, '2025-11-20');
assert.equal(rentalUsage.lastDate, '2026-10-02');

const stats = productStats(grouped.get(rental.product.id), { now });
assert.equal(stats.thisYear.count, 2);
assert.equal(stats.thisYear.amountExVat, 8500 * 3);
assert.deepEqual(stats.byStatus, { draft: 2, approved: 1, invoiced: 1 });
assert.equal(stats.months.length, 12);
assert.equal(stats.months[11].key, '2026-10');
assert.equal(stats.months[11].amountExVat, 8500);
assert.equal(stats.months[0].key, '2025-11');
assert.equal(stats.months[0].amountExVat, 8500);
assert.equal(stats.months[1].amountExVat, 8000, 'desember i fjor er med');
// Importert salg uten kunde- og prosjekt-id havner sammen med de koblede.
assert.equal(stats.customers[0].label, 'CONSULT1 AS');
assert.equal(stats.customers[0].count, 3);
assert.equal(stats.customers[1].label, 'Annen AS');
assert.equal(stats.projects.length, 1);
assert.equal(stats.projects[0].label, '42 · Frøya');
assert.equal(stats.projects[0].count, 2);
assert.equal(stats.withoutProject, 2);
assert.equal(stats.averagePrice, (8500 * 4 + 8000) / 5);

assert.deepEqual(productMargin(rental.product), { amount: 2500, percent: 29.4 });
assert.equal(productMargin(drone.product), null);

// Søk, filter og sortering.
assert.deepEqual(filterCatalog(state.products, usage).map((row) => row.product.name), [
  'Dronefotografering', 'Fremleie kontor', 'Ubrukt vare',
]);
assert.deepEqual(filterCatalog(state.products, usage, { query: 'kontorplass' }).map((row) => row.product.sku), ['104']);
assert.deepEqual(filterCatalog(state.products, usage, { sort: 'revenue' }).map((row) => row.product.sku), ['104', '103', '200']);
assert.deepEqual(filterCatalog(state.products, usage, { kind: 'service' }).map((row) => row.product.sku), ['104']);

// Brukt produkt arkiveres, ubrukt kan slettes.
assert.deepEqual(productRemoval(rentalUsage), { mode: 'archive', count: 4 });
assert.deepEqual(productRemoval(usage.get(unused.product.id)), { mode: 'delete', count: 0 });
const blocked = deleteProduct(state, rental.product.id, { usedCount: 3 });
assert.equal(blocked.ok, false);
assert.match(blocked.error, /Arkiver det i stedet/);

const archived = setProductArchived(state, rental.product.id, true);
assert.equal(archived.ok, true);
assert.equal(archived.product.archived, true);
assert.ok(archived.product.archivedAt);
state = archived.state;
assert.deepEqual(filterCatalog(state.products, usage).map((row) => row.product.sku), ['103', '200']);
assert.deepEqual(filterCatalog(state.products, usage, { status: 'archived' }).map((row) => row.product.sku), ['104']);
// Historikken følger fortsatt det arkiverte produktet.
assert.equal(salesByProduct(state.products, state.sales).get(rental.product.id).length, 4);

const totals = catalogTotals(state.products, grouped, { now });
assert.equal(totals.active, 2);
assert.equal(totals.archived, 1);
assert.equal(totals.unused, 1);
assert.equal(totals.yearCount, 3);
assert.equal(totals.yearAmountExVat, 8500 * 3 + 6000);
assert.equal(totals.topName, 'Fremleie kontor');

const restored = setProductArchived(state, rental.product.id, false);
assert.equal(restored.product.archived, false);
assert.equal(restored.product.archivedAt, '');

// Sletting legger igjen en tombstone, så produktet ikke kommer tilbake ved synk.
const removed = deleteProduct(state, unused.product.id, { usedCount: 0 });
assert.equal(removed.ok, true);
assert.equal(removed.state.products.some((row) => row.id === unused.product.id), false);
assert.equal(removed.state.deletedProducts[0].id, unused.product.id);
const merged = mergeProjectStates(
  normalizeProjectState({ products: state.products, syncedAt: '2026-10-01T00:00:00Z' }),
  normalizeProjectState({ products: removed.state.products, deletedProducts: removed.state.deletedProducts, syncedAt: '2026-10-02T00:00:00Z' }),
);
assert.equal(merged.products.some((row) => row.id === unused.product.id), false);
assert.equal(merged.products.some((row) => row.id === drone.product.id), true);
assert.equal(merged.deletedProducts.length, 1);

// Arkiveringen overlever normalisering, og CSV-en viser status.
assert.equal(normalizeProduct({ ...archived.product }).archived, true);
const csv = productsToCsv(state.products);
assert.match(csv.split('\n')[0], /Beskrivelse;Status$/);
assert.match(csv, /"Arkivert"/);

console.log('productCatalog ok');
