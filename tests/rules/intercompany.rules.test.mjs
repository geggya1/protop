/**
 * Konsernintegrasjon (src/intercompany/model.js), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/intercompany.rules.test.mjs"
 *
 * Mor (M) og datter (D) har en avtale i intercompanyLinks. Medlemmer i begge kan lese den, ingen
 * klient kan skrive den. Timer og salg som serveren speiler fra D til M (icMirror), kan M godkjenne
 * og fakturere, men ikke lage, slette eller endre i kjernen. M kan ikke godkjenne før D har godkjent.
 */
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

const M = 'famMor';
const D = 'famDatter';
let env;

const as = (uid) => env.authenticatedContext(uid).firestore();

const mirror = (over = {}) => ({
  projectId: 'prjA', employeeId: 'ic_famDatter_emp7', date: '2026-11-02', hours: 7.5, billableHours: 7.5,
  timeType: 'ordinary', status: 'låst', invoiceId: null, description: 'Mur',
  icMirror: true,
  intercompany: { mirror: true, linkId: 'icl-1', sourceCompanyId: D, supplierApproved: true },
  ...over,
});

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', M), { name: 'Mor AS', type: 'company', ownerUid: 'mor', adminUids: ['mor'], members: ['mor'], activeUsers: ['mor'] });
    await setDoc(doc(db, 'families', D), { name: 'Datter AS', type: 'company', ownerUid: 'dat', adminUids: ['dat'], members: ['dat'], activeUsers: ['dat'] });
    await setDoc(doc(db, 'families', 'X'), { name: 'Annen AS', type: 'company', ownerUid: 'x', adminUids: ['x'], members: ['x'], activeUsers: ['x'] });
    for (const [fam, uid] of [[M, 'mor'], [D, 'dat'], ['X', 'x']]) {
      await setDoc(doc(db, 'families', fam, 'parents', uid), { uid, active: true });
    }
    await setDoc(doc(db, 'intercompanyLinks', 'icl-1'), {
      id: 'icl-1', status: 'active', parentCompanyId: M, childCompanyId: D, companyIds: [M, D],
      parent: { id: M, name: 'Mor AS' }, child: { id: D, name: 'Datter AS' },
    });
    await setDoc(doc(db, 'intercompanyLinks', 'icl-1', 'projects', 'prjA'), { ownerCompanyId: M, supplierCompanyId: D });
    await setDoc(doc(db, 'families', M, 'timeEntries', 'ic_famDatter_t1'), mirror());
    await setDoc(doc(db, 'families', M, 'timeEntries', 'ic_famDatter_t2'), mirror({ status: 'registrert', intercompany: { mirror: true, supplierApproved: false } }));
    await setDoc(doc(db, 'families', M, 'productSales', 'ic_famDatter_s1'), {
      id: 'ic_famDatter_s1', name: 'Gips', quantity: 10, unitPrice: 99, projectId: 'prjA', status: 'draft',
      icMirror: true, intercompany: { mirror: true, supplierApproved: false },
    });
    await setDoc(doc(db, 'families', M, 'productSales', 'own1'), { id: 'own1', name: 'Egen', quantity: 1, unitPrice: 10, status: 'draft' });
  });
});

test('avtalen leses av begge selskapene, ikke av andre, og skrives bare av serveren', async () => {
  await assertSucceeds(getDoc(doc(as('mor'), 'intercompanyLinks', 'icl-1')));
  await assertSucceeds(getDoc(doc(as('dat'), 'intercompanyLinks', 'icl-1')));
  await assertFails(getDoc(doc(as('x'), 'intercompanyLinks', 'icl-1')));
  await assertSucceeds(getDocs(query(collection(as('mor'), 'intercompanyLinks'), where('parentCompanyId', '==', M))));
  await assertSucceeds(getDocs(query(collection(as('dat'), 'intercompanyLinks'), where('childCompanyId', '==', D))));
  await assertFails(getDocs(query(collection(as('x'), 'intercompanyLinks'), where('parentCompanyId', '==', M))));
  for (const uid of ['mor', 'dat', 'x']) {
    await assertFails(setDoc(doc(as(uid), 'intercompanyLinks', 'icl-2'), { status: 'active', parentCompanyId: M, childCompanyId: D }));
    await assertFails(updateDoc(doc(as(uid), 'intercompanyLinks', 'icl-1'), { status: 'ended' }));
    await assertFails(deleteDoc(doc(as(uid), 'intercompanyLinks', 'icl-1')));
    await assertFails(getDoc(doc(as(uid), 'intercompanyLinks', 'icl-1', 'projects', 'prjA')));
  }
});

test('speilede timer: eier godkjenner og fakturerer, men lager, sletter og endrer ikke kjernen', async () => {
  const ref = (id) => doc(as('mor'), 'families', M, 'timeEntries', id);
  await assertFails(setDoc(ref('ic_famDatter_t9'), mirror({ status: 'registrert' })));
  await assertFails(updateDoc(ref('ic_famDatter_t1'), { hours: 9 }));
  await assertFails(updateDoc(ref('ic_famDatter_t1'), { icMirror: false }));
  await assertFails(deleteDoc(ref('ic_famDatter_t1')));
  await assertFails(updateDoc(ref('ic_famDatter_t2'), { status: 'godkjent' }), 'ikke godkjent hos datter ennå');
  await assertFails(updateDoc(ref('ic_famDatter_t2'), { 'intercompany.supplierApproved': true }), 'eier kan ikke late som datter har godkjent');
  await assertFails(updateDoc(ref('ic_famDatter_t2'), { 'intercompany.supplierApproved': true, status: 'godkjent' }));
  await assertSucceeds(updateDoc(ref('ic_famDatter_t1'), { status: 'godkjent' }));
  await assertSucceeds(updateDoc(ref('ic_famDatter_t1'), { invoiceId: 'F1' }));
  // Vanlige føringer som før.
  await assertSucceeds(setDoc(ref('own1'), { projectId: 'p1', employeeId: 'emp_x', date: '2026-11-02', hours: 2, status: 'registrert', invoiceId: null }));
});

test('speilede salg: eier fakturerer, men lager, sletter og endrer ikke varen', async () => {
  const ref = (id) => doc(as('mor'), 'families', M, 'productSales', id);
  await assertFails(setDoc(ref('ic_famDatter_s9'), { name: 'Falsk', quantity: 1, unitPrice: 1, icMirror: true }));
  await assertFails(updateDoc(ref('ic_famDatter_s1'), { quantity: 1 }));
  await assertFails(updateDoc(ref('ic_famDatter_s1'), { status: 'approved' }), 'ikke klar hos datter ennå');
  await assertFails(updateDoc(ref('ic_famDatter_s1'), { 'intercompany.supplierApproved': true, status: 'approved' }));
  await assertFails(updateDoc(ref('ic_famDatter_s1'), { billable: false }));
  await assertSucceeds(updateDoc(ref('ic_famDatter_s1'), { discountPercent: 5 }), 'mors rabatt mot sluttkunden');
  await assertFails(deleteDoc(ref('ic_famDatter_s1')));
  await assertSucceeds(updateDoc(ref('ic_famDatter_s1'), { comment: 'Sjekk leveranse' }));
  await assertSucceeds(updateDoc(ref('own1'), { quantity: 3 }));
  await assertSucceeds(deleteDoc(ref('own1')));
});
