import assert from 'node:assert/strict';
import {
  emptyInvoice,
  invoiceListSource,
  isInvoiceCacheQuotaError,
  normalizeInvoice,
  toInvoiceCacheRow,
} from './invoices.js';

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
  reminderPostponedTo: '2026-11-01',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  feesExMarkup: 7000,
  adminCosts: 200,
  accounts: { 3000: 8000, 3001: 200 },
  voucherId: 'bilag_abc',
  voucherLines: [
    { account: '1500', accountName: 'Kundefordringer', debit: 9200, credit: 0, vatCode: '' },
    { account: '3000', accountName: 'Salgsinntekt', debit: 0, credit: 8000, vatCode: 'MID' },
    { account: '2701', accountName: 'Utgående MVA', debit: 0, credit: 1200, vatCode: 'MID' },
  ],
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
  previewReady: true,
  attachment: {
    url: 'https://example.com/f.pdf',
    name: 'f.pdf',
    mime: 'application/pdf',
    storagePath: 'families/x/invoices/inv_10001/f.pdf',
  },
  source: {
    filename: 'alle fakturaer.xlsx',
    importedAt: '2026-10-14T10:00:00.000Z',
    values: { Fakturanr: '10001', Extra: 'stor-celle' },
  },
});

const cached = toInvoiceCacheRow(full);
assert.equal(cached.kid, full.kid);
assert.equal(cached.vatCode, 'MID');
assert.equal(cached.voucherId, 'bilag_abc');
assert.equal(cached.customerName, 'Mg Næring AS');
assert.equal(cached.amountInclVat, 9200);
assert.equal(cached.previewReady, true);
assert.equal(cached.attachment?.url, 'https://example.com/f.pdf');
assert.equal(cached.deliveryMethod, 'ehf');

// Tunge felt skal ikke inn i lokal cache (kvote ved ~6700 fakturaer)
assert.equal(cached.lines, undefined);
assert.equal(cached.ehfXml, undefined);
assert.equal(cached.voucherLines, undefined);
assert.equal(cached.accounts, undefined);
assert.equal(cached.feesExMarkup, undefined);
assert.equal(cached.source, undefined);
assert.equal(cached.timeEntryIds, undefined);

const slim = toInvoiceCacheRow(invoiceListSource({
  ...full,
  ehfXml: '<Invoice>' + 'x'.repeat(5000) + '</Invoice>',
  lines: full.lines,
  voucherLines: full.voucherLines,
}, full.id));
assert.equal(slim.id, 'inv_10001');
assert.equal(slim.invoiceNumber, '10001');
assert.equal(slim.ehfXml, undefined);
assert.equal(slim.lines, undefined);
assert.equal(slim.status, full.status);

// Round-trip via normalize: listefelt overlever; detaljfelt er tomme til Firestore lastes
const restored = normalizeInvoice(cached);
assert.equal(restored.lines.length, 0);
assert.equal(restored.vatCode, 'MID');
assert.equal(restored.ehfXml, '');
assert.equal(restored.voucherId, 'bilag_abc');
assert.equal(restored.voucherLines.length, 0);
assert.equal(restored.kid, full.kid);
assert.deepEqual(restored.accounts, {});

assert.deepEqual(normalizeInvoice({ invoiceNumber: '1' }).voucherLines, []);

assert.equal(isInvoiceCacheQuotaError({ name: 'QuotaExceededError' }), true);
assert.equal(isInvoiceCacheQuotaError({ message: 'exceeded the quota' }), true);
assert.equal(isInvoiceCacheQuotaError({ message: 'Setting the value of protop.invoices.v1.x exceeded the quota.' }), true);
assert.equal(isInvoiceCacheQuotaError({ message: 'network' }), false);

// Simuler masseimport: kompakt payload må holde seg under typisk localStorage-kvote
const mass = Array.from({ length: 7000 }, (_, index) => toInvoiceCacheRow(emptyInvoice({
  id: `inv_${16000 + index}`,
  invoiceNumber: String(16000 + index),
  invoiceDate: '2026-09-30',
  customerName: 'Novaform AS',
  customerNumber: '10002',
  projectNumber: '10009',
  projectName: 'E39 Hove - Sandved (2148)',
  amountExVat: 65000,
  vat: 16250,
  amountInclVat: 81250,
  currency: 'NOK',
  status: 'paid',
  outstanding: 'Paid',
})));
const payloadBytes = Buffer.byteLength(JSON.stringify(mass), 'utf8');
assert.ok(payloadBytes < 4_500_000, `kompakt cache for 7000 rader skal være under 4.5 MB, var ${payloadBytes}`);

console.log('invoiceStorage.test.mjs: ok');
