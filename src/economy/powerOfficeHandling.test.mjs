/**
 * Faktura sendt fra PowerOffice Go: betaling, kreditnota og tap føres i ProTop.
 * Restbeløpet i Go er utgangspunktet, og Go runder ikke av.
 */
import assert from 'node:assert/strict';
import { applyCreditToOriginal, buildCreditNote, recalcInvoice, registerPayment, writeOffInvoice } from './invoiceFlow.js';

const line = (id, quantity, unitPrice) => ({
  id, section: 'hours', description: 'Rådgivning', quantity, unit: 't', unitPrice, amountExVat: quantity * unitPrice, vatPercent: 25, vatCode: 'HIGH',
});
// 172 543,00 + 25 % = 215 678,75. ProTop ville rundet til 215 679.
const fromGo = (extra = {}) => recalcInvoice({
  id: 'inv-1',
  invoiceNumber: '10000',
  invoiceDate: '2026-10-29',
  dueDate: '2026-11-12',
  status: 'sent',
  sentAt: '2026-10-29',
  lines: [line('l1', 10.5, 122), line('l2', 14, 12233)],
  poweroffice: { state: 'sent', salesOrderId: 'so-1', outgoingInvoiceId: 'oi-1', balance: 215678.75 },
  ...extra,
});

{
  const invoice = fromGo();
  assert.equal(invoice.outstandingAmount, 215678.75);

  const part = registerPayment(invoice, { amount: 100000, date: '2026-11-01' });
  assert.ok(part.ok);
  assert.equal(part.invoice.outstandingAmount, 115678.75);
  assert.equal(part.invoice.status, 'sent');

  const full = registerPayment(invoice, { amount: 215678.75, date: '2026-11-02' });
  assert.equal(full.invoice.outstandingAmount, 0);
  assert.equal(full.invoice.status, 'paid');
}

{
  // Betalt delvis i Go (restbeløpet der er lavere), deretter tap i ProTop for resten.
  const invoice = fromGo({ poweroffice: { state: 'sent', outgoingInvoiceId: 'oi-1', balance: 15678.75 } });
  assert.equal(invoice.outstandingAmount, 15678.75);
  const loss = writeOffInvoice(invoice, { reason: 'Konkurs' });
  assert.ok(loss.ok);
  assert.equal(loss.invoice.loss, 15678.75);
  assert.equal(loss.invoice.outstandingAmount, 0);
  assert.equal(loss.invoice.status, 'written_off');
}

{
  // Hel kreditering i ProTop: kreditnotaen har ingen kobling til Go, og fakturaen blir kreditert uten ørerest.
  const invoice = fromGo();
  const draft = buildCreditNote(invoice, { reason: 'Feil timepris' });
  assert.ok(draft.ok);
  assert.equal(draft.invoice.poweroffice, undefined);
  const creditNote = { ...draft.invoice, invoiceNumber: '10001', status: 'issued', issuedAt: '2026-10-30T10:00:00Z' };
  const original = applyCreditToOriginal(invoice, creditNote);
  assert.equal(original.status, 'credited');
  assert.equal(original.creditedAmount, 215678.75);
  assert.equal(original.outstandingAmount, 0);
}

console.log('powerOfficeHandling ok');
