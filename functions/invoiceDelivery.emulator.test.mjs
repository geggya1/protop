/**
 * Faktura på e-post og EHF (DRIFT-18): bare den med fakturatilgang kan sende selskapets faktura.
 * Innleide og ansatte uten Faktura i tilgangsstyringen avvises før noe annet skjer.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/invoiceDelivery.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { sendInvoiceEhf, sendInvoiceMail } = await import('./invoiceDelivery.js');

const db = getFirestore();
const A = 'companyA';

function call(fn, uid, data) {
  return fn.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function code(promise) {
  try {
    await promise;
    return 'ok';
  } catch (err) {
    return err?.code || String(err?.message || err);
  }
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc(`families/${A}`).set({
    name: 'Bygg AS', type: 'organization', ownerUid: 'own', adminUids: ['own'],
    members: ['own', 'oko', 'ivan', 'anne'],
    company: { navn: 'Bygg AS', organisasjonsnummer: '912345678' },
  });
  await db.doc(`families/${A}/employees/emp-oko`).set({ personUid: 'oko', person: { firstName: 'Øystein' }, company: { accessLevel: 'leder', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-ivan`).set({ personUid: 'ivan', person: { firstName: 'Ivan' }, company: { accessLevel: 'innleie_ekstern', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-anne`).set({ personUid: 'anne', person: { firstName: 'Anne' }, company: { accessLevel: 'ansatt', status: 'active' } });
  await db.doc(`families/${A}/invoices/inv-1`).set({
    invoiceNumber: '1', status: 'sent', customerName: 'Kunde AS', customerEmail: 'faktura@kunde.no', orgnr: '948243113',
  });
});

const fraud = {
  familyId: A,
  invoiceId: 'inv-1',
  to: ['svindel@example.com'],
  subject: 'Ny bankkonto for betaling',
  text: 'Hei, vi har byttet bank. Betal til konto 9999.99.99999.',
  fromName: 'Bygg AS',
  replyTo: 'svindel@example.com',
};

test('innleid og ansatt uten fakturatilgang kan ikke sende selskapets faktura på e-post', async () => {
  assert.equal(await code(call(sendInvoiceMail, 'ivan', fraud)), 'permission-denied');
  assert.equal(await code(call(sendInvoiceMail, 'anne', fraud)), 'permission-denied');
  assert.equal(await code(call(sendInvoiceMail, 'utenfor', fraud)), 'permission-denied');
});

test('den med fakturatilgang kommer forbi tilgangen (stopper her på manglende mottaker)', async () => {
  // Ingen gyldig mottaker: feilen kommer etter tilgangssjekken og oppslaget av fakturaen.
  const input = { ...fraud, to: ['ikke-en-adresse'] };
  assert.equal(await code(call(sendInvoiceMail, 'oko', input)), 'invalid-argument');
  assert.equal(await code(call(sendInvoiceMail, 'own', input)), 'invalid-argument');
});

test('innleid kan ikke sende EHF for selskapets faktura', async () => {
  const input = { familyId: A, invoiceId: 'inv-1', xml: '<x/>' };
  assert.equal(await code(call(sendInvoiceEhf, 'ivan', input)), 'permission-denied');
  // Med tilgang: avvises først på selve fila.
  assert.equal(await code(call(sendInvoiceEhf, 'oko', input)), 'invalid-argument');
});
