/**
 * claimUsername (SEC-19): ett aktivt brukernavn per konto, også når noen prøver med egne kall.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/usernameClaim.emulator.test.mjs"
 *
 * ola = voksen, kari = annen voksen, mor = foresatt til barnet kid i familien F, ext = fremmed.
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { claimUsername, claimRequest, namesToRelease } = await import('./usernameClaim.js');

const db = getFirestore();

function call(uid, data) {
  return claimUsername.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function names(uid) {
  const snap = await db.collection('usernames').where('uid', '==', uid).get();
  return snap.docs.map((d) => d.id).sort();
}

async function rejects(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, error.message);
    return true;
  });
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc('families/F').set({ name: 'Familien', type: 'family', ownerUid: 'mor', members: ['mor', 'kid'] });
  await db.doc('families/F/parents/mor').set({ uid: 'mor', active: true });
  await db.doc('children/kid').set({ uid: 'kid', familyId: 'F' });
  await db.doc('users/kid').set({ uid: 'kid', role: 'child' });
  await db.doc('users/kari').set({ uid: 'kari', role: 'adult' });
  await db.doc('usernames/kari.k').set({ uid: 'kari', type: 'adult', username: 'kari.k' });
  // Eldre profil med navnet, uten usernames-dokument.
  await db.doc('parents/gammel').set({ uid: 'gammel', usernameLower: 'gammelnavn' });
});

test('navnet tas til innlogget konto, og kontoen har bare ett aktivt navn', async () => {
  assert.deepEqual(await call('ola', { username: 'Ola.Nordmann' }), { ok: true, username: 'ola.nordmann', released: 0 });
  const doc = (await db.doc('usernames/ola.nordmann').get()).data();
  assert.equal(doc.uid, 'ola');
  assert.equal(doc.type, 'adult');
  // Samme navn igjen (profilen lagres på nytt) frigir ingenting.
  assert.equal((await call('ola', { username: 'ola.nordmann' })).released, 0);
  // Et skript som prøver å reservere flere navn, sitter igjen med det siste.
  await call('ola', { username: 'ola2' });
  await call('ola', { username: 'ola3' });
  assert.deepEqual(await names('ola'), ['ola3']);
});

test('navn som peker på en annen konto, kan ikke tas', async () => {
  await rejects(call('ola', { username: 'kari.k' }), 'already-exists');
  await rejects(call('ola', { username: 'gammelnavn' }), 'already-exists');
  // En voksen kan ikke ta et navn til en annen voksen ved å sende uid (og mister ikke sitt eget).
  await call('ext', { username: 'ekstern' });
  await rejects(call('ext', { username: 'falsk', uid: 'kari' }), 'permission-denied');
  assert.equal((await db.doc('usernames/falsk').get()).exists, false);
  assert.deepEqual(await names('kari'), ['kari.k']);
  assert.deepEqual(await names('ext'), ['ekstern']);
});

test('ugyldige navn avvises', async () => {
  await rejects(call('ola', { username: 'ab' }), 'invalid-argument');
  await rejects(call('ola', { username: 'ola@firma.no' }), 'invalid-argument');
  await rejects(call('ola', { username: 'med mellomrom' }), 'invalid-argument');
});

test('barnenavn: bare en foresatt, og barnet har også bare ett navn', async () => {
  await rejects(call('ext', { username: 'kidclone', uid: 'kid', type: 'child' }), 'permission-denied');
  await rejects(call('mor', { username: 'kari-barn', uid: 'kari', type: 'child' }), 'permission-denied');
  await call('mor', { username: 'kiddo', uid: 'kid', type: 'child' });
  await call('mor', { username: 'kiddo2', uid: 'kid', type: 'child' });
  assert.deepEqual(await names('kid'), ['kiddo2']);
  assert.equal((await db.doc('usernames/kiddo2').get()).data().type, 'child');
  // Morens eget navn røres ikke av barnets.
  await call('mor', { username: 'mor.selv' });
  assert.deepEqual(await names('mor'), ['mor.selv']);
  assert.deepEqual(await names('kid'), ['kiddo2']);
});

test('uten innlogging: avvist', async () => {
  await rejects(claimUsername.run({ data: { username: 'noen' }, auth: null, rawRequest: { headers: {} } }), 'unauthenticated');
});

test('rene hjelpere', () => {
  assert.deepEqual(claimRequest('ola', { username: '@Ola', uid: 'ola' }), { username: 'ola', target: 'ola', type: 'adult' });
  assert.deepEqual(claimRequest('ola', { username: 'ola' }), { username: 'ola', target: 'ola', type: 'adult' });
  assert.deepEqual(namesToRelease(['a', 'b', 'a', 'ny'], 'ny'), ['a', 'b']);
});
