/**
 * DS-09: et fakturautkast viser kunden slik den står i kunderegisteret når utkastet åpnes,
 * og kunden kopieres inn for godt først ved ferdigstilling. Felt brukeren endrer selv i
 * utkastet, blir stående. Ferdigstilte fakturaer og kreditnotaer røres ikke.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeInvoice } from './invoices.js';
import { updateDraft } from './invoiceFlow.js';
import { buildInvoiceDraft } from './invoiceDraft.js';
import { customerFieldsFrom, draftCustomer, editedCustomerFields, withRegistryCustomer } from './invoiceCustomer.js';
import { finalize } from '../../screens/economy/invoice/invoiceActions.js';

const before = {
  id: 'k1', name: 'Bygg AS', customerNumber: '10', orgnr: '912345678',
  address: 'Gata 1', postalCode: '4006', place: 'Stavanger', invoiceEmail: 'faktura@bygg.no', contactName: 'Per',
};
const after = {
  ...before, name: 'Berg Bygg AS', orgnr: '998877665', address: 'Nyveien 2', postalCode: '4020', invoiceEmail: 'ap@bergbygg.no',
};

function draftFor(customer) {
  const selection = {
    project: { id: 'p1', number: '100', name: 'Skole', pricingModel: 'hourly' },
    customer,
    customerId: customer.id,
    customerNumber: customer.customerNumber,
    customerName: customer.name,
    orgnr: customer.orgnr,
    projectId: 'p1',
    projectNumber: '100',
    projectName: 'Skole',
    pricingModel: 'hourly',
    fixed: { key: 'f:p1', model: 'fixed', description: 'Fastpris', amount: 10000, quantity: 1 },
    fixedAmount: 10000,
  };
  const built = buildInvoiceDraft(selection, { settings: { accountFees: '3000' }, chart: [{ code: '3000', name: 'Salg', vatCode: 'HIGH' }], today: '2026-10-20' });
  assert.equal(built.ok, true, built.error || '');
  return built.invoice;
}

test('utkastet husker hva som ble hentet fra registeret', () => {
  const draft = draftFor(before);
  assert.deepEqual(draft.customerCopy, customerFieldsFrom(before));
  assert.deepEqual(normalizeInvoice(draft).customerCopy, draft.customerCopy, 'kopien overlever lagring');
  assert.deepEqual(editedCustomerFields(draft), []);
});

test('kunden får nytt navn og org.nr.: utkastet viser det når det åpnes', () => {
  const draft = draftFor(before);
  const shown = withRegistryCustomer(draft, [after]);
  assert.equal(shown.customerName, 'Berg Bygg AS');
  assert.equal(shown.orgnr, '998877665');
  assert.equal(shown.customerEmail, 'ap@bergbygg.no');
  assert.equal(shown.customerAddress.street, 'Nyveien 2');
  assert.equal(shown.customerAddress.postalCode, '4020');
  assert.equal(draft.customerName, 'Bygg AS', 'det lagrede utkastet er urørt');
  assert.equal(withRegistryCustomer(draft, [before]), draft, 'uendret kunde gir samme objekt');
  // Kunden finnes på kundenummeret når id-en mangler.
  assert.equal(draftCustomer({ customerNumber: '10' }, [after]).id, 'k1');
});

test('felt brukeren har endret i utkastet, blir stående', () => {
  const draft = draftFor(before);
  const edited = updateDraft(draft, { customerEmail: 'prosjekt@bygg.no' }).invoice;
  assert.deepEqual(editedCustomerFields(edited), ['customerEmail']);
  const shown = withRegistryCustomer(edited, [after]);
  assert.equal(shown.customerEmail, 'prosjekt@bygg.no');
  assert.equal(shown.customerName, 'Berg Bygg AS', 'resten følger registeret');
});

test('eldre utkast uten kopi følger registeret bare når de ikke er redigert', () => {
  const { customerCopy, ...legacy } = draftFor(before);
  assert.ok(customerCopy);
  assert.equal(withRegistryCustomer(legacy, [after]).customerName, 'Berg Bygg AS');
  const editedLegacy = { ...legacy, events: [...(legacy.events || []), { type: 'edit', text: 'endret utkastet' }] };
  assert.equal(withRegistryCustomer(editedLegacy, [after]), editedLegacy);
});

test('ferdigstilte fakturaer og kreditnotaer er øyeblikksbilder', () => {
  const draft = draftFor(before);
  const issued = { ...draft, status: 'sent', issuedAt: '2026-10-21T10:00:00Z', invoiceNumber: '101' };
  assert.equal(withRegistryCustomer(issued, [after]), issued);
  const credit = { ...draft, kind: 'credit_note', creditNoteForId: 'inv_1' };
  assert.equal(withRegistryCustomer(credit, [after]), credit);
});

test('ferdigstilling kopierer kunden fra registeret slik den er nå', async () => {
  const draft = draftFor(before);
  const saved = [];
  const store = {
    async saveInvoice(familyId, invoice) { saved.push(invoice); return invoice; },
    async issueInvoiceWithNumber(familyId, invoice, { build }) {
      const result = build('101', draft);
      assert.equal(result.ok, true, result.error || '');
      saved.push(result.invoice);
      return result.invoice;
    },
  };
  const ctx = {
    familyId: 'co',
    store,
    customers: [after],
    settings: {},
    invoices: [],
    actor: { byUid: 'u1', byName: 'Ada' },
    supplier: { name: 'Leverandør AS', orgnr: '911222333', address: 'Veien 1', postalCode: '0150', city: 'Oslo', bankAccount: '12345678903', vatRegistered: true },
  };
  // Siden ble åpnet før kunden fikk nytt navn: den sender den gamle kopien.
  const done = await finalize(ctx, draft, { date: '2026-10-21' });
  assert.equal(done.invoice.invoiceNumber, '101');
  assert.equal(done.invoice.customerName, 'Berg Bygg AS');
  assert.equal(done.invoice.orgnr, '998877665');
  assert.ok(done.invoice.issuedAt, 'utstedt og låst');
});
