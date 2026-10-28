/**
 * Faktura på e-post (DRIFT-18): tilgang, mottakere og avsendernavn.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { allows, standardGrants } from '../src/access/companyAccess.js';
import {
  INVOICE_SEND_ACCESS,
  invoiceKnownRecipients,
  invoiceMailFromName,
  invoiceMailRecipients,
  mailDomain,
} from './invoiceMailGuard.js';

test('fakturatilgangen er den samme som «Send faktura» i appen', () => {
  assert.equal(INVOICE_SEND_ACCESS.resource, 'economyInvoices');
  assert.equal(INVOICE_SEND_ACCESS.action, 'read');
  // Leder og administrator kan sende; ansatt og innleid kan ikke.
  for (const level of ['administrator', 'leder']) {
    assert.equal(allows(standardGrants(level), INVOICE_SEND_ACCESS.resource, INVOICE_SEND_ACCESS.action), true, level);
  }
  for (const level of ['ansatt', 'innleie_ekstern', 'avdelingsleder']) {
    assert.equal(allows(standardGrants(level), INVOICE_SEND_ACCESS.resource, INVOICE_SEND_ACCESS.action), false, level);
  }
});

test('mottakerne deles i fakturaens egne og dem avsenderen har lagt inn', () => {
  const invoice = { customerEmail: 'Faktura@Kunde.no', customerCopy: { email: 'post@kunde.no' } };
  assert.deepEqual(invoiceKnownRecipients(invoice), ['faktura@kunde.no', 'post@kunde.no']);
  assert.deepEqual(
    invoiceMailRecipients(invoice, ['faktura@kunde.no', 'regnskap@byra.no', 'FAKTURA@kunde.no']),
    { known: ['faktura@kunde.no'], outside: ['regnskap@byra.no'] },
  );
  assert.deepEqual(invoiceMailRecipients({}, ['x@y.no']), { known: [], outside: ['x@y.no'] });
  assert.equal(mailDomain('Ola@Byra.NO'), 'byra.no');
  assert.equal(mailDomain('ugyldig'), '');
});

test('avsendernavnet er selskapets, ikke det appen sender', () => {
  assert.equal(invoiceMailFromName({ name: 'Gammelt', company: { navn: 'Bygg <AS>' } }), 'Bygg AS');
  assert.equal(invoiceMailFromName({ name: 'Bygg AS' }), 'Bygg AS');
  assert.equal(invoiceMailFromName({}), 'ProTop');
});

test('sendInvoiceMail og sendInvoiceEhf krever fakturatilgang før noe annet', () => {
  const src = readFileSync(new URL('./invoiceDelivery.js', import.meta.url), 'utf8');
  const mail = src.slice(src.indexOf('export const sendInvoiceMail'), src.indexOf('export const sendInvoiceEhf'));
  const ehf = src.slice(src.indexOf('export const sendInvoiceEhf'), src.indexOf('export const lookupPeppolReceiver'));
  for (const fn of [mail, ehf]) {
    assert.match(fn, /assertCompanyAccess\(db, familyId, uid, INVOICE_SEND_ACCESS\)/);
    assert.equal(/assertFamilyMember\(/.test(fn), false, 'medlemskap alene er ikke nok');
    assert.ok(fn.indexOf('assertCompanyAccess') < fn.indexOf('issuedInvoice('), 'tilgangen sjekkes før fakturaen leses');
  }
  assert.equal(/data\.fromName/.test(mail), false, 'avsendernavnet fra appen brukes ikke');
  assert.match(mail, /invoiceMailFromName\(/);
  assert.match(mail, /sentBy: uid/);
});
