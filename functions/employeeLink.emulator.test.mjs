/**
 * Kobling av ansattposten ende til ende (SEC-26): serveren kobler den inviterte (respondGroupInvite,
 * claimEmployeeInvite), og reglene lar den koblede lese eget personnummer og føre egne timer. Et vanlig
 * medlem får ikke koblet seg til en kollegas post, verken fra klienten (reglene) eller via serveren
 * (invitasjonens nøkkel, invite.parentKey).
 *
 *   flock /tmp/protop-rules-test.lock npx firebase emulators:exec --only firestore \
 *     --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 functions/employeeLink.emulator.test.mjs"
 *
 * own = eier. nina = eksisterende bruker invitert som ansatt. eve = ansatt. lise = medlem med en
 * ukoblet post som bare har samme navn (eldre app kobler på navn). sjef = invitert administrator.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { assertFails, assertSucceeds, initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = await import('firebase/firestore');
const { claimEmployeeInvite } = await import('./employeeInvite.js');
const { respondGroupInvite } = await import('./groupInvite.js');

// RULES_FILE: en annen regelfil (f.eks. reglene før rettingen, for å se at testene fanger feilen).
const RULES = process.env.RULES_FILE || new URL('../firestore.rules', import.meta.url);
const db = getFirestore();
const A = 'companyA';
let env;

function call(fn, uid, data, { verified = true } = {}) {
  return fn.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: verified, name: `Navn ${uid}` } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

// Appen (klient-SDK) som samme bruker, under reglene.
function client(uid, { verified = true } = {}) {
  return env.authenticatedContext(uid, { email: `${uid}@firma.no`, email_verified: verified }).firestore();
}

async function data(path) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : undefined;
}

function employee(personUid, first, email, level, invite) {
  return {
    personUid,
    person: { firstName: first, lastName: 'Test', email },
    company: { status: 'active', accessLevel: level, accessLevels: [level], canLogin: !!personUid },
    invite,
  };
}

async function seed() {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok, 'kunne ikke tømme emulatoren');
  const members = ['own', 'eve', 'lise'];
  await db.doc(`families/${A}`).set({
    name: 'Rådgiver AS', type: 'organization', ownerUid: 'own', adminUids: ['own'], members, activeUsers: members,
    company: { navn: 'Rådgiver AS' },
  });
  for (const uid of members) {
    await db.doc(`families/${A}/parents/${uid}`).set({ uid, active: true, admin: uid === 'own', inviteStatus: 'accepted' });
    await db.doc(`users/${uid}`).set({ uid, displayName: `Navn ${uid}`, familyIds: [A] });
  }
  await db.doc(`families/${A}/employees/emp_own`).set(employee('own', 'Own', 'own@firma.no', 'administrator', {
    status: 'accepted', email: 'own@firma.no', acceptedUid: 'own',
  }));
  await db.doc(`families/${A}/employees/emp_eve`).set(employee('eve', 'Eve', 'eve@firma.no', 'ansatt', {
    status: 'accepted', email: 'eve@firma.no', acceptedUid: 'eve',
  }));
  // Lise står bare med navn (lagt inn av administrator uten e-post og uten invitasjon).
  await db.doc(`families/${A}/employees/emp_lise`).set(employee('', 'Lise', '', 'ansatt', { status: 'none' }));
  // Nina er invitert som ansatt (eksisterende bruker), men har ikke svart.
  await db.doc(`families/${A}/employees/emp_nina`).set(employee('', 'Nina', 'nina@firma.no', 'ansatt', {
    status: 'sent', email: 'nina@firma.no', accessLevel: 'ansatt', parentKey: 'nina',
  }));
  await db.doc(`families/${A}/employeesPrivate/emp_nina`).set({ employeeId: 'emp_nina', person: { nationalId: '01017012345' } });
  await db.doc(`families/${A}/memberInvites/inv_nina`).set({
    status: 'pending', inviteKind: 'existing', inviteeUid: 'nina', inviteeName: 'Nina Test', inviteeEmail: 'nina@firma.no',
    invitedBy: 'own', asAdmin: false, familyId: A, familyName: 'Rådgiver AS', groupType: 'organization',
  });
  await db.doc(`families/${A}/parents/nina`).set({
    uid: 'nina', name: 'Nina Test', email: 'nina@firma.no', inviteStatus: 'pending', inviteKind: 'existing',
    inviteId: 'inv_nina', placeholder: true, active: false, admin: false,
  });
  await db.doc('users/nina/familyInvites/inv_nina').set({ status: 'pending', familyId: A, inviteeUid: 'nina' });
  // Administrator som er invitert på e-post, men ikke har svart.
  await db.doc(`families/${A}/employees/emp_sjef`).set(employee('', 'Sjef', 'sjef@firma.no', 'administrator', {
    status: 'sent', email: 'sjef@firma.no', accessLevel: 'administrator', parentKey: '',
  }));
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: { rules: readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => { await env?.cleanup(); });

beforeEach(seed);

describe('SEC-26: serveren kobler den inviterte, reglene resten', () => {
  test('invitert ansatt med bekreftet e-post blir koblet, og leser eget personnummer og fører egne timer', async () => {
    const res = await call(respondGroupInvite, 'nina', { familyId: A, inviteId: 'inv_nina', response: 'accepted' });
    assert.equal(res.ok, true);
    assert.equal((await data(`families/${A}/employees/emp_nina`)).personUid, 'nina');
    // Neste innlogging (UsageRecorder) holder koblingen.
    const claim = await call(claimEmployeeInvite, 'nina', { familyId: A });
    assert.equal(claim.ok, true);
    assert.equal(claim.already, true);
    const nina = client('nina');
    await assertSucceeds(getDoc(doc(nina, 'families', A, 'employeesPrivate', 'emp_nina')));
    await assertSucceeds(setDoc(doc(nina, 'families', A, 'timeEntries', 'te_nina'), {
      projectId: 'p1', employeeId: 'emp_nina', date: '2026-10-27', hours: 7.5, status: 'registrert', invoiceId: null,
    }));
  });

  test('medlem som ble med før posten ble koblet (eldre app): claimEmployeeInvite kobler ved innlogging', async () => {
    await db.doc(`families/${A}`).update({ members: ['own', 'eve', 'lise', 'nina'], activeUsers: ['own', 'eve', 'lise', 'nina'] });
    await db.doc(`families/${A}/parents/nina`).update({ active: true, placeholder: false, inviteStatus: 'accepted' });
    const claim = await call(claimEmployeeInvite, 'nina', { familyId: A });
    assert.equal(claim.ok, true);
    assert.equal(claim.already, false);
    assert.equal((await data(`families/${A}/employees/emp_nina`)).personUid, 'nina');
    await assertSucceeds(getDoc(doc(client('nina'), 'families', A, 'employeesPrivate', 'emp_nina')));
  });

  test('eldre app: navn alene kobler ikke; når administrator inviterer på e-post, kobler serveren ved innlogging', async () => {
    const lise = client('lise');
    // «Gjenopprett min profil» i 86332db kobler posten som har samme navn.
    await assertFails(updateDoc(doc(lise, 'families', A, 'employees', 'emp_lise'), { personUid: 'lise' }));
    assert.equal((await call(claimEmployeeInvite, 'lise', { familyId: A })).skipped, true);
    assert.equal((await data(`families/${A}/employees/emp_lise`)).personUid, '');
    // Eieren legger inn e-posten og sender invitasjonen (appen skriver posten under reglene).
    await assertSucceeds(updateDoc(doc(client('own'), 'families', A, 'employees', 'emp_lise'), {
      'person.email': 'lise@firma.no', 'invite.status': 'sent', 'invite.email': 'lise@firma.no',
    }));
    const claim = await call(claimEmployeeInvite, 'lise', { familyId: A });
    assert.equal(claim.ok, true);
    assert.equal((await data(`families/${A}/employees/emp_lise`)).personUid, 'lise');
  });

  test('en kollega legger ikke sin uid som invitasjonens nøkkel, og serveren kobler henne ikke (heller ikke som administrator)', async () => {
    // Uten bekreftet e-post kobler serveren bare på invite.parentKey (REV-05).
    const eve = client('eve', { verified: false });
    await assertFails(updateDoc(doc(eve, 'families', A, 'employees', 'emp_sjef'), { 'invite.parentKey': 'eve' }));
    await assertFails(updateDoc(doc(eve, 'families', A, 'employees', 'emp_nina'), { 'invite.parentKey': 'eve' }));
    const claim = await call(claimEmployeeInvite, 'eve', { familyId: A }, { verified: false });
    assert.equal(claim.skipped, true);
    assert.equal((await data(`families/${A}/employees/emp_sjef`)).personUid, '');
    assert.equal((await data(`families/${A}/employees/emp_nina`)).personUid, '');
    assert.ok(!(await data(`families/${A}`)).adminUids.includes('eve'));
  });
});
