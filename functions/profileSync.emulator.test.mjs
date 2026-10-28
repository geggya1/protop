/**
 * syncMyProfile (DS-07) mot Firestore-emulatoren: «Rediger profil» gir nytt navn, bilde og
 * telefon i alle selskaper personen er med i, og på koblede ansattkort, men ikke i selskaper
 * personen har gått ut av, og ikke på andres dokumenter.
 *
 *   flock /tmp/protop-rules-test.lock npx firebase emulators:exec --only firestore \
 *     --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 functions/profileSync.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { syncMyProfile } = await import('./profileSync.js');

const db = getFirestore();

function call(uid, data = {}) {
  return syncMyProfile.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function data(path) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : undefined;
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  // Kari er med i A og B (B uten uid i medlemsdokumentet, bare i users.familyIds), og har gått ut av C.
  await db.doc('users/kari').set({
    uid: 'kari', displayName: 'Kari Berg', photoURL: 'ny.jpg', phone: '+4790000000', familyIds: ['A', 'B', 'C'],
  });
  await db.doc('parents/kari').set({ uid: 'kari', name: 'Kari Berg' });
  await db.doc('families/A').set({ name: 'A AS', type: 'organization', members: ['kari', 'ola'] });
  await db.doc('families/B').set({ name: 'B AS', type: 'organization', members: ['kari'] });
  await db.doc('families/C').set({ name: 'C AS', type: 'organization', members: [] });
  await db.doc('families/A/parents/kari').set({ uid: 'kari', name: 'Kari Nordmann', photoURL: 'gammel.jpg', active: true });
  await db.doc('families/A/parents/ola').set({ uid: 'ola', name: 'Ola', active: true });
  await db.doc('families/B/parents/kari').set({ name: 'Kari Nordmann', active: true });
  await db.doc('families/C/parents/kari').set({ uid: 'kari', name: 'Kari Nordmann', active: false, leftAt: '2026-01-01' });
  await db.doc('families/A/employees/emp_kari').set({
    id: 'emp_kari', personUid: 'kari',
    person: { firstName: 'Kari', lastName: 'Nordmann', photoUrl: '', phone: '' },
    company: { status: 'active' },
  });
  // HR i B har skrevet fullt navn: det skal stå.
  await db.doc('families/B/employees/emp_k').set({
    id: 'emp_k', personUid: 'kari',
    person: { firstName: 'Kari Elise', lastName: 'Nordmann', photoUrl: 'cv.jpg', phone: '+4791111111' },
    company: { status: 'active' },
  });
  await db.doc('families/C/employees/emp_c').set({
    id: 'emp_c', personUid: 'kari', person: { firstName: 'Kari', lastName: 'Nordmann' }, company: { status: 'inactive' },
  });
  await db.doc('families/A/employees/emp_ola').set({
    id: 'emp_ola', personUid: 'ola', person: { firstName: 'Ola', lastName: 'Nordmann' }, company: { status: 'active' },
  });
});

describe('syncMyProfile', () => {
  test('navn og bilde i alle aktive selskaper og på koblede ansattkort', async () => {
    const result = await call('kari', { previous: { name: 'Kari Nordmann', photoURL: 'gammel.jpg', phone: '+4791111111' } });
    assert.equal(result.ok, true);
    assert.equal(result.members, 2);
    assert.equal(result.employees, 2);

    const memberA = await data('families/A/parents/kari');
    assert.equal(memberA.name, 'Kari Berg');
    assert.equal(memberA.photoURL, 'ny.jpg');
    assert.equal(memberA.phone, '+4790000000');
    assert.equal((await data('families/B/parents/kari')).name, 'Kari Berg', 'funnet via users.familyIds');
    assert.equal((await data('families/C/parents/kari')).name, 'Kari Nordmann', 'avsluttet medlemskap røres ikke');

    const empA = await data('families/A/employees/emp_kari');
    assert.equal(empA.person.firstName, 'Kari');
    assert.equal(empA.person.lastName, 'Berg');
    assert.equal(empA.person.photoUrl, 'ny.jpg', 'tomt bilde fylles');
    assert.ok(empA.personSyncedAt);
    const empB = await data('families/B/employees/emp_k');
    assert.equal(empB.person.firstName, 'Kari Elise', 'navnet HR skrev, står');
    assert.equal(empB.person.photoUrl, 'cv.jpg');
    assert.equal(empB.person.phone, '+4790000000', 'telefonen fulgte profilen');
    assert.equal((await data('families/C/employees/emp_c')).person.lastName, 'Nordmann', 'avsluttet ansettelse røres ikke');
  });

  test('andres dokumenter røres ikke, og uendret profil skriver ingenting', async () => {
    await call('kari', { previous: { name: 'Kari Nordmann' } });
    assert.equal((await data('families/A/parents/ola')).name, 'Ola');
    assert.equal((await data('families/A/employees/emp_ola')).person.lastName, 'Nordmann');
    const again = await call('kari', { previous: { name: 'Kari Berg' } });
    assert.equal(again.members, 0);
    assert.equal(again.employees, 0);
  });

  test('krever innlogging', async () => {
    await assert.rejects(() => syncMyProfile.run({ data: {}, auth: null, rawRequest: { headers: {} } }), /innlogget/);
  });
});
