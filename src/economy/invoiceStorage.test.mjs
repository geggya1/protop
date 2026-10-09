import assert from 'node:assert/strict';
import { emptyInvoice, normalizeInvoice, toInvoiceCacheRow } from './invoices.js';

const full = emptyInvoice({
  id: 'inv_10001',
  invoiceNumber: '10001',
  invoiceDate: '2026-10-09',
  customerName: 'Mg Næring AS',
  customerNumber: '1042',
  kid: '1042100013',
  vatCode: 'MID',
  bankAccount: '12345678903',
  deliveryMethod: 'ehf',
  voucherId: 'bilag_abc',
  ehfXml: '<?xml version="1.0"?><Invoice/>',
  creditNoteForId: '',
  lines: [{
    id: 'line_1',
    description: 'Konsulenttimer',
    quantity: 8,
    unit: 't',
    unitPrice: 1000,
    vatCode: 'MID',
    vatPercent: 15,
    amountExVat: 8000,
    vatAmount: 1200,
    amountInclVat: 9200,
    account: '3000',
    timeEntryIds: ['te1'],
  }],
  timeEntryIds: ['te1'],
  amountExVat: 8000,
  vat: 1200,
  amountInclVat: 9200,
});

const cached = toInvoiceCacheRow(full);
assert.equal(cached.kid, full.kid);
assert.equal(cached.vatCode, 'MID');
assert.equal(cached.voucherId, 'bilag_abc');
assert.ok(cached.ehfXml.includes('<Invoice'));
assert.equal(cached.lines.length, 1);
assert.equal(cached.lines[0].description, 'Konsulenttimer');
assert.equal(cached.lines[0].amountExVat, 8000);
assert.deepEqual(cached.timeEntryIds, ['te1']);
assert.equal(cached.bankAccount, '12345678903');
assert.equal(cached.deliveryMethod, 'ehf');

// Round-trip via normalize (som loadInvoices/loadInvoice fra lokal cache)
const restored = normalizeInvoice(cached);
assert.equal(restored.lines.length, 1);
assert.equal(restored.vatCode, 'MID');
assert.equal(restored.ehfXml, full.ehfXml);
assert.equal(restored.voucherId, 'bilag_abc');
assert.equal(restored.kid, full.kid);

console.log('invoiceStorage.test.mjs: ok');
