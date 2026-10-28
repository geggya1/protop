/**
 * Avslutning av ansettelse, reaktivering og «Forlat bedriften» mot Firestore-emulatoren.
 *
 *   flock /tmp/protop-rules-test.lock npx firebase emulators:exec --only firestore \
 *     --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 functions/companyMembership.emulator.test.mjs"
 *
 * own = eier. adm = administrator. sjef = Øverste leder (Admin på Ansatte via tilgangsstyringen).
 * kari = ansatt som avsluttes. ans = vanlig ansatt. nina = invitert, ikke svart.
 */
import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const {
  leaveCompany, membershipDeps, setEmploymentStatus, withdrawEmployeeInvite,
} = await import('./companyMembership.js');
const { claimEmployeeInvite } = await import('./employeeInvite.js');
const { respondGroupInvite } = await import('./groupInvite.js');
const { listMyFamilies } = await import('./joinCallables.js');
const { assertFamilyMember } = await import('./security.js');

const db = getFirestore();
const A = 'companyA';
const revoked = [];
membershipDeps.revokeTokens = async (uid) => { revoked.push(uid); };

function call(fn, uid, data) {
  return fn.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true, name: `Navn ${uid}` } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function data(path) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : undefined;
}

function employee(id, uid, level, extra = {}) {
  return {
    id,
    personUid: uid,
    person: { firstName: id, lastName: 'Test', email: `${uid || id}@firma.no` },
    company: { status: 'active', accessLevel: level, accessLevels: [level], canLogin: true },
    invite: uid ? { status: 'accepted', acceptedUid: uid, email: `${uid}@firma.no`, accessLevel: level } : {},
    ...extra,
  };
}

beforeEach(async () => {
  revoked.length = 0;
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc(`families/${A}`).set({
    name: 'Rådgiver AS', type: 'organization', ownerUid: 'own', adminUids: ['own', 'adm', 'kari'],
    members: ['own', 'adm', 'sjef', 'kari', 'ans'], activeUsers: ['own', 'adm', 'sjef', 'kari', 'ans'],
    invitedEmails: ['nina@firma.no'],
    company: { navn: 'Rådgiver AS' },
  });
  for (const uid of ['own', 'adm', 'sjef', 'kari', 'ans']) {
    await db.doc(`families/${A}/parents/${uid}`).set({ uid, active: true, admin: uid === 'kari', inviteStatus: 'accepted' });
    await db.doc(`users/${uid}`).set({ uid, displayName: `Navn ${uid}`, familyIds: [A], activeFamilyId: A });
    await db.doc(`parents/${uid}`).set({ uid, familyIds: [A] });
  }
  await db.doc(`families/${A}/employees/emp_own`).set(employee('emp_own', 'own', 'administrator'));
  await db.doc(`families/${A}/employees/emp_adm`).set(employee('emp_adm', 'adm', 'administrator'));
  await db.doc(`families/${A}/employees/emp_sjef`).set(employee('emp_sjef', 'sjef', 'leder'));
  await db.doc(`families/${A}/employees/emp_kari`).set(employee('emp_kari', 'kari', 'administrator'));
  await db.doc(`families/${A}/employees/emp_ans`).set(employee('emp_ans', 'ans', 'ansatt'));
  await db.doc(`families/${A}/accessAcl/kari`).set({ uid: 'kari', iso: 3, expiresAt: new Date(Date.now() + 3600e3) });
  // Nina er invitert (eksisterende bruker), men har ikke svart.
  await db.doc(`families/${A}/employees/emp_nina`).set({
    id: 'emp_nina',
    person: { firstName: 'Nina', lastName: 'Test', email: 'nina@firma.no' },
    company: { status: 'active', accessLevel: 'ansatt' },
    invite: { status: 'sent', email: 'nina@firma.no', accessLevel: 'ansatt', parentKey: 'nina' },
  });
  await db.doc(`families/${A}/memberInvites/inv_nina`).set({
    status: 'pending', inviteKind: 'existing', inviteeUid: 'nina', inviteeEmail: 'nina@firma.no',
    invitedBy: 'own', familyId: A, familyName: 'Rådgiver AS', groupType: 'organization',
  });
  await db.doc(`users/nina/familyInvites/inv_nina`).set({ status: 'pending', familyId: A, inviteeUid: 'nina' });
});

describe('avslutning', () => {
  test('deaktivering tar personen ut av bedriften i én operasjon', async () => {
    const res = await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_kari', status: 'inactive' });
    assert.equal(res.ok, true);
    assert.equal(res.membership, 'removed');
    const family = await data(`families/${A}`);
    for (const key of ['members', 'activeUsers', 'adminUids']) assert.ok(!family[key].includes('kari'), key);
    const member = await data(`families/${A}/parents/kari`);
    assert.equal(member.active, false);
    assert.equal(member.admin, false);
    assert.ok(member.leftAt);
    assert.equal(member.leftReason, 'ended');
    assert.equal(await data(`families/${A}/accessAcl/kari`), undefined);
    const emp = await data(`families/${A}/employees/emp_kari`);
    assert.equal(emp.company.status, 'inactive');
    assert.equal(emp.company.canLogin, false);
    assert.equal(emp.personUid, 'kari', 'koblingen står for historikk');
    assert.ok(!(await data('users/kari')).familyIds.includes(A));
    assert.equal((await data('users/kari')).activeFamilyId, null);
    assert.ok(!(await data('parents/kari')).familyIds.includes(A));
    assert.deepEqual(revoked, ['kari']);
    const notes = await db.collection('users/kari/notifications').get();
    assert.equal(notes.size, 1);
    assert.match(notes.docs[0].data().body, /Kontoen din i «Rådgiver AS» er avsluttet.*Kontakt Navn own/);
  });

  test('ved neste økt legges personen ikke tilbake, heller ikke som administrator', async () => {
    await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_kari', status: 'inactive' });
    const claim = await call(claimEmployeeInvite, 'kari', { familyId: A });
    assert.equal(claim.skipped, true);
    const family = await data(`families/${A}`);
    assert.ok(!family.members.includes('kari'));
    assert.ok(!family.adminUids.includes('kari'));
    assert.equal((await data(`families/${A}/parents/kari`)).active, false);
  });

  test('papirkurv og permanent sletting stenger også tilgangen', async () => {
    const trash = await call(setEmploymentStatus, 'adm', { companyId: A, employeeId: 'emp_ans', status: 'deleted' });
    assert.equal(trash.membership, 'removed');
    assert.ok(!(await data(`families/${A}`)).members.includes('ans'));
    await assert.rejects(
      call(setEmploymentStatus, 'adm', { companyId: A, employeeId: 'emp_kari', purge: true }),
      (err) => err.code === 'failed-precondition',
      'permanent sletting krever papirkurv først',
    );
    const purge = await call(setEmploymentStatus, 'adm', { companyId: A, employeeId: 'emp_ans', purge: true });
    assert.equal(purge.status, 'purged');
    assert.equal(await data(`families/${A}/employees/emp_ans`), undefined);
  });

  test('sluttdato i fortid behandles som avsluttet', async () => {
    const res = await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'active', periodTo: '01.02.2020' });
    assert.equal(res.active, false);
    assert.equal(res.membership, 'removed');
    assert.equal((await data(`families/${A}/employees/emp_ans`)).company.periodTo, '2020-02-01');
  });

  test('ventende invitasjon trekkes tilbake når medarbeideren avsluttes', async () => {
    const res = await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_nina', status: 'inactive' });
    assert.equal(res.membership, 'none');
    assert.equal(res.revokedInvites, 1);
    assert.equal((await data(`families/${A}/memberInvites/inv_nina`)).status, 'revoked');
    assert.equal((await data('users/nina/familyInvites/inv_nina')).status, 'revoked');
    assert.deepEqual((await data(`families/${A}`)).invitedEmails, []);
    assert.equal((await data(`families/${A}/employees/emp_nina`)).invite.status, 'none');
    // Godta etterpå gir ingen tilgang.
    const answer = await call(respondGroupInvite, 'nina', { familyId: A, inviteId: 'inv_nina', response: 'accepted' });
    assert.equal(answer.ok, false);
    assert.ok(!(await data(`families/${A}`)).members.includes('nina'));
  });
});

describe('hvem som kan', () => {
  test('vanlig ansatt kan ikke avslutte andre; Øverste leder med Admin på Ansatte kan', async () => {
    await assert.rejects(
      call(setEmploymentStatus, 'ans', { companyId: A, employeeId: 'emp_sjef', status: 'inactive' }),
      (err) => err.code === 'permission-denied',
    );
    // Selvskrevet admin-flagg på medlemsdokumentet gir ingenting.
    await db.doc(`families/${A}/parents/ans`).set({ admin: true }, { merge: true });
    await assert.rejects(
      call(setEmploymentStatus, 'ans', { companyId: A, employeeId: 'emp_sjef', status: 'inactive' }),
      (err) => err.code === 'permission-denied',
    );
    const res = await call(setEmploymentStatus, 'sjef', { companyId: A, employeeId: 'emp_ans', status: 'inactive' });
    assert.equal(res.membership, 'removed');
  });

  test('REV-07: Begrenset redigering på Ansatte (avdelingsleder) kan ikke avslutte en ansettelse', async () => {
    // Appen skjuler Deaktiver/Aktiver og låser status og sluttdato for den samme regelen (canChangeEmployment).
    await db.doc(`families/${A}`).update({ members: ['own', 'adm', 'sjef', 'kari', 'ans', 'avd'] });
    await db.doc(`families/${A}/parents/avd`).set({ uid: 'avd', active: true, inviteStatus: 'accepted' });
    await db.doc(`families/${A}/employees/emp_avd`).set(employee('emp_avd', 'avd', 'avdelingsleder'));
    for (const change of [{ status: 'inactive' }, { periodTo: '01.02.2020' }]) {
      await assert.rejects(
        call(setEmploymentStatus, 'avd', { companyId: A, employeeId: 'emp_ans', ...change }),
        (err) => err.code === 'permission-denied',
        JSON.stringify(change),
      );
    }
    assert.ok((await data(`families/${A}`)).members.includes('ans'));
  });

  test('eieren kan ikke avsluttes, og ingen avslutter seg selv her', async () => {
    await assert.rejects(
      call(setEmploymentStatus, 'adm', { companyId: A, employeeId: 'emp_own', status: 'inactive' }),
      (err) => err.code === 'failed-precondition' && /Eieren/.test(err.message),
    );
    await assert.rejects(
      call(setEmploymentStatus, 'adm', { companyId: A, employeeId: 'emp_adm', status: 'inactive' }),
      (err) => err.code === 'failed-precondition' && /Forlat bedriften/.test(err.message),
    );
  });

  test('bare eier eller administrator kan avslutte en administrator', async () => {
    await assert.rejects(
      call(setEmploymentStatus, 'sjef', { companyId: A, employeeId: 'emp_kari', status: 'inactive' }),
      (err) => err.code === 'permission-denied',
    );
  });
});

describe('reaktivering', () => {
  test('medlemskapet legges tilbake, med administrator bare når nivået sier det', async () => {
    await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'inactive' });
    const res = await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'active' });
    assert.equal(res.membership, 'restored');
    const family = await data(`families/${A}`);
    assert.ok(family.members.includes('ans'));
    assert.ok(!family.adminUids.includes('ans'));
    const member = await data(`families/${A}/parents/ans`);
    assert.equal(member.active, true);
    assert.equal(member.leftAt, undefined);
    assert.ok((await data('users/ans')).familyIds.includes(A));

    await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_kari', status: 'inactive' });
    await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_kari', status: 'active' });
    assert.ok((await data(`families/${A}`)).adminUids.includes('kari'));
  });

  test('den som har forlatt bedriften selv, må inviteres på nytt', async () => {
    const left = await call(leaveCompany, 'ans', { companyId: A });
    assert.equal(left.ok, true);
    const res = await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'active' });
    assert.equal(res.membership, 'needs-invite');
    assert.ok(!(await data(`families/${A}`)).members.includes('ans'));
  });

  test('REV-04: ny invitasjon godtatt gir hele medlemskapet tilbake', async () => {
    await call(leaveCompany, 'ans', { companyId: A });
    await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'active' });
    // Ny invitasjon fra Ansatte til den eksisterende kontoen (inviteExistingAdult).
    await db.doc(`families/${A}/employees/emp_ans`).update({
      invite: { status: 'sent', email: 'ans@firma.no', accessLevel: 'ansatt', parentKey: 'ans', sentAt: new Date().toISOString() },
    });
    await db.doc(`families/${A}/parents/ans`).set({
      inviteStatus: 'pending', inviteKind: 'existing', inviteId: 'inv_ans', placeholder: true, active: false,
    }, { merge: true });
    await db.doc(`families/${A}/memberInvites/inv_ans`).set({
      status: 'pending', inviteKind: 'existing', inviteeUid: 'ans', inviteeEmail: 'ans@firma.no',
      invitedBy: 'own', familyId: A, familyName: 'Rådgiver AS', groupType: 'organization',
    });
    const answer = await call(respondGroupInvite, 'ans', { familyId: A, inviteId: 'inv_ans', response: 'accepted' });
    assert.equal(answer.ok, true);
    const member = await data(`families/${A}/parents/ans`);
    assert.equal(member.leftAt, undefined);
    assert.equal(member.leftReason, undefined);
    assert.equal(member.endedBy, undefined);
    assert.equal(member.active, true);
    // Serveren slipper personen inn igjen, og bedriften står i listen.
    await assertFamilyMember(db, A, 'ans');
    const mine = await listMyFamilies.run({ data: {}, auth: { uid: 'ans', token: {} }, rawRequest: { headers: {} } });
    assert.ok(mine.families.some((row) => row.id === A));
    // Neste økt (claimEmployeeInvite) holder medlemskapet.
    const claim = await call(claimEmployeeInvite, 'ans', { familyId: A });
    assert.equal(claim.ok, true);
    // Senere avslutning og reaktivering virker som for andre: personen gikk ikke selv denne gangen.
    await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'inactive' });
    const again = await call(setEmploymentStatus, 'own', { companyId: A, employeeId: 'emp_ans', status: 'active' });
    assert.equal(again.membership, 'restored');
  });

  test('REV-04: neste økt rydder et gammelt utmeldingsmerke for den som står som medlem', async () => {
    // Godtatt med en eldre versjon: står i members, men medlemsdokumentet har fortsatt leftAt.
    await db.doc(`families/${A}/parents/ans`).set({ leftAt: '2026-10-01T10:00:00Z', leftReason: 'self', endedBy: 'ans' }, { merge: true });
    await assert.rejects(assertFamilyMember(db, A, 'ans'), (err) => err.code === 'permission-denied');
    const claim = await call(claimEmployeeInvite, 'ans', { familyId: A });
    assert.equal(claim.ok, true);
    const member = await data(`families/${A}/parents/ans`);
    assert.equal(member.leftAt, undefined);
    assert.equal(member.leftReason, undefined);
    await assertFamilyMember(db, A, 'ans');
  });
});

describe('Forlat bedriften', () => {
  test('personen går selv, ansettelsen avsluttes og administratorene får beskjed', async () => {
    const res = await call(leaveCompany, 'ans', { companyId: A });
    assert.equal(res.ok, true);
    const family = await data(`families/${A}`);
    assert.ok(!family.members.includes('ans'));
    const member = await data(`families/${A}/parents/ans`);
    assert.equal(member.leftReason, 'self');
    const emp = await data(`families/${A}/employees/emp_ans`);
    assert.equal(emp.company.status, 'inactive');
    assert.match(emp.company.periodTo, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(!(await data('users/ans')).familyIds.includes(A));
    for (const admin of ['own', 'adm', 'kari']) {
      const notes = await db.collection(`users/${admin}/notifications`).get();
      assert.ok(notes.docs.some((row) => row.data().eventType === 'companyMemberLeft'), admin);
    }
    assert.deepEqual(revoked, [], 'den som går selv, logges ikke ut på alle enheter');
  });

  test('eieren kan ikke forlate bedriften', async () => {
    await assert.rejects(call(leaveCompany, 'own', { companyId: A }), (err) => err.code === 'failed-precondition');
  });
});

describe('Trekk tilbake invitasjon', () => {
  test('sendt invitasjon trekkes tilbake, og kan ikke godtas etterpå', async () => {
    await db.doc(`families/${A}/parents/nina`).set({
      uid: 'nina', inviteStatus: 'pending', inviteKind: 'existing', inviteId: 'inv_nina', placeholder: true, active: false,
    });
    await assert.rejects(
      call(withdrawEmployeeInvite, 'ans', { companyId: A, employeeId: 'emp_nina' }),
      (err) => err.code === 'permission-denied',
    );
    const res = await call(withdrawEmployeeInvite, 'adm', { companyId: A, employeeId: 'emp_nina' });
    assert.equal(res.revokedInvites, 1);
    // Plassholderen er frigjort, så personen kan inviteres på nytt.
    assert.equal((await data(`families/${A}/parents/nina`)).inviteStatus, 'revoked');
    assert.equal((await data(`families/${A}/memberInvites/inv_nina`)).status, 'revoked');
    assert.equal((await data('users/nina/familyInvites/inv_nina')).status, 'revoked');
    const emp = await data(`families/${A}/employees/emp_nina`);
    assert.equal(emp.invite.status, 'none');
    assert.equal(emp.company.status, 'active');
    await assert.rejects(
      call(withdrawEmployeeInvite, 'adm', { companyId: A, employeeId: 'emp_kari' }),
      (err) => err.code === 'failed-precondition',
    );
  });
});
