/**
 * Godkjenning av forespørsel om innpass med kode (plattform, lag, klasse).
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/joinApproval.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { approveJoinRequest } = await import('./joinCallables.js');

const db = getFirestore();

function call(uid, data) {
  return approveJoinRequest.run({
    data,
    auth: { uid, token: { email: `${uid}@test.no`, email_verified: true } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function rejects(promise, code) {
  await assert.rejects(promise, (err) => err?.code === code);
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc('families/venner').set({ name: 'Turgjengen', type: 'friends', ownerUid: 'eier', adminUids: ['eier'], members: ['eier', 'medlem'] });
  await db.doc('families/venner/parents/medlem').set({ uid: 'medlem', active: true, admin: false });
  await db.doc('families/venner/joinRequests/r1').set({ status: 'pending', parentUid: 'ny', parentName: 'Ny Person', parentEmail: 'ny@test.no' });
  await db.doc('users/ny').set({ uid: 'ny', familyIds: ['egen'] });

  await db.doc('families/laget').set({ name: 'G12', type: 'team', ownerUid: 'trener', members: ['trener'] });
  await db.doc('families/laget/joinRequests/r2').set({
    status: 'pending', parentUid: 'mor', parentName: 'Mor', childFirstName: 'Ola', childLastName: 'N', childName: 'Ola N',
  });

  // setStaffRole (src/utils/classroom.js) fører lærere og skoleadmin inn i adminUids.
  await db.doc('families/klassen').set({
    name: '5B', type: 'classroom', ownerUid: 'rektor', adminUids: ['rektor', 'laerer'], members: ['rektor', 'laerer', 'assistent'],
  });
  await db.doc('families/klassen/parents/laerer').set({ uid: 'laerer', active: true, staffRole: 'teacher', admin: true });
  await db.doc('families/klassen/parents/assistent').set({ uid: 'assistent', active: true, staffRole: 'teacher', admin: true });
  await db.doc('families/klassen/joinRequests/r3').set({
    status: 'pending', parentUid: 'far', parentName: 'Far', childFirstName: 'Kari', childLastName: 'N', childName: 'Kari N',
  });
});

test('administrator godkjenner: medlemskap, søkerens profil, forespørsel og varsel', async () => {
  const res = await call('eier', { familyId: 'venner', requestId: 'r1' });
  assert.deepEqual(res, { ok: true, parentUid: 'ny', childId: null, childName: null });
  const group = (await db.doc('families/venner').get()).data();
  assert.ok(group.members.includes('ny'));
  assert.ok(group.activeUsers.includes('ny'));
  const member = (await db.doc('families/venner/parents/ny').get()).data();
  assert.equal(member.active, true);
  assert.equal(member.admin, false);
  assert.equal(member.name, 'Ny Person');
  assert.deepEqual((await db.doc('users/ny').get()).data().familyIds, ['egen', 'venner']);
  assert.deepEqual((await db.doc('parents/ny').get()).data().familyIds, ['venner']);
  const request = (await db.doc('families/venner/joinRequests/r1').get()).data();
  assert.equal(request.status, 'approved');
  assert.equal(request.approvedBy, 'eier');
  const notes = await db.collection('users/ny/notifications').get();
  assert.equal(notes.size, 1);
  assert.equal(notes.docs[0].data().body, 'Du er nå med i «Turgjengen».');
  await rejects(call('eier', { familyId: 'venner', requestId: 'r1' }), 'failed-precondition');
});

test('lag: barnet opprettes som spiller med foresatt', async () => {
  const res = await call('trener', { familyId: 'laget', requestId: 'r2' });
  assert.ok(res.childId);
  const child = (await db.doc(`families/laget/children/${res.childId}`).get()).data();
  assert.equal(child.role, 'player');
  assert.equal(child.name, 'Ola N');
  assert.deepEqual(child.guardianUids, ['mor']);
  const guardian = (await db.doc('families/laget/parents/mor').get()).data();
  assert.equal(guardian.role, 'guardian');
  assert.deepEqual(guardian.linkedChildIds, [res.childId]);
  assert.equal((await db.doc('families/laget/joinRequests/r2').get()).data().childId, res.childId);
});

test('klasse: lærer kan godkjenne, eleven får rollen student', async () => {
  const res = await call('laerer', { familyId: 'klassen', requestId: 'r3' });
  assert.equal(res.childName, 'Kari N');
  const child = (await db.doc(`families/klassen/children/${res.childId}`).get()).data();
  assert.equal(child.role, 'student');
  assert.equal((await db.doc('families/klassen/parents/far').get()).data().staffRole, null);
});

test('vanlig medlem, bedrift, ukjent forespørsel og slettet gruppe avvises', async () => {
  await rejects(call('medlem', { familyId: 'venner', requestId: 'r1' }), 'permission-denied');
  // admin og staffRole på eget medlemsdokument gir ikke godkjenning: bare eier og adminUids (SEC-03).
  await db.doc('families/venner/parents/medlem').set({ admin: true, superAdmin: true }, { merge: true });
  await rejects(call('medlem', { familyId: 'venner', requestId: 'r1' }), 'permission-denied');
  await rejects(call('assistent', { familyId: 'klassen', requestId: 'r3' }), 'permission-denied');
  await rejects(call('ny', { familyId: 'venner', requestId: 'r1' }), 'permission-denied');
  assert.equal((await db.doc('families/venner/joinRequests/r1').get()).data().status, 'pending');
  await rejects(call('eier', { familyId: 'venner', requestId: 'finnes-ikke' }), 'not-found');
  await rejects(call('eier', { familyId: 'venner', requestId: '' }), 'invalid-argument');
  await db.doc('families/firma').set({ name: 'Firma AS', type: 'company', ownerUid: 'eier', members: ['eier'] });
  await db.doc('families/firma/joinRequests/r4').set({ status: 'pending', parentUid: 'ny' });
  await rejects(call('eier', { familyId: 'firma', requestId: 'r4' }), 'failed-precondition');
  await db.doc('families/venner').set({ deleted: true }, { merge: true });
  await rejects(call('eier', { familyId: 'venner', requestId: 'r1' }), 'not-found');
});
