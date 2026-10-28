/**
 * Utkast → sendt, sletting og frigjøring av låste poster.
 */
import assert from 'node:assert/strict';
import {
  canDeleteInvoice,
  markInvoiceAsSent,
  normalizeInvoice,
} from './invoices.js';
import { invoiceTimeEntryIds } from './invoiceRelease.js';
import { clearOperationsInvoice, markOperationsInvoiced } from './opsState.js';

const draft = normalizeInvoice({
  id: 'inv_16714',
  invoiceNumber: '16714',
  status: 'draft',
  exportStatus: 'utkast',
  customerName: 'Bate Boligbyggelag',
});
assert.equal(canDeleteInvoice(draft), true);
assert.equal(canDeleteInvoice({ ...draft, status: 'registered', exportStatus: '', sent: '', sentAt: '' }), true);

const sent = markInvoiceAsSent(draft, '2026-10-15T12:00:00.000Z');
assert.equal(sent.status, 'sent');
assert.equal(sent.sent, 'sent');
assert.equal(sent.sentAt, '2026-10-15');
assert.equal(sent.exportStatus, 'sendt');
assert.equal(canDeleteInvoice(sent), false);
assert.equal(canDeleteInvoice({ ...sent, status: 'paid' }), false);
assert.equal(canDeleteInvoice({ ...sent, status: 'credited' }), false);

assert.deepEqual(invoiceTimeEntryIds({
  id: 'inv_16714',
  timeEntryIds: ['t1', 't1'],
  lines: [{ timeEntryIds: ['t2', ''] }],
}), ['t1', 't2']);

// Timer merkes og frigjøres i egen samling (billingWork / invoiceRelease). Her: utlegg, kjøring og salg.
let state = {
  expenses: [{ id: 'e1', status: 'approved', invoiceId: '', amount: 100 }],
  mileageTrips: [{ id: 'm1', status: 'approved', invoiceId: '', distanceKm: 10 }],
  sales: [{ id: 's1', status: 'approved', invoiceId: '', amountExVat: 50 }],
};

state = markOperationsInvoiced(state, {
  expenseIds: ['e1'],
  tripIds: ['m1'],
  saleIds: ['s1'],
  invoiceId: 'inv_16714',
});
assert.ok(state.expenses.every((row) => row.invoiceId === 'inv_16714' && row.status === 'invoiced'));

state = clearOperationsInvoice(state, 'inv_16714');
assert.ok(state.expenses.every((row) => row.invoiceId === '' && row.status === 'approved'));
assert.ok(state.mileageTrips.every((row) => row.invoiceId === '' && row.status === 'approved'));
assert.ok(state.sales.every((row) => row.invoiceId === '' && row.status === 'approved'));

assert.equal(clearOperationsInvoice(state, ''), state);

console.log('invoiceLifecycle.test.mjs: ok');
