import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { invoiceLog } from './invoiceLog.js';
import { issueInvoice, recalcInvoice, recordDelivery } from './invoiceFlow.js';
import { normalizeInvoice } from './invoices.js';

test('loggen viser ferdigstilling og sending selv når hendelsene mangler', () => {
  const invoice = {
    invoiceNumber: '1042',
    issuedAt: '2026-10-30T09:00:00.000Z',
    issuedByName: 'Geir',
    sentAt: '2026-10-30',
    events: [{ id: 'e1', at: '2026-10-29T08:00:00.000Z', type: 'edit', text: 'endret utkastet' }],
    deliveries: [{ id: 'd1', at: '2026-10-30T09:01:00.000Z', channel: 'email', status: 'sent', to: ['kunde@firma.no'] }],
  };
  const rows = invoiceLog(invoice);
  assert.deepEqual(rows.map((row) => row.type), ['delivery', 'issue', 'edit']);
  assert.match(rows[0].text, /sendte via e-post til kunde@firma.no/);
  assert.match(rows[1].text, /ferdigstilte faktura 1042/);
});

test('hendelser som finnes, dobles ikke', () => {
  const draft = recalcInvoice(normalizeInvoice({
    id: 'inv1',
    customerName: 'Kunde AS',
    lines: [{ id: 'l1', description: 'Arbeid', quantity: 1, unitPrice: 100, vatRate: 25 }],
  }));
  const issued = issueInvoice(draft, { number: '7', date: '2026-10-30', at: '2026-10-30T09:00:00.000Z' });
  const base = issued.ok ? issued.invoice : { ...draft, issuedAt: '2026-10-30T09:00:00.000Z', events: [{ id: 'x', at: '2026-10-30T09:00:00.000Z', type: 'issue', text: 'ferdigstilte faktura 7' }] };
  const sent = recordDelivery(base, { channel: 'email', to: ['a@b.no'], at: '2026-10-30T09:05:00.000Z' });
  const rows = invoiceLog(sent);
  assert.equal(rows.filter((row) => row.type === 'issue').length, 1);
  assert.equal(rows.filter((row) => row.type === 'delivery').length, 1);
});

test('sendt fra PowerOffice uten registrert sending står i loggen', () => {
  const rows = invoiceLog({ sentAt: '2026-10-30', events: [] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'delivery');
});

test('loggen kappes ikke ved 400 hendelser', () => {
  const events = Array.from({ length: 450 }, (_, i) => ({ id: `e${i}`, at: '2026-10-01T00:00:00.000Z', type: 'edit', text: 'endret utkastet' }));
  events.push({ id: 'last', at: '2026-10-30T00:00:00.000Z', type: 'issue', text: 'ferdigstilte faktura 1' });
  const row = normalizeInvoice({ id: 'x', events });
  assert.equal(row.events.at(-1).id, 'last');
});

test('send-dialogen: skrevet adresse teller, og tidligere mottakere foreslås', () => {
  const source = readFileSync(new URL('../../screens/economy/invoice/InvoiceDialogs.jsx', import.meta.url), 'utf8');
  assert.match(source, /pendingEmail\(recipientDraft\)/);
  assert.match(source, /row\?\.channel === 'email'/);
});

test('forhåndsvisning på mobil tegnes som bilder', () => {
  const source = readFileSync(new URL('../../screens/economy/invoice/InvoiceSidebar.jsx', import.meta.url), 'utf8');
  assert.match(source, /PdfPagesPreview/);
  assert.match(source, /touchWeb\(\)/);
});
