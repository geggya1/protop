/**
 * Brukernavn (usernames/{navn}) kan ikke beslaglegges for andre (SEC-19).
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/usernames.rules.test.mjs"
 *
 * mor = foresatt i familien F, kid = barnet, ext = fremmed, gammel = konto med et eldre navnedokument.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  deleteDoc, doc, getDoc, runTransaction, serverTimestamp, setDoc,
} from 'firebase/firestore';

const F = 'famF';
let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

/** Samme skriving som claimUsername i appen (src/utils/usernames.js). */
function claim(db, name, uid, type = 'adult') {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'usernames', name);
    await tx.get(ref);
    tx.set(ref, { uid, type, username: name, updatedAt: serverTimestamp() });
  });
}

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', F), {
      name: 'Familien', type: 'family', ownerUid: 'mor', adminUids: ['mor'], members: ['mor', 'kid'],
    });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', email: 'mor@x.no', admin: true });
    await setDoc(doc(db, 'families', F, 'children', 'kid'), { uid: 'kid', familyId: F, name: 'Kid' });
    await setDoc(doc(db, 'children', 'kid'), { uid: 'kid', familyId: F, name: 'Kid' });
    await setDoc(doc(db, 'users', 'kid'), { uid: 'kid', role: 'child' });
    for (const uid of ['mor', 'ext', 'gammel']) {
      await setDoc(doc(db, 'users', uid), { uid, displayName: uid });
    }
    await setDoc(doc(db, 'usernames', 'mormor'), { uid: 'mor', type: 'adult', username: 'mormor' });
    await setDoc(doc(db, 'usernames', 'kiddo'), { uid: 'kid', type: 'child', username: 'kiddo' });
    // Eldre dokument: uten type, med e-post.
    await setDoc(doc(db, 'usernames', 'gammel'), { uid: 'gammel', email: 'gammel@x.no' });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(seed);

describe('brukernavn (SEC-19)', () => {
  test('eieren tar et ledig navn til seg selv slik appen gjør', async () => {
    await assertSucceeds(claim(as('ext'), 'ekstern12', 'ext'));
    // Samme navn igjen (profilen lagres på nytt) er en oppdatering av eget navn.
    await assertSucceeds(claim(as('ext'), 'ekstern12', 'ext'));
    await assertSucceeds(deleteDoc(doc(as('ext'), 'usernames', 'ekstern12')));
  });

  test('ingen kan ta et navn som peker på en annen konto', async () => {
    // PoC 18: «barn» som peker på en voksen, eller på et barn man ikke er foresatt til.
    await assertFails(claim(as('ext'), 'mor-sjef', 'mor', 'child'));
    await assertFails(claim(as('ext'), 'kidclone', 'kid', 'child'));
    await assertFails(claim(as('ext'), 'falsk', 'mor', 'adult'));
    await assertFails(claim(as('ext'), 'mormor', 'ext'));
  });

  test('foresatt kan ta, endre og fjerne navn til eget barn', async () => {
    await assertSucceeds(claim(as('mor'), 'lillekid', 'kid', 'child'));
    await assertSucceeds(claim(as('mor'), 'kiddo', 'kid', 'child'));
    await assertSucceeds(deleteDoc(doc(as('mor'), 'usernames', 'kiddo')));
    await assertFails(deleteDoc(doc(as('ext'), 'usernames', 'lillekid')));
    // En voksen kan ikke gjøres om til «barn» for å komme forbi.
    await assertFails(claim(as('mor'), 'mormor', 'mor', 'child'));
  });

  test('navnet må være et brukernavn, ikke en e-postadresse', async () => {
    await assertFails(claim(as('ext'), 'mor@x.no', 'ext'));
    await assertFails(claim(as('ext'), 'Mor Mor', 'ext'));
    await assertFails(claim(as('ext'), 'ab', 'ext'));
    await assertFails(claim(as('ext'), 'a'.repeat(25), 'ext'));
    // Brukernavnfeltet må være navnet, og ingen e-post eller andre felt å peke på.
    await assertFails(setDoc(doc(as('ext'), 'usernames', 'ekstern1'), { uid: 'ext', type: 'adult', username: 'annet' }));
    await assertFails(setDoc(doc(as('ext'), 'usernames', 'ekstern2'), {
      uid: 'ext', type: 'adult', username: 'ekstern2', email: 'mor@x.no',
    }));
    await assertFails(setDoc(doc(as('ext'), 'usernames', 'ekstern3'), { uid: 'ext', type: 'admin', username: 'ekstern3' }));
  });

  test('eier og type ligger fast; eldre navn uten type kan lagres på nytt', async () => {
    await assertFails(setDoc(doc(as('mor'), 'usernames', 'mormor'), { uid: 'mor', type: 'child', username: 'mormor' }));
    await assertFails(setDoc(doc(as('mor'), 'usernames', 'mormor'), { uid: 'ext', type: 'adult', username: 'mormor' }));
    await assertFails(claim(as('ext'), 'gammel', 'ext'));
    await assertSucceeds(claim(as('gammel'), 'gammel', 'gammel'));
  });

  test('oppslag før innlogging virker som før', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'usernames', 'mormor')));
    await assertFails(claim(env.unauthenticatedContext().firestore(), 'anonym', 'x'));
  });
});
