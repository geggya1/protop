/**
 * PowerOffice på fakturaen: feltet overlever normalisering, og visningen sier
 * hva som skjer med utkastet.
 */
import assert from 'node:assert/strict';
import { canDeleteInvoice, invoiceListSource, normalizeInvoice } from './invoices.js';
import {
  canTransferToPowerOffice,
  POWEROFFICE_VAT_ROWS,
  powerOfficeSummary,
  productOptionsForRow,
  productVatWarning,
} from './powerOfficeView.js';

const draft = normalizeInvoice({
  id: 'inv_1',
  invoiceNumber: '1',
  status: 'draft',
  exportStatus: 'utkast',
  lines: [{ description: 'Timer', quantity: 1, unitPrice: 100 }],
});

// Uten PowerOffice-data skal feltet ikke finnes, så lagring med merge ikke nuller det ut.
assert.equal('poweroffice' in draft, false);

const transferred = normalizeInvoice({
  ...draft,
  poweroffice: { env: 'demo', state: 'draft', salesOrderId: 'so-1', orderNo: 12, nested: { x: 1 } },
});
assert.deepEqual(transferred.poweroffice, { env: 'demo', state: 'draft', salesOrderId: 'so-1', orderNo: 12 });

// Listen får med PowerOffice-status, så slett-knappen vet om utkastet ligger i Go.
assert.equal(invoiceListSource(transferred, 'inv_1').poweroffice.salesOrderId, 'so-1');

// Ligger utkastet i Go, må det slettes der først. Borte i Go: kan slettes.
assert.equal(canDeleteInvoice(draft), true);
assert.equal(canDeleteInvoice(transferred), false);
assert.equal(canDeleteInvoice({ ...transferred, poweroffice: { state: 'missing', salesOrderId: 'so-1' } }), true);

const connected = { connected: true, env: 'demo' };
assert.equal(canTransferToPowerOffice(draft, connected), true);
assert.equal(canTransferToPowerOffice(draft, { connected: false }), false);
assert.equal(canTransferToPowerOffice(transferred, connected), false);
assert.equal(canTransferToPowerOffice({ ...transferred, poweroffice: { state: 'missing', salesOrderId: 'so-1' } }, connected), true);
assert.equal(canTransferToPowerOffice({ ...draft, status: 'sent', exportStatus: 'sendt', sentAt: '2026-10-01' }, connected), false);

assert.equal(powerOfficeSummary(draft), null);
const pending = powerOfficeSummary(transferred);
assert.equal(pending.title, 'Overført til PowerOffice (testklient)');
assert.match(pending.lines[0], /Utkast nr\. 12 venter/);

const sent = powerOfficeSummary({
  poweroffice: {
    env: 'prod', state: 'sent', invoiceNo: 20051, cid: '200510000017', deliveryType: 'EHF',
    sentDateTime: '2026-10-22T09:15:00+02:00', balance: 1300,
  },
});
assert.equal(sent.title, 'Sendt fra PowerOffice');
assert.match(sent.lines[0], /Faktura 20051 · KID 200510000017 · EHF · sendt 22\.10\.2026/);
assert.match(sent.lines[1], /Restbeløp/);

assert.equal(powerOfficeSummary({ poweroffice: { state: 'paid', balance: 0 } }).tone, 'ok');
assert.equal(powerOfficeSummary({ poweroffice: { state: 'missing' } }).tone, 'warn');

assert.deepEqual(POWEROFFICE_VAT_ROWS.map((row) => row.id), ['HIGH', 'MID', 'LOW', 'ZERO', 'EXEMPT', 'OUTLAY', 'OUTSIDE']);

{
  // Produktene som gir radens sats står øverst, med konto og MVA i teksten.
  const products = [
    { code: '9', name: 'Fritatt utlegg', salesAccount: 3100, vatCode: '5', vatPercent: 0 },
    { code: '1', name: 'Timer', salesAccount: 3000, vatCode: '3', vatPercent: 25 },
    { code: '7', name: 'Ukjent', salesAccount: null, vatCode: '', vatPercent: null },
  ];
  const high = POWEROFFICE_VAT_ROWS.find((row) => row.id === 'HIGH');
  const options = productOptionsForRow(high, products);
  assert.deepEqual(options.map((row) => row.id), ['1', '9', '7']);
  assert.equal(options[0].label, '1 · Timer · konto 3000 · 25 % MVA (kode 3)');
  assert.equal(options[2].label, '7 · Ukjent');
  assert.equal(productVatWarning(high, products, '1'), '');
  assert.equal(productVatWarning(high, products, '9'), 'Produktet gir 0 % MVA i PowerOffice, ikke 25 %.');
  assert.equal(productVatWarning(high, products, '7'), '');
  assert.equal(productVatWarning(high, products, ''), '');
}

console.log('powerOfficeView.test ok');
