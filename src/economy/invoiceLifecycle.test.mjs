/**
 * Utkast → sendt, sletting og frigjøring av låste poster.
 */
import assert from 'node:assert/strict';
import {
  canDeleteInvoice,
  markInvoiceAsSent,
  normalizeInvoice,
} from './invoices.js';
import {
  clearEntriesInvoice,
  markEntriesInvoiced,
} from './billingFromHours.js';
import {
  clearProposalInvoice,
} from './billingFromOperations.js';
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

let state = {
  timeEntries: [
    { id: 't1', status: 'godkjent', invoiceId: '', hours: 2 },
    { id: 't2', status: 'godkjent', invoiceId: '', hours: 1 },
  ],
  expenses: [{ id: 'e1', status: 'approved', invoiceId: '', amount: 100 }],
  mileageTrips: [{ id: 'm1', status: 'approved', invoiceId: '', distanceKm: 10 }],
  sales: [{ id: 's1', status: 'approved', invoiceId: '', amountExVat: 50 }],
};

state = markEntriesInvoiced(state, ['t1', 't2'], 'inv_16714');
state = markOperationsInvoiced(state, {
  expenseIds: ['e1'],
  tripIds: ['m1'],
  saleIds: ['s1'],
  invoiceId: 'inv_16714',
});
assert.ok(state.timeEntries.every((row) => row.invoiceId === 'inv_16714' && row.status === 'låst'));
assert.ok(state.expenses.every((row) => row.invoiceId === 'inv_16714' && row.status === 'invoiced'));

state = clearProposalInvoice(state, 'inv_16714');
assert.ok(state.timeEntries.every((row) => row.invoiceId === '' && row.status === 'godkjent'));
assert.ok(state.expenses.every((row) => row.invoiceId === '' && row.status === 'approved'));
assert.ok(state.mileageTrips.every((row) => row.invoiceId === '' && row.status === 'approved'));
assert.ok(state.sales.every((row) => row.invoiceId === '' && row.status === 'approved'));

assert.equal(clearEntriesInvoice(state, 'missing'), state);
assert.equal(clearOperationsInvoice(state, ''), state);

console.log('invoiceLifecycle.test.mjs: ok');
