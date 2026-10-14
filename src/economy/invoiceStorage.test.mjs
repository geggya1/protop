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
assert.equal(cached.voucherLines.length, 3);
assert.equal(cached.voucherLines[0].account, '1500');
assert.equal(cached.voucherLines[0].debit, 9200);
assert.ok(cached.ehfXml.includes('<Invoice'));
assert.equal(cached.lines.length, 1);
assert.equal(cached.lines[0].description, 'Konsulenttimer');
assert.equal(cached.lines[0].amountExVat, 8000);
assert.deepEqual(cached.timeEntryIds, ['te1']);
assert.equal(cached.bankAccount, '12345678903');
assert.equal(cached.deliveryMethod, 'ehf');
assert.equal(cached.reminderPostponedTo, '2026-11-01');
assert.equal(cached.periodStart, '2026-09-01');
assert.equal(cached.feesExMarkup, 7000);
assert.equal(cached.adminCosts, 200);
assert.equal(cached.accounts['3000'], 8000);
assert.equal(cached.source.filename, 'alle fakturaer.xlsx');
// Rå Excel-celler strippes i lokal cache (størrelse); hentes fra Firestore i detalj
assert.deepEqual(cached.source.values, {});

// Round-trip via normalize (som loadInvoices/loadInvoice fra lokal cache)
const restored = normalizeInvoice(cached);
assert.equal(restored.lines.length, 1);
assert.equal(restored.vatCode, 'MID');
assert.equal(restored.ehfXml, full.ehfXml);
assert.equal(restored.voucherId, 'bilag_abc');
assert.equal(restored.voucherLines.length, 3);
assert.equal(restored.voucherLines[1].credit, 8000);
assert.equal(restored.kid, full.kid);
assert.equal(restored.accounts['3001'], 200);
assert.equal(restored.feesExMarkup, 7000);

// Uten voucherLines → tom liste
assert.deepEqual(normalizeInvoice({ invoiceNumber: '1' }).voucherLines, []);

console.log('invoiceStorage.test.mjs: ok');
