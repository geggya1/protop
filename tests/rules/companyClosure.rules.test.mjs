/**
 * Avslutning av bedriften (GRUNN-03): fristen for sletting settes bare av serveren.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/companyClosure.rules.test.mjs"
 *
 * Bedrift A: own = eier, adm = administrator, bob = ansatt.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  deleteField, doc, getDoc, setDoc, updateDoc,
} from 'firebase/firestore';

const RULES = process.env.RULES_FILE || new URL('../../firestore.rules', import.meta.url);
const A = 'companyA';
const CLOSED = {
  status: 'closed', closedAt: '2026-10-28T10:00:00.000Z', deleteAfter: '2027-01-26T10:00:00.000Z', closedByUid: 'own',
};
let env;

const as = (uid) => env.authenticatedContext(uid).firestore();

async function seed({ closed = false } = {}) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'bob'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      company: { navn: 'Bygg AS' },
      ...(closed ? { closure: CLOSED, closedAt: CLOSED.closedAt, deleteAfter: CLOSED.deleteAfter } : {}),
    });
    for (const uid of members) await setDoc(doc(db, 'families', A, 'parents', uid), { uid, active: true });
    await setDoc(doc(db, 'companyClosures', A), { companyId: A, ...CLOSED });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(() => seed());

describe('GRUNN-03: avslutning av bedriften', () => {
  test('ingen klient kan sette fristen for sletting, heller ikke eier eller administrator', async () => {
    for (const uid of ['own', 'adm', 'bob']) {
      await assertFails(updateDoc(doc(as(uid), 'families', A), { deleteAfter: '2020-01-01T00:00:00.000Z' }));
      await assertFails(updateDoc(doc(as(uid), 'families', A), { closure: CLOSED }));
      await assertFails(updateDoc(doc(as(uid), 'families', A), { closedAt: CLOSED.closedAt }));
    }
  });

  test('en avsluttet bedrift: avslutningen kan ikke endres eller fjernes av klienter', async () => {
    await seed({ closed: true });
    for (const uid of ['own', 'adm', 'bob']) {
      await assertFails(updateDoc(doc(as(uid), 'families', A), { closure: deleteField(), closedAt: deleteField(), deleteAfter: deleteField() }));
      await assertFails(updateDoc(doc(as(uid), 'families', A), { 'closure.deleteAfter': '2020-01-01T00:00:00.000Z' }));
    }
  });

  test('vanlige endringer på bedriften virker som før, også når den er avsluttet', async () => {
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), { name: 'Bygg og Anlegg AS' }));
    await seed({ closed: true });
    await assertSucceeds(updateDoc(doc(as('adm'), 'families', A), { 'company.addressLabel': 'Svanholmen 7' }));
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A)));
  });

  test('companyClosures er stengt for alle klienter', async () => {
    for (const uid of ['own', 'adm', 'bob']) {
      await assertFails(getDoc(doc(as(uid), 'companyClosures', A)));
      await assertFails(setDoc(doc(as(uid), 'companyClosures', A), { status: 'closed', deleteAfter: '2020-01-01T00:00:00.000Z' }));
    }
  });
});
