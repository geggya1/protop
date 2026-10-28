/**
 * Orgnummer-indeksen (SEC-18) skrives bare av serveren. Klienten kan verken lese den,
 * peke et orgnummer til egen bedrift eller slette den.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/orgnrIndex.rules.test.mjs"
 */
import { after, before, beforeEach, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

let env;

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
    await setDoc(doc(db, 'families', 'A'), { name: 'Rådgiver AS', type: 'organization', ownerUid: 'own', members: ['own'], orgnr: '999888777' });
    await setDoc(doc(db, 'families', 'B'), { name: 'Falsk AS', type: 'organization', ownerUid: 'mal', members: ['mal'], orgnr: '999888777' });
    await setDoc(doc(db, 'orgnrIndex', '999888777'), { orgnr: '999888777', familyId: 'A', source: 'claim' });
  });
});

test('ingen klient kan lese, ta over eller slette orgnummer-indeksen', async () => {
  for (const uid of ['own', 'mal']) {
    const db = env.authenticatedContext(uid).firestore();
    await assertFails(getDoc(doc(db, 'orgnrIndex', '999888777')));
    await assertFails(setDoc(doc(db, 'orgnrIndex', '999888777'), { orgnr: '999888777', familyId: 'B' }));
    await assertFails(setDoc(doc(db, 'orgnrIndex', '111222333'), { orgnr: '111222333', familyId: 'B' }));
    await assertFails(deleteDoc(doc(db, 'orgnrIndex', '999888777')));
  }
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'orgnrIndex', '999888777')));
});
