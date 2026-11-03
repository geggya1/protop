/**
 * Kundeundersøkelsen (src/surveys/customerService.js) lagres bare via serveren (callable
 * customerSurvey med Admin SDK). Ingen i appen, heller ikke eieren, og ingen uten innlogging
 * kan lese eller skrive undersøkelsene, mottakerne, svarene eller lenkene direkte.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/customerSurvey.rules.test.mjs"
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

const A = 'companyA';
let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), { name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own'], members: ['own'] });
    await setDoc(doc(db, 'customerSurveys', 'ku1'), { familyId: A, title: 'Kundeundersøkelse', status: 'open', anonymous: false });
    await setDoc(doc(db, 'customerSurveys', 'ku1', 'recipients', 'r1'), { email: 'per@kunde.no', sentAt: '2026-10-01' });
    await setDoc(doc(db, 'customerSurveys', 'ku1', 'answers', 'a1'), { answers: { nps: 9 }, customerName: 'Novaform AS' });
    await setDoc(doc(db, 'customerSurveyLinks', 'hash1'), { surveyId: 'ku1', familyId: A, recipientId: 'r1' });
    await setDoc(doc(db, 'customerSurveyTemplates', 'mal1'), { familyId: A, name: 'Prosjektevaluering', kind: 'project', questions: [] });
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

describe('Kundeundersøkelse', () => {
  test('eieren kan verken lese eller skrive direkte (bare via serveren)', async () => {
    const db = as('own');
    await assertFails(getDoc(doc(db, 'customerSurveys', 'ku1')));
    await assertFails(getDocs(query(collection(db, 'customerSurveys'), where('familyId', '==', A))));
    await assertFails(setDoc(doc(db, 'customerSurveys', 'ku2'), { familyId: A, status: 'draft' }));
    await assertFails(updateDoc(doc(db, 'customerSurveys', 'ku1'), { status: 'closed' }));
    await assertFails(deleteDoc(doc(db, 'customerSurveys', 'ku1')));
    await assertFails(getDoc(doc(db, 'customerSurveys', 'ku1', 'recipients', 'r1')));
    await assertFails(getDocs(collection(db, 'customerSurveys', 'ku1', 'answers')));
    await assertFails(setDoc(doc(db, 'customerSurveys', 'ku1', 'answers', 'a2'), { answers: { nps: 10 } }));
    await assertFails(getDoc(doc(db, 'customerSurveyLinks', 'hash1')));
    // Malene går også bare via serveren.
    await assertFails(getDoc(doc(db, 'customerSurveyTemplates', 'mal1')));
    await assertFails(getDocs(query(collection(db, 'customerSurveyTemplates'), where('familyId', '==', A))));
    await assertFails(setDoc(doc(db, 'customerSurveyTemplates', 'mal2'), { familyId: A, name: 'Ny' }));
  });

  test('kunden uten innlogging kan ikke lese lenker, svar eller skrive svar direkte', async () => {
    const db = anon();
    await assertFails(getDoc(doc(db, 'customerSurveyLinks', 'hash1')));
    await assertFails(getDocs(collection(db, 'customerSurveyLinks')));
    await assertFails(getDoc(doc(db, 'customerSurveys', 'ku1')));
    await assertFails(setDoc(doc(db, 'customerSurveys', 'ku1', 'answers', 'a2'), { answers: { nps: 10 } }));
    await assertFails(updateDoc(doc(db, 'customerSurveys', 'ku1', 'recipients', 'r1'), { answeredAt: 'nå' }));
  });

  test('en annen innlogget bruker får heller ikke tilgang', async () => {
    const db = as('ext');
    await assertFails(getDoc(doc(db, 'customerSurveys', 'ku1')));
    await assertFails(getDocs(collection(db, 'customerSurveys', 'ku1', 'answers')));
  });
});
