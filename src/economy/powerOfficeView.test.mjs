/**
 * PowerOffice på fakturaen: feltet overlever normalisering, og visningen sier
 * hva som skjer med utkastet.
 */
import assert from 'node:assert/strict';
import { canDeleteInvoice, invoiceListSource, normalizeInvoice } from './invoices.js';
import {
  canTransferToPowerOffice,
  lookupRows,
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

// Ligger utkastet i Go (produksjon), må det slettes der først. Borte i Go: kan slettes.
const inProd = { ...transferred, poweroffice: { ...transferred.poweroffice, env: 'prod' } };
assert.equal(canDeleteInvoice(draft), true);
assert.equal(canDeleteInvoice(inProd), false);
assert.equal(canDeleteInvoice({ ...inProd, poweroffice: { state: 'missing', salesOrderId: 'so-1' } }), true);
assert.equal(canDeleteInvoice({ ...inProd, status: 'paid', poweroffice: { env: 'prod', state: 'paid', salesOrderId: 'so-1' } }), false);
// Fra testklienten er ingenting ekte: kan ryddes bort uansett, også sendt og betalt.
assert.equal(canDeleteInvoice(transferred), true);
assert.equal(canDeleteInvoice({ ...transferred, status: 'paid', invoiceNumber: '10007', poweroffice: { env: 'demo', state: 'paid', salesOrderId: 'so-1' } }), true);
assert.equal(canDeleteInvoice({ ...transferred, issuedAt: '2026-10-01T10:00:00Z' }), false, 'ferdigstilt i ProTop står fast');

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

assert.deepEqual(POWEROFFICE_VAT_ROWS.map((row) => row.id), ['HIGH', 'MID', 'LOW', 'ZERO', 'EXEMPT', 'OUTLAY', 'OUTSIDE', 'REVERSE']);

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

{
  // Oppslaget viser det Go svarte og det ProTop ville lagret.
  const rows = Object.fromEntries(lookupRows({
    found: true,
    readById: true,
    outgoing: { id: 'so-77', invoiceNo: '20077', cid: '200770000012', deliveryType: 'EHF', sentDateTime: '2026-10-28T10:00:00+01:00', totalAmount: 1250, balance: 0, customerNo: '10024' },
    protop: { invoiceNumber: '20077', kid: '200770000012', sentAt: '2026-10-28', invoiceDate: '2026-10-28', dueDate: '2026-11-11', status: 'paid', outstandingAmount: 0 },
  }));
  assert.equal(rows.Fakturanummer, '20077');
  assert.equal(rows.KID, '200770000012');
  assert.equal(rows.Forsendelse, 'EHF');
  assert.equal(rows.Sendt, '28.10.2026');
  assert.equal(rows.Forfall, '11.11.2026');
  assert.equal(rows['Status i ProTop'], 'Betalt');
  assert.equal(rows['Lest på id'], 'Ja (so-77)');
  assert.match(rows.Restbeløp, /^0/);
  assert.deepEqual(lookupRows({ found: false, invoiceNo: '1' }), []);
}

console.log('powerOfficeView.test ok');
