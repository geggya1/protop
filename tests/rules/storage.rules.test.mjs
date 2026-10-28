/**
 * Storage-reglene (storage.rules) mot Storage- og Firestore-emulatoren (SEC-15, L-18):
 *
 *   npx firebase emulators:exec --only firestore,storage --config firebase.storage-rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/storage.rules.test.mjs"
 *
 * Bedrift A: own = eier, hr = HR-ansvarlig, bob = ansatt (post emp_bob), okon = Faktura
 * Begrenset redigering. ext = bruker utenfor.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { Timestamp, doc, setDoc } from 'firebase/firestore';

const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
let env;

const store = (uid) => env.authenticatedContext(uid).storage();
const put = (uid, path, meta = {}) => store(uid).ref(path).putString('x', 'raw', { contentType: 'text/plain', ...meta });
const read = (uid, path) => store(uid).ref(path).getMetadata();

const hrGrants = { hr: 'write', hrPeople: 'write', hrAgreements: 'write', hrPayroll: 'write', hrFollowup: 'write', hrCompliance: 'write', hrRecruitment: 'write' };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 9298 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), { type: 'company', ownerUid: 'own', adminUids: ['own'], members: ['own', 'hr', 'bob', 'okon'] });
    await setDoc(doc(db, 'families', A, 'accessAcl', 'hr'), { uid: 'hr', grants: hrGrants, employeeId: 'emp_hr', expiresAt: FUTURE });
    await setDoc(doc(db, 'families', A, 'accessAcl', 'bob'), { uid: 'bob', grants: { employees: 'see', hours: 'read' }, employeeId: 'emp_bob', expiresAt: FUTURE });
    await setDoc(doc(db, 'families', A, 'accessAcl', 'okon'), { uid: 'okon', grants: { economyInvoices: 'read' }, employeeId: 'emp_okon', expiresAt: FUTURE });
    const s = ctx.storage();
    const seed = (path, uploadedBy) => s.ref(path).putString('x', 'raw', { contentType: 'text/plain', customMetadata: { uploadedBy } });
    await seed(`families/${A}/hr/emp_eve/avtale.pdf`, 'hr');
    await seed(`families/${A}/hr/emp_bob/avtale.pdf`, 'hr');
    await seed(`families/${A}/hr/applications/cv.pdf`, 'hr');
    await seed(`families/${A}/invoices/inv1/Faktura-100.pdf`, 'okon');
    await seed(`families/${A}/mileage/1-kvittering.jpg`, 'okon');
    await seed('families/personal/mileage/1-eve.jpg', 'eve');
  });
});

describe('Storage-regler', () => {
  test('egen mappe, og ingenting utenfor de kjente mappene', async () => {
    await assertSucceeds(put('bob', 'users/bob/a.txt'));
    await assertFails(put('bob', 'users/eve/a.txt'));
    await assertFails(put('bob', 'annet/a.txt'));
    await assertFails(read('ext', `families/${A}/chats/c1/a.jpg`));
  });

  test('HR-filer: HR og eier; den ansatte leser bare sin egen mappe', async () => {
    await assertFails(read('bob', `families/${A}/hr/emp_eve/avtale.pdf`));
    await assertSucceeds(read('bob', `families/${A}/hr/emp_bob/avtale.pdf`));
    await assertFails(read('bob', `families/${A}/hr/applications/cv.pdf`));
    await assertFails(put('bob', `families/${A}/hr/emp_bob/ny.pdf`));
    await assertSucceeds(read('hr', `families/${A}/hr/applications/cv.pdf`));
    await assertSucceeds(put('hr', `families/${A}/hr/emp_eve/ny.pdf`));
    await assertSucceeds(read('own', `families/${A}/hr/emp_eve/avtale.pdf`));
  });

  test('fakturaarkivet: bare økonomi, og en fil som finnes, overskrives ikke', async () => {
    await assertFails(read('bob', `families/${A}/invoices/inv1/Faktura-100.pdf`));
    await assertSucceeds(read('okon', `families/${A}/invoices/inv1/Faktura-100.pdf`));
    await assertSucceeds(put('okon', `families/${A}/invoices/inv1/vedlegg.pdf`));
    await assertFails(put('okon', `families/${A}/invoices/inv1/Faktura-100.pdf`));
    await assertFails(put('own', `families/${A}/invoices/inv1/Faktura-100.pdf`));
    await assertFails(put('bob', `families/${A}/invoices/inv2/x.pdf`));
  });

  test('kvitteringer og personlige filer: den som lastet opp', async () => {
    await assertFails(read('bob', `families/${A}/mileage/1-kvittering.jpg`));
    await assertSucceeds(read('okon', `families/${A}/mileage/1-kvittering.jpg`));
    await assertFails(put('bob', `families/${A}/mileage/1-kvittering.jpg`, { customMetadata: { uploadedBy: 'bob' } }));
    await assertSucceeds(put('bob', `families/${A}/mileage/2-bob.jpg`, { customMetadata: { uploadedBy: 'bob' } }));
    await assertFails(read('bob', 'families/personal/mileage/1-eve.jpg'));
    await assertFails(put('bob', 'families/personal/mileage/1-eve.jpg'));
    await assertSucceeds(read('eve', 'families/personal/mileage/1-eve.jpg'));
  });

  test('gruppebilder: egen uid eller en gruppe en er med i', async () => {
    await assertSucceeds(put('bob', 'groups/bob-1730000000000.jpg'));
    await assertSucceeds(put('bob', `groups/${A}-1730000000000.jpg`));
    await assertFails(put('ext', `groups/${A}-1730000000001.jpg`));
    await assertSucceeds(read('ext', 'groups/bob-1730000000000.jpg'));
  });
});
