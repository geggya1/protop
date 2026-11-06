/**
 * AI-abonnement: rammene for AI-assistenten (aiSettings/plan) og forbruksloggen (aiLedger, aiLedgerEntries).
 * Eier, administrator og Admin på AI-abonnement endrer rammene. Lese på AI-abonnement ser forbruket.
 * Ingen klient kan skrive forbruk, heller ikke eier, og vanlige ansatte ser ingenting.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/aiSubscription.rules.test.mjs"
 *
 * Bedrift A: own = eier, adm = administrator, aia = Admin på AI-abonnement, ldr = Lese på AI-abonnement,
 * bob = ansatt. Familie F: mor (eier).
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore';

const PROJECT = 'demo-protop';
const A = 'companyA';
const F = 'familyF';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);

let env;

function as(uid) {
  return env.authenticatedContext(uid, { email: `${uid}@firma.no`, email_verified: true }).firestore();
}

const ACL = {
  adm: { levelId: 'administrator', grants: { aiSubscription: 'write' } },
  aia: { levelId: 'ansatt', grants: { aiSubscription: 'write' } },
  ldr: { levelId: 'leder', grants: { aiSubscription: 'see' } },
  bob: { levelId: 'ansatt', grants: {} },
};

function plan(uid, over = {}) {
  return {
    enabled: true,
    monthlyBudgetNok: 2000,
    onLimit: 'stop',
    perUserMonthlyNok: 0,
    deepModelEnabled: false,
    maxFileMb: 20,
    maxFilesPerMessage: 5,
    chatRetentionDays: 90,
    emailDraftsEnabled: true,
    allowedUids: ['bob'],
    externalUids: [],
    updatedAt: serverTimestamp(),
    updatedBy: uid,
    ...over,
  };
}

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'aia', 'ldr', 'bob'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      company: { navn: 'Bygg AS' },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, name: uid, active: true, admin: uid === 'own' || uid === 'adm' });
    }
    for (const [uid, row] of Object.entries(ACL)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, ...row, expiresAt: FUTURE });
    }
    await setDoc(doc(db, 'families', A, 'aiLedger', '2026-11'), { month: '2026-11', costNok: 120, calls: 40 });
    await setDoc(doc(db, 'families', A, 'aiLedger', '2026-11', 'users', 'bob'), { uid: 'bob', costNok: 12 });
    await setDoc(doc(db, 'families', A, 'aiLedgerEntries', 'e1'), { uid: 'bob', costNok: 0.4, model: 'claude-sonnet-5-5' });
    await setDoc(doc(db, 'families', F), {
      name: 'Familien', type: 'family', ownerUid: 'mor', adminUids: ['mor'], members: ['mor'], activeUsers: ['mor'],
    });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', active: true, admin: true });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(seed);

const planRef = (db, familyId = A) => doc(db, 'families', familyId, 'aiSettings', 'plan');

describe('AI-abonnement: rammene', () => {
  test('eier, administrator og Admin på AI-abonnement kan lagre', async () => {
    for (const uid of ['own', 'adm', 'aia']) {
      await assertSucceeds(setDoc(planRef(as(uid)), plan(uid)));
    }
  });

  test('Lese på AI-abonnement kan se, men ikke endre. Vanlig ansatt ser ingenting', async () => {
    await assertSucceeds(setDoc(planRef(as('own')), plan('own')));
    await assertSucceeds(getDoc(planRef(as('ldr'))));
    await assertFails(setDoc(planRef(as('ldr')), plan('ldr')));
    await assertFails(getDoc(planRef(as('bob'))));
    await assertFails(setDoc(planRef(as('bob')), plan('bob')));
    await assertFails(updateDoc(planRef(as('bob')), { enabled: false, updatedAt: serverTimestamp(), updatedBy: 'bob' }));
  });

  test('feil form avvises', async () => {
    const db = as('own');
    await assertFails(setDoc(planRef(db), plan('own', { monthlyBudgetNok: -1 })));
    await assertFails(setDoc(planRef(db), plan('own', { monthlyBudgetNok: 2_000_000 })));
    await assertFails(setDoc(planRef(db), plan('own', { onLimit: 'fortsett' })));
    await assertFails(setDoc(planRef(db), plan('own', { maxFileMb: 500 })));
    await assertFails(setDoc(planRef(db), plan('own', { model: 'claude-opus-5-5' })));
    await assertFails(setDoc(planRef(db), plan('own', { allowInnleide: true })));
    await assertFails(setDoc(planRef(db), plan('own', { allowedUids: 'bob' })));
    await assertFails(setDoc(planRef(db), plan('own', { externalUids: Array.from({ length: 1001 }, (_, i) => `u${i}`) })));
    await assertFails(setDoc(planRef(db), plan('own', { updatedBy: 'adm' })));
    await assertFails(setDoc(doc(db, 'families', A, 'aiSettings', 'annet'), plan('own')));
  });

  test('en ansatt kan ikke gi seg selv tilgang', async () => {
    await assertSucceeds(setDoc(planRef(as('own')), plan('own', { allowedUids: [] })));
    await assertFails(updateDoc(planRef(as('bob')), { allowedUids: ['bob'], updatedAt: serverTimestamp(), updatedBy: 'bob' }));
  });

  test('bare i bedrifter', async () => {
    await assertFails(setDoc(planRef(as('mor'), F), plan('mor')));
  });
});

describe('AI-abonnement: forbruket', () => {
  test('Lese på AI-abonnement ser måned og personer, Admin ser radene per kall', async () => {
    await assertSucceeds(getDoc(doc(as('ldr'), 'families', A, 'aiLedger', '2026-11')));
    await assertSucceeds(getDocs(collection(as('ldr'), 'families', A, 'aiLedger', '2026-11', 'users')));
    await assertFails(getDocs(collection(as('ldr'), 'families', A, 'aiLedgerEntries')));
    await assertSucceeds(getDocs(collection(as('aia'), 'families', A, 'aiLedgerEntries')));
  });

  test('vanlig ansatt ser ikke forbruket, heller ikke sitt eget', async () => {
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'aiLedger', '2026-11')));
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'aiLedger', '2026-11', 'users', 'bob')));
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'aiLedgerEntries', 'e1')));
  });

  test('ingen klient kan skrive forbruk, heller ikke eier', async () => {
    for (const uid of ['own', 'aia', 'bob']) {
      const db = as(uid);
      await assertFails(updateDoc(doc(db, 'families', A, 'aiLedger', '2026-11'), { costNok: 0 }));
      await assertFails(setDoc(doc(db, 'families', A, 'aiLedger', '2026-12'), { costNok: 0 }));
      await assertFails(setDoc(doc(db, 'families', A, 'aiLedger', '2026-11', 'users', uid), { costNok: 0 }));
      await assertFails(setDoc(doc(db, 'families', A, 'aiLedgerEntries', `x-${uid}`), { costNok: 0 }));
    }
  });
});
