import assert from 'node:assert/strict';
import {
  addProjectMember,
  createProject,
  emptyProjectState,
  setTimeEntryStatus,
  upsertTimeEntry,
  updateProject,
} from '../project/engine.js';
import {
  expenseBillableExVat,
  expenseNeedsNamedBuyer,
  expenseNeedsReceipt,
  normalizeExpense,
  validateExpense,
} from './expenses.js';
import {
  MILEAGE_RATE_TAX_FREE,
  normalizeTrip,
  tripInvoiceLine,
  validateTrip,
  yearlyDutyKm,
} from './mileage.js';
import {
  applySaleToStock,
  saleFromProduct,
  saleInvoiceLine,
  validateProduct,
} from './products.js';
import {
  markOperationsInvoiced,
  setExpenseStatus,
  setSaleStatus,
  setTripStatus,
  upsertExpense,
  upsertProduct,
  upsertSale,
  upsertTrip,
} from './opsState.js';
import { approvedOnly, buildReadyProjects, selectableKeys, selectionFor } from './billingReady.js';
import { buildInvoiceDraft } from './invoiceDraft.js';
import { issueInvoice } from './invoiceFlow.js';
import { validateKid } from './kid.js';
import { voucherBalances, voucherFromInvoice } from './vouchers.js';
import { validateEhfBasics } from './ehf.js';

// --- Utlegg ---
const material = normalizeExpense({
  date: '2026-10-08',
  category: 'materials',
  description: 'Kabel',
  amountExVat: 2000,
  vatCode: 'HIGH',
});
assert.equal(material.amountInclVat, 2500);
assert.equal(expenseNeedsNamedBuyer(material), true);
assert.equal(expenseNeedsReceipt({ ...material, receiptUri: '' }), true);
assert.equal(validateExpense(material).ok, false); // >1000 innsats uten kvittering
assert.equal(validateExpense({ ...material, receiptUri: 'file://kvittering.jpg' }).ok, true);
assert.equal(expenseBillableExVat({ ...material, markupPercent: 10 }), 2200);

const parking = validateExpense({
  date: '2026-10-08',
  category: 'parking',
  purpose: 'Befaring',
  amountInclVat: 80,
  vatCode: 'HIGH',
});
assert.equal(parking.ok, true);

// --- Kjørebok ---
assert.equal(validateTrip({ date: '2026-10-08', from: 'Oslo', to: 'Sandnes' }).ok, false);
const trip = validateTrip({
  date: '2026-10-08',
  from: 'Oslo',
  to: 'Sandnes',
  notes: 'Befaring Foss Eikeland',
  km: 40,
  tolls: 86,
});
assert.equal(trip.ok, true);
assert.equal(trip.trip.allowance, 40 * MILEAGE_RATE_TAX_FREE);
assert.equal(trip.trip.amount, 40 * MILEAGE_RATE_TAX_FREE + 86);
assert.equal(validateTrip({
  date: '2026-10-08', from: 'Hjem', to: 'Kontor', purpose: 'private', km: 5,
}).ok, true);
const lines = tripInvoiceLine(trip.trip);
assert.equal(lines.length, 2);
assert.equal(yearlyDutyKm([trip.trip, { purpose: 'private', km: 100, date: '2026-10-01', from: 'a', to: 'b' }], 2026), 40);

// --- Produkter ---
assert.equal(validateProduct({ name: '' }).ok, false);
const product = validateProduct({
  name: 'VA-rør 110',
  sku: 'VA-110',
  kind: 'goods_resale',
  priceExVat: 450,
  stock: 10,
  trackStock: true,
}).product;
const sale = saleFromProduct(product, { quantity: 2, date: '2026-10-08' });
assert.equal(sale.amountExVat, 900);
assert.equal(applySaleToStock(product, sale).stock, 8);
assert.equal(saleInvoiceLine(sale).unit, 'stk');

// --- State + blandet faktura ---
let state = emptyProjectState();
state = createProject(state, {
  name: 'Foss Eikeland',
  number: '10374',
  client: 'Mg Næring AS',
  customerNumber: '1042',
  orgnr: '912345678',
  customerId: 'cust1',
  pricingModel: 'hourly',
}).state;
state = updateProject(state, state.activeProjectId, {
  pricingSettings: { hourlyRate: 1000 },
}).state;
const projectId = state.activeProjectId;
state = addProjectMember(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Ola Nordmann',
  role: 'Prosjektleder',
}).state;
state = upsertTimeEntry(state, {
  projectId,
  employeeId: 'emp1',
  employeeName: 'Ola Nordmann',
  date: '2026-10-06',
  hours: 2,
  description: 'Befaring',
  timeType: 'ordinary',
}).state;
for (const row of state.timeEntries) {
  state = setTimeEntryStatus(state, row.id, 'godkjent').state;
}

const exp = upsertExpense(state, {
  date: '2026-10-07',
  category: 'parking',
  purpose: 'Parkering bygg',
  description: 'Parkering',
  amountExVat: 100,
  billable: true,
  customerId: 'cust1',
  customerNumber: '1042',
  customerName: 'Mg Næring AS',
  projectId,
  projectNumber: '10374',
  projectName: 'Foss Eikeland',
});
assert.equal(exp.ok, true, exp.error);
state = setExpenseStatus(exp.state, exp.expense.id, 'approved').state;

const tur = upsertTrip(state, {
  date: '2026-10-07',
  from: 'Sandnes',
  to: 'Foss Eikeland',
  notes: 'Befaring',
  km: 20,
  billable: true,
  customerId: 'cust1',
  customerNumber: '1042',
  customerName: 'Mg Næring AS',
  projectId,
  projectNumber: '10374',
  projectName: 'Foss Eikeland',
});
assert.equal(tur.ok, true, tur.error);
state = setTripStatus(tur.state, tur.trip.id, 'approved').state;

const cat = upsertProduct(state, {
  name: 'VA-rør 110',
  sku: 'VA-110',
  priceExVat: 450,
  trackStock: true,
  stock: 5,
});
assert.equal(cat.ok, true, cat.error);
state = cat.state;
const sal = upsertSale(state, {
  ...saleFromProduct(cat.product, { quantity: 1, date: '2026-10-07' }),
  customerId: 'cust1',
  customerNumber: '1042',
  customerName: 'Mg Næring AS',
  projectId,
  projectNumber: '10374',
  projectName: 'Foss Eikeland',
});
assert.equal(sal.ok, true, sal.error);
assert.equal(sal.state.products.find((p) => p.id === cat.product.id).stock, 4);
state = setSaleStatus(sal.state, sal.sale.id, 'approved').state;

// Til fakturering → utkast → utstedelse, samme vei som appen.
const accounts = {
  accountHours: '3000', accountExpenses: '3000', accountOutlays: '3000', accountMileage: '3000', accountProducts: '3000',
};
const chart = [{ code: '3000', name: 'Salgsinntekt', vatRate: 25 }];
const seller = {
  name: 'ProTop AS', orgnr: '999888777', bankAccount: '12345678903',
  address: 'Storgata 1', city: 'Oslo', postalCode: '0150', vatRegistered: true,
};
const readyFor = (current) => buildReadyProjects({
  projects: current.projects,
  customers: [{ id: 'cust1', name: 'Mg Næring AS', customerNumber: '1042', orgnr: '912345678', address: 'Kundevei 1', postalCode: '4010', place: 'Stavanger' }],
  timeEntries: current.timeEntries,
  expenses: current.expenses,
  trips: current.mileageTrips,
  sales: current.sales,
  settingsFor: () => accounts,
  chart,
  periodEnd: '2026-12-31',
  today: '2026-12-31',
});
const [ready] = readyFor(state);
assert.equal(readyFor(state).length, 1);
assert.equal(ready.hourGroups.reduce((sum, group) => sum + group.entries.length, 0), 1);
assert.equal(ready.expenses.length, 1);
assert.equal(ready.trips.length, 1);
assert.equal(ready.sales.length, 1);

const selection = approvedOnly(selectionFor(ready, new Set(selectableKeys(ready))));
const draft = buildInvoiceDraft(selection, { settings: accounts, chart, supplier: seller, today: '2026-10-20' });
assert.equal(draft.ok, true, draft.error);
const created = issueInvoice(draft.invoice, { number: '10001', date: '2026-10-20', supplier: seller });
assert.equal(created.ok, true, created.error);
assert.ok(created.invoice.lines.length >= 4);
assert.ok(created.invoice.kid);
assert.equal(validateKid(created.invoice.kid).ok, true);
assert.ok(created.invoice.amountInclVat > created.invoice.amountExVat);

const voucher = voucherFromInvoice(created.invoice);
assert.equal(voucher.ok, true, voucher.error);
assert.equal(voucherBalances(voucher.voucher).debit, voucherBalances(voucher.voucher).credit);

const ehf = validateEhfBasics(created.invoice, {
  name: 'ProTop AS',
  orgnr: '999888777',
  bankAccount: '12345678903',
  address: 'Storgata 1',
  city: 'Oslo',
  postalCode: '0150',
});
assert.equal(ehf.ok, true, ehf.error);

// Postene på fakturaen er ikke åpne lenger.
const billed = (key) => new Set(created.invoice.lines.flatMap((row) => row[key] || []));
state = markOperationsInvoiced(state, {
  expenseIds: [...billed('expenseIds')],
  tripIds: [...billed('tripIds')],
  saleIds: [...billed('saleIds')],
  invoiceId: created.invoice.id,
});
state = {
  ...state,
  timeEntries: state.timeEntries.map((row) => (billed('timeEntryIds').has(row.id) ? { ...row, invoiceId: created.invoice.id, status: 'låst' } : row)),
};
assert.equal(readyFor(state).length, 0);
assert.ok(state.expenses.every((row) => row.status === 'invoiced'));
assert.ok(state.mileageTrips.every((row) => row.status === 'invoiced'));
assert.ok(state.sales.every((row) => row.status === 'invoiced'));

const again = markOperationsInvoiced(state, {
  expenseIds: state.expenses.map((r) => r.id),
  invoiceId: created.invoice.id,
});
assert.ok(again.expenses[0].invoiceId);

console.log('opsPipeline.test.mjs: ok');
