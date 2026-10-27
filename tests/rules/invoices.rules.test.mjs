/**
 * Fakturaer og nummerserien, kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/invoices.rules.test.mjs"
 *
 * Et utkast kan endres og slettes. En ferdigstilt faktura (issuedAt) er låst: nummer, dato,
 * kunde, linjer og beløp endres ikke, og den slettes ikke. Nummeret må komme fra telleren
 * invoiceSeries/main i samme skriving, og telleren går bare oppover.
 * own = eier, ans = ansatt, ext = bruker i et annet selskap.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const A = 'companyA';
const B = 'companyB';
let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

const lines = [
  { id: 'l1', section: 'hours', description: 'Linda Øie', quantity: 10.5, unit: 'timer', unitPrice: 1090, amountExVat: 11445, vatCode: 'HIGH' },
];

const invoice = (over = {}) => ({
  kind: 'invoice', status: 'draft', invoiceNumber: '', issuedAt: '', invoiceDate: '2026-10-27', dueDate: '2026-11-24',
  customerId: 'c1', customerName: 'Sola kommune', orgnr: '948243113', lines, amountExVat: 11445, vat: 2861.25,
  amountInclVat: 14306.25, currency: 'NOK', outstandingAmount: 14306, archive: {}, events: [], ...over,
});

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), { name: 'Rådgiver AS', type: 'company', ownerUid: 'own', adminUids: ['own'], members: ['own', 'ans'] });
    await setDoc(doc(db, 'families', B), { name: 'Annet AS', type: 'company', ownerUid: 'ext', members: ['ext'] });
    await setDoc(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 100 });
    await setDoc(doc(db, 'families', A, 'invoices', 'D1'), invoice());
    await setDoc(doc(db, 'families', A, 'invoices', 'I1'), invoice({
      status: 'sent', invoiceNumber: '100', issuedAt: '2026-10-27T10:00:00Z', kid: '1000027',
      archive: { pdf: { url: 'https://example.test/100.pdf', name: 'Faktura-100.pdf' } },
    }));
    await setDoc(doc(db, 'families', A, 'invoices', 'M1'), invoice({ status: 'sent', invoiceNumber: '55', lines: [] }));
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(seed);

describe('tilgang', () => {
  test('medlemmer leser fakturaene, andre selskaper gjør det ikke', async () => {
    await assertSucceeds(getDoc(doc(as('ans'), 'families', A, 'invoices', 'I1')));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'invoices', 'I1')));
    await assertFails(setDoc(doc(as('ext'), 'families', A, 'invoices', 'X1'), invoice()));
    await assertFails(updateDoc(doc(as('ext'), 'families', A, 'invoices', 'D1'), { customerName: 'Endret' }));
  });
});

describe('utkast og importerte fakturaer', () => {
  test('utkast kan lages, endres og slettes', async () => {
    const db = as('ans');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'invoices', 'D2'), invoice()));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'invoices', 'D1'), { customerName: 'Sandnes kommune', lines: [] }));
    await assertSucceeds(deleteDoc(doc(db, 'families', A, 'invoices', 'D1')));
  });

  test('importert faktura uten issuedAt kan rettes og slettes som før', async () => {
    const db = as('ans');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'invoices', 'M1'), { amountExVat: 900, status: 'paid' }));
    await assertSucceeds(deleteDoc(doc(db, 'families', A, 'invoices', 'M1')));
  });
});

describe('ferdigstilling med nummer fra serien', () => {
  test('nummer og teller i samme skriving går gjennom', async () => {
    const db = as('ans');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 101 }, { merge: true });
    batch.set(doc(db, 'families', A, 'invoices', 'D1'), { status: 'issued', invoiceNumber: '101', issuedAt: '2026-10-28T09:00:00Z' }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  test('første faktura oppretter telleren', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), 'families', A, 'invoiceSeries', 'main'));
    });
    const db = as('ans');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 16720, updatedAt: '2026-10-28T09:00:00Z' }, { merge: true });
    batch.set(doc(db, 'families', A, 'invoices', 'D1'), { status: 'issued', invoiceNumber: '16720', issuedAt: '2026-10-28T09:00:00Z' }, { merge: true });
    await assertSucceeds(batch.commit());
  });

  test('appen lagrer hele dokumentet på nytt etter ferdigstilling (arkiv og sending)', async () => {
    const db = as('ans');
    const issued = invoice({
      status: 'issued', invoiceNumber: '100', issuedAt: '2026-10-27T10:00:00Z', kid: '1000027',
      archive: { pdf: { url: 'https://example.test/100.pdf', name: 'Faktura-100.pdf' } },
    });
    await assertSucceeds(setDoc(doc(db, 'families', A, 'invoices', 'I1'), {
      ...issued,
      status: 'sent',
      archive: { ...issued.archive, xml: { url: 'https://example.test/100.xml' } },
      deliveries: [{ channel: 'ehf', at: '2026-10-27T10:05:00Z' }],
      updatedAt: '2026-10-27T10:05:00Z',
    }, { merge: true }));
  });

  test('nummer som ikke er telleren, avvises', async () => {
    const db = as('ans');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 101 }, { merge: true });
    batch.set(doc(db, 'families', A, 'invoices', 'D1'), { status: 'issued', invoiceNumber: '105', issuedAt: '2026-10-28T09:00:00Z' }, { merge: true });
    await assertFails(batch.commit());
  });

  test('et brukt nummer kan ikke tas på nytt uten at telleren flyttes', async () => {
    const db = as('ans');
    await assertFails(setDoc(doc(db, 'families', A, 'invoices', 'D1'), { status: 'issued', invoiceNumber: '100', issuedAt: '2026-10-28T09:00:00Z' }, { merge: true }));
    await assertFails(setDoc(doc(db, 'families', A, 'invoices', 'X2'), invoice({ status: 'issued', invoiceNumber: '100', issuedAt: '2026-10-28T09:00:00Z' })));
  });

  test('telleren går bare oppover og slettes ikke', async () => {
    const db = as('own');
    await assertFails(updateDoc(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 99 }));
    await assertFails(updateDoc(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: '101' }));
    await assertFails(deleteDoc(doc(db, 'families', A, 'invoiceSeries', 'main')));
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'invoiceSeries', 'main'), { last: 120 }));
  });
});

describe('ferdigstilt faktura er låst', () => {
  test('status, betaling, forsendelse og hendelser kan oppdateres', async () => {
    const db = as('ans');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'invoices', 'I1'), {
      status: 'paid', outstandingAmount: 0, payments: [{ id: 'p1', date: '2026-11-01', amount: 14306 }],
      deliveries: [{ channel: 'email', at: '2026-10-27' }], events: [{ type: 'payment' }], collection: { reminderSent: true },
    }));
  });

  test('arkivet kan fylles inn, men ikke byttes', async () => {
    const db = as('ans');
    await assertSucceeds(updateDoc(doc(db, 'families', A, 'invoices', 'I1'), {
      archive: { pdf: { url: 'https://example.test/100.pdf', name: 'Faktura-100.pdf' }, xml: { url: 'https://example.test/100.xml' } },
    }));
    await assertFails(updateDoc(doc(db, 'families', A, 'invoices', 'I1'), { 'archive.pdf': { url: 'https://example.test/annen.pdf' } }));
  });

  test('nummer, dato, kunde, linjer og beløp kan ikke endres', async () => {
    const db = as('own');
    const ref = doc(db, 'families', A, 'invoices', 'I1');
    await assertFails(updateDoc(ref, { invoiceNumber: '99' }));
    await assertFails(updateDoc(ref, { invoiceDate: '2026-10-01' }));
    await assertFails(updateDoc(ref, { customerName: 'Annen kunde' }));
    await assertFails(updateDoc(ref, { lines: [] }));
    await assertFails(updateDoc(ref, { amountExVat: 1 }));
    await assertFails(updateDoc(ref, { kid: '' }));
    await assertFails(updateDoc(ref, { issuedAt: '' }));
  });

  test('ferdigstilt faktura kan ikke slettes, heller ikke av eier', async () => {
    await assertFails(deleteDoc(doc(as('own'), 'families', A, 'invoices', 'I1')));
  });
});
