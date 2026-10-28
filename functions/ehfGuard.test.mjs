/**
 * EHF: avsender fra bedriften på serveren, og vern mot dobbel sending.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EHF_RESEND_COOLDOWN_MS,
  EHF_SENDING_STALE_MS,
  ehfLockId,
  ehfSendDecision,
  invoiceHasEhfDelivery,
  senderOrgnrFromFamily,
  xmlSupplierOrgnr,
} from './ehfGuard.js';
import { buildEhfXml } from '../src/economy/ehf.js';

test('avsenderorgnr kommer fra selskapsdokumentet', () => {
  assert.equal(senderOrgnrFromFamily({ company: { organisasjonsnummer: '917 103 801' } }), '917103801');
  assert.equal(senderOrgnrFromFamily({ orgnr: '917103801' }), '917103801');
  assert.equal(senderOrgnrFromFamily({ company: { organisasjonsnummer: '12' }, orgnr: '917103801' }), '917103801');
  assert.equal(senderOrgnrFromFamily({}), '');
  assert.equal(senderOrgnrFromFamily(null), '');
});

test('avsender i EHF-fila leses fra AccountingSupplierParty', () => {
  const xml = `<?xml version="1.0"?><Invoice>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">917103801</cbc:EndpointID>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">948243113</cbc:EndpointID>
    </cac:Party>
  </cac:AccountingCustomerParty></Invoice>`;
  assert.equal(xmlSupplierOrgnr(xml), '917103801');
  assert.equal(xmlSupplierOrgnr('<Invoice/>'), '');
});

test('EHF-fila appen bygger har bedriftens orgnr som avsender', () => {
  const built = buildEhfXml({
    id: 'inv_1',
    invoiceNumber: '1001',
    invoiceDate: '2026-10-01',
    dueDate: '2026-10-15',
    customerName: 'Kunde AS',
    orgnr: '948243113',
    lines: [{ id: 'l1', description: 'Arbeid', quantity: 1, unitPrice: 1000, vatRate: 25 }],
    status: 'issued',
  }, {
    supplier: {
      name: 'Bygg AS', orgnr: '917103801', address: 'Gate 1', city: 'Oslo', postalCode: '0150',
      bankAccount: '12345678903', vatRegistered: true,
    },
  });
  assert.equal(built.ok, true, built.error);
  assert.equal(xmlSupplierOrgnr(built.xml), '917103801');
});

test('ny sending, pågående sending og allerede sendt', () => {
  const now = 10_000_000;
  assert.equal(ehfSendDecision(null, { now }), 'send');
  assert.equal(ehfSendDecision({ status: 'failed' }, { now }), 'send');
  assert.equal(ehfSendDecision({ status: 'sending', startedAtMs: now - 1000 }, { now }), 'in-progress');
  assert.equal(ehfSendDecision({ status: 'sending', startedAtMs: now - EHF_SENDING_STALE_MS - 1 }, { now }), 'send');
  assert.equal(ehfSendDecision({ status: 'sent', lastSentAtMs: now - 3_600_000 }, { now }), 'already-sent');
  assert.equal(ehfSendDecision({ status: 'sent', lastSentAtMs: now - 3_600_000 }, { now, resend: true }), 'send');
  assert.equal(ehfSendDecision({ status: 'sent', lastSentAtMs: now - 5000 }, { now, resend: true }), 'just-sent');
  assert.equal(
    ehfSendDecision({ status: 'sent', lastSentAtMs: now - EHF_RESEND_COOLDOWN_MS - 1 }, { now, resend: true }),
    'send',
  );
  // Sendt før låsen fantes: appen har registrert leveransen på fakturaen.
  const invoice = { deliveries: [{ channel: 'ehf', status: 'sent' }] };
  assert.equal(invoiceHasEhfDelivery(invoice), true);
  assert.equal(invoiceHasEhfDelivery({ deliveries: [{ channel: 'ehf', status: 'failed' }] }), false);
  assert.equal(ehfSendDecision(null, { invoice, now }), 'already-sent');
  assert.equal(ehfSendDecision(null, { invoice, now, resend: true }), 'send');
  assert.equal(ehfLockId('f1', 'inv_1'), 'f1_inv_1');
});

test('sendInvoiceEhf bruker serverens orgnr og låsen', () => {
  const src = readFileSync(new URL('./invoiceDelivery.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export const sendInvoiceEhf'), src.indexOf('export const lookupPeppolReceiver'));
  assert.equal(/senderOrgnr: data\.senderOrgnr/.test(fn), false, 'avsender fra klienten brukes ikke');
  assert.match(fn, /senderOrgnrFromFamily\(family\)/);
  assert.match(fn, /xmlSupplierOrgnr\(xml\) !== senderOrgnr/);
  assert.match(fn, /db\.runTransaction/);
  assert.match(fn, /ehfDeliveries\//);
  assert.ok(fn.indexOf('runTransaction') < fn.indexOf('deliverEhf('), 'låsen tas før sendingen');

  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.equal(rules.includes('ehfDeliveries'), false, 'låsen har ingen klientregel (bare serveren)');
});
