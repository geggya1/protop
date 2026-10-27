/**
 * Redigering av ett produktsalg: fakturert er låst, beløp regnes på nytt
 * bare ved prisendring, og koblinger til prosjekt, kunde og ansatt.
 */
import assert from 'node:assert/strict';
import { applySaleDraft, replaceSaleInState, saleDraft } from './productSaleEdit.js';
import { normalizeSale } from './products.js';

const now = '2026-10-27T10:00:00.000Z';
const projects = [
  { id: 'p1', number: '10844', name: 'Fremleie kontor', customerId: 'c1' },
  { id: 'p2', number: '10273', name: 'Fremleie Svanholmen' },
];
const customers = [{ id: 'c1', name: 'Løyning AS', customerNumber: '1001' }];
const employees = [{ id: 'e1', person: { firstName: 'Kari', lastName: 'Nordmann' } }];

// Importert salg med låste beløp fra filen.
const imported = normalizeSale({
  id: 'sal-1',
  date: '2026-10-15',
  name: 'Fremleie',
  title: 'Fremleie av 1 kontor oktober',
  quantity: 3,
  unitPrice: 10000,
  lockAmounts: true,
  amountExVat: 25500,
  vatAmount: 6375,
  amountInclVat: 31875,
  projectId: 'p1',
  projectNumber: '10844',
  projectName: 'Fremleie kontor',
  customerName: 'RÅDGIVENDE INGENIØRER LØYNING AS',
  status: 'approved',
  externalStore: true,
});

const draft = saleDraft(imported);
assert.equal(draft.quantity, '3');
assert.equal(draft.unitPrice, '10000');
assert.equal(draft.title, 'Fremleie av 1 kontor oktober');

// Bare tekst endret: beløpene fra filen står.
const textOnly = applySaleDraft(imported, { ...draft, comment: 'Avtalt med kunden' }, { projects, customers, employees, now });
assert.equal(textOnly.ok, true);
assert.equal(textOnly.priceChanged, false);
assert.equal(textOnly.sale.amountExVat, 25500);
assert.equal(textOnly.sale.amountInclVat, 31875);
assert.equal(textOnly.sale.comment, 'Avtalt med kunden');
assert.equal(textOnly.sale.updatedAt, now);
assert.equal(textOnly.sale.externalStore, true, 'importert salg blir i samlingen');
assert.equal(textOnly.sale.projectId, 'p1');
assert.equal(textOnly.sale.customerName, 'RÅDGIVENDE INGENIØRER LØYNING AS', 'kunde uten id fra filen står');

// Antall og rabatt endret: beløpet regnes ut på nytt.
const repriced = applySaleDraft(imported, { ...draft, quantity: '2', discountPercent: '10' }, { projects, customers, employees, now });
assert.equal(repriced.ok, true);
assert.equal(repriced.priceChanged, true);
assert.equal(repriced.sale.amountExVat, 18000);
assert.equal(repriced.sale.vatAmount, 4500);
assert.equal(repriced.sale.amountInclVat, 22500);
assert.equal(repriced.sale.discountPercent, 10);

// Nytt prosjekt, kunde og medarbeider fra registrene.
const moved = applySaleDraft(imported, { ...draft, projectId: 'p2', customerId: 'c1', employeeId: 'e1' }, { projects, customers, employees, now });
assert.equal(moved.sale.projectId, 'p2');
assert.equal(moved.sale.projectNumber, '10273');
assert.equal(moved.sale.customerId, 'c1');
assert.equal(moved.sale.customerNumber, '1001');
assert.equal(moved.sale.employeeId, 'e1');
assert.equal(moved.sale.employeeName, 'Kari Nordmann');

// Prosjekt fjernet.
const cleared = applySaleDraft(imported, { ...draft, projectId: '' }, { projects, customers, employees, now });
assert.equal(cleared.sale.projectId, '');
assert.equal(cleared.sale.projectNumber, '');

// Ugyldige verdier.
assert.equal(applySaleDraft(imported, { ...draft, quantity: '0' }).ok, false);
assert.equal(applySaleDraft(imported, { ...draft, name: ' ' }).ok, false);
assert.equal(applySaleDraft(imported, { ...draft, discountPercent: '150' }).ok, false);
assert.equal(applySaleDraft(imported, { ...draft, unitPrice: 'mye' }).ok, false);

// Fakturert salg er låst.
const invoiced = normalizeSale({ ...imported, status: 'invoiced', invoiceId: 'inv-1' });
const refused = applySaleDraft(invoiced, saleDraft(invoiced), { now });
assert.equal(refused.ok, false);
assert.match(refused.error, /fakturert/i);
const refusedByInvoice = applySaleDraft({ ...imported, invoiceId: 'inv-2' }, draft, { now });
assert.equal(refusedByInvoice.ok, false);

// Prosjektstate: lager justeres med endringen i antall, ikke trukket på nytt.
const state = {
  products: [{ id: 'var-1', name: 'Hansker', trackStock: true, stock: 8 }],
  sales: [normalizeSale({ id: 'sal-2', productId: 'var-1', name: 'Hansker', quantity: 2, unitPrice: 50, status: 'approved' })],
};
const more = applySaleDraft(state.sales[0], { ...saleDraft(state.sales[0]), quantity: '5' }, { now });
const replaced = replaceSaleInState(state, more.sale);
assert.equal(replaced.ok, true);
assert.equal(replaced.state.products[0].stock, 5);
assert.equal(replaced.state.sales[0].quantity, 5);
const tooMany = applySaleDraft(state.sales[0], { ...saleDraft(state.sales[0]), quantity: '20' }, { now });
assert.equal(replaceSaleInState(state, tooMany.sale).ok, false);
const lockedState = { ...state, sales: [{ ...state.sales[0], status: 'invoiced' }] };
assert.equal(replaceSaleInState(lockedState, more.sale).ok, false, 'fakturert i prosjektstate er låst');
assert.equal(replaceSaleInState(state, { ...more.sale, id: 'mangler' }).ok, false);

console.log('productSaleEdit.test.mjs ok');
