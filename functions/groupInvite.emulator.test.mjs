/**
 * Bedriftsinvitasjon ende til ende mot Firestore-emulatoren, med de ekte callablene.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/groupInvite.emulator.test.mjs"
 *
 * own = eier. nina = ny bruker invitert på e-post. eve = eksisterende bruker. ext = fremmed.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, describe, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { respondGroupInvite, syncMyInvites, invitePreview } = await import('./groupInvite.js');
const { claimEmployeeInvite } = await import('./employeeInvite.js');

const db = getFirestore();
const A = 'companyA';

function call(fn, uid, data, { verified = true, provider = 'password' } = {}) {
  return fn.run({
    data,
    auth: uid ? {
      uid,
      token: { email: `${uid}@firma.no`, email_verified: verified, firebase: { sign_in_provider: provider } },
    } : null,
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function wipe() {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok, 'kunne ikke tømme emulatoren');
}

function employee(id, first, email, level) {
  return {
    id,
    person: { firstName: first, lastName: 'Test', email },
    company: { status: 'active', email, accessLevel: level, accessRole: level, canLogin: false },
    invite: { status: 'sent', email, accessLevel: level, parentKey: '' },
  };
}

async function seed() {
  await wipe();
  await db.doc(`families/${A}`).set({
    name: 'Rådgiver AS', type: 'organization', ownerUid: 'own', adminUids: ['own'], members: ['own'],
    invitedEmails: ['nina@firma.no'],
  });
  await db.doc(`families/${A}/parents/own`).set({ uid: 'own', admin: true, active: true });
  // Ny bruker: plassholder fra inviteAdult (nøkkel av e-posten).
  await db.doc(`families/${A}/parents/ninafirmano`).set({
    uid: 'ninafirmano', name: 'Nina Test', email: 'nina@firma.no', familyId: A, createdBy: 'own',
    inviteStatus: 'pending', placeholder: true, active: false, admin: false, clientSendsInvite: true,
  });
  await db.doc(`families/${A}/employees/emp_nina`).set(employee('emp_nina', 'Nina', 'nina@firma.no', 'ansatt'));
  // Eksisterende bruker: det inviteExistingAdult skriver.
  await db.doc(`families/${A}/memberInvites/inv_eve`).set({
    status: 'pending', inviteKind: 'existing', inviteeUid: 'eve', inviteeName: 'Eve Test',
    inviteeEmail: 'eve@firma.no', invitedBy: 'own', asAdmin: false, familyId: A,
    familyName: 'Rådgiver AS', groupType: 'organization',
  });
  await db.doc(`families/${A}/parents/eve`).set({
    uid: 'eve', name: 'Eve Test', email: 'eve@firma.no', inviteStatus: 'pending', inviteKind: 'existing',
    inviteId: 'inv_eve', placeholder: true, active: false, admin: false,
  });
  await db.doc(`users/eve/familyInvites/inv_eve`).set({ status: 'pending', familyId: A, inviteeUid: 'eve' });
  await db.doc(`families/${A}/employees/emp_eve`).set(employee('emp_eve', 'Eve', 'eve@firma.no', 'administrator'));
}

async function data(path) {
  const snap = await db.doc(path).get();
  return snap.exists ? snap.data() : undefined;
}

async function members() {
  return (await data(`families/${A}`)).members;
}

before(async () => {
  await wipe();
});

beforeEach(seed);

describe('ny bruker invitert på e-post', () => {
  test('registreringssiden får bare navn og type, og bare for invitert e-post', async () => {
    assert.deepEqual(await call(invitePreview, null, { familyId: A, email: 'Nina@firma.no' }), {
      ok: true, name: 'Rådgiver AS', type: 'organization',
    });
    assert.deepEqual(await call(invitePreview, null, { familyId: A, email: 'ext@firma.no' }), { ok: false });
  });

  test('blir ikke med ved registrering eller innlogging: knytting krever Godta', async () => {
    const claim = await call(claimEmployeeInvite, 'nina', { familyId: A });
    assert.equal(claim.skipped, true);
    assert.equal(claim.needsAccept, true);
    assert.deepEqual(await members(), ['own']);
    assert.equal((await data(`families/${A}/employees/emp_nina`)).personUid, undefined);
  });

  test('ubekreftet e-post får ingen invitasjon i innboksen', async () => {
    const res = await call(syncMyInvites, 'nina', {}, { verified: false });
    assert.equal(res.skipped, 'email-not-verified');
    assert.equal((await db.collection('users/nina/familyInvites').get()).size, 0);
  });

  // SEC-17: innloggingsmåten alene gjør ikke e-posten bekreftet. Fra Microsoft kan `email`
  // være ubekreftet (nOAuth); confirmMicrosoftEmail merker kontoen når Microsoft sier at
  // adressen er bekreftet, og da har tokenet email_verified.
  for (const provider of ['microsoft.com', 'google.com']) {
    test(`innlogget med ${provider} uten bekreftet e-post: ingen invitasjon og ingen knytting`, async () => {
      const opts = { verified: false, provider };
      assert.equal((await call(syncMyInvites, 'nina', {}, opts)).skipped, 'email-not-verified');
      assert.equal((await db.collection('users/nina/familyInvites').get()).size, 0);
      // Selv som medlem knyttes ikke medarbeiderposten på en ubekreftet e-post.
      await db.doc(`families/${A}`).update({ members: ['own', 'nina'] });
      assert.equal((await call(claimEmployeeInvite, 'nina', { familyId: A }, opts)).needsVerifiedEmail, true);
      assert.equal((await data(`families/${A}/employees/emp_nina`)).personUid, undefined);
    });
  }

  for (const provider of ['microsoft.com', 'google.com']) {
    test(`innlogget med ${provider} og bekreftet e-post: invitasjonen vises og kan godtas`, async () => {
      const opts = { verified: true, provider };
      const { invites } = await call(syncMyInvites, 'nina', {}, opts);
      assert.equal(invites.length, 1);
      const { inviteId } = invites[0];
      assert.equal((await data(`users/nina/familyInvites/${inviteId}`)).status, 'pending');
      const res = await call(respondGroupInvite, 'nina', { familyId: A, inviteId, response: 'accepted' }, opts);
      assert.equal(res.ok, true);
      assert.ok((await members()).includes('nina'));
      const claim = await call(claimEmployeeInvite, 'nina', { familyId: A }, opts);
      assert.notEqual(claim.needsVerifiedEmail, true);
      assert.equal((await data(`families/${A}/employees/emp_nina`)).personUid, 'nina');
    });
  }

  test('bekreftet e-post: invitasjonen havner i innboksen med varsel, uten medlemskap', async () => {
    const first = await call(syncMyInvites, 'nina', {});
    assert.equal(first.invites.length, 1);
    const { inviteId } = first.invites[0];
    const inbox = await data(`users/nina/familyInvites/${inviteId}`);
    assert.equal(inbox.status, 'pending');
    assert.equal(inbox.groupType, 'organization');
    assert.equal(inbox.familyName, 'Rådgiver AS');
    assert.equal(inbox.invitedBy, 'own');
    const notice = await data(`users/nina/notifications/familyInvite_${A}_${inviteId}`);
    assert.equal(notice.title, 'Bedriftsinvitasjon');
    assert.match(notice.body, /invitert inn i bedriften «Rådgiver AS».*Godta eller avslå/);
    assert.deepEqual(await members(), ['own']);
    const again = await call(syncMyInvites, 'nina', {});
    assert.equal(again.invites[0].inviteId, inviteId, 'samme invitasjon, ikke en ny');
  });

  test('Godta: medlem, medarbeider knyttet med tilgangsnivå, plassholder ryddet, eier varslet', async () => {
    const { invites: [{ inviteId }] } = await call(syncMyInvites, 'nina', {});
    assert.deepEqual(await call(respondGroupInvite, 'ext', { familyId: A, inviteId, response: 'accepted' }), {
      ok: false, error: 'forbidden',
    });
    assert.deepEqual(
      await call(respondGroupInvite, 'nina', { familyId: A, inviteId, response: 'accepted' }, { verified: false }),
      { ok: false, error: 'email-not-verified' },
    );
    const res = await call(respondGroupInvite, 'nina', { familyId: A, inviteId, response: 'accepted' });
    assert.equal(res.ok, true);
    assert.equal(res.accessLabel, 'Ansatt');
    const family = await data(`families/${A}`);
    assert.ok(family.members.includes('nina'));
    assert.ok(!family.adminUids.includes('nina'));
    assert.deepEqual(family.invitedEmails, []);
    const member = await data(`families/${A}/parents/nina`);
    assert.equal(member.active, true);
    assert.equal(member.placeholder, false);
    assert.equal(member.inviteStatus, 'accepted');
    assert.equal((await data(`families/${A}/parents/ninafirmano`)).migratedToUid, 'nina');
    const emp = await data(`families/${A}/employees/emp_nina`);
    assert.equal(emp.personUid, 'nina');
    assert.equal(emp.invite.status, 'accepted');
    assert.equal(emp.invite.accessLevel, 'ansatt');
    assert.equal(emp.company.canLogin, true);
    assert.equal((await data(`users/nina/familyInvites/${inviteId}`)).status, 'accepted');
    assert.ok((await data('users/nina')).familyIds.includes(A));
    const ownerNotes = await db.collection('users/own/notifications').get();
    assert.ok(ownerNotes.docs.some((row) => row.data().eventType === 'familyInviteAccepted'));
    assert.deepEqual(await call(respondGroupInvite, 'nina', { familyId: A, inviteId, response: 'accepted' }), {
      ok: false, error: 'already-handled',
    });
  });
});

describe('invitert på nytt etter en tidligere runde', () => {
  // Slik det lå i produksjon: plassholderen er ryddet etter et tidligere svar og
  // sendt på nytt uten å bli gjenopplivet, mens medarbeideren står med sendt invitasjon.
  async function oldRound(employeeInvite = {}) {
    await db.doc(`families/${A}/parents/ninafirmano`).set({
      deleted: true, archived: true, inviteStatus: 'pending', migratedToUid: 'gammelKonto', inviteId: 'inv_gammel',
    }, { merge: true });
    await db.doc(`families/${A}/employees/emp_nina`).set({ invite: { parentKey: 'ninafirmano', ...employeeInvite } }, { merge: true });
  }

  test('invitasjonen vises likevel, og Godta knytter medarbeideren', async () => {
    await oldRound();
    const { invites } = await call(syncMyInvites, 'nina', {});
    assert.equal(invites.length, 1);
    const { inviteId } = invites[0];
    const inbox = await data(`users/nina/familyInvites/${inviteId}`);
    assert.equal(inbox.status, 'pending');
    assert.equal(inbox.groupType, 'organization');
    assert.equal(inbox.inviteeName, 'Nina Test');
    assert.equal(inbox.invitedBy, 'own');
    assert.ok(await data(`users/nina/notifications/familyInvite_${A}_${inviteId}`));
    const again = await call(syncMyInvites, 'nina', {});
    assert.equal(again.invites[0].inviteId, inviteId, 'samme invitasjon, ikke en ny');
    const res = await call(respondGroupInvite, 'nina', { familyId: A, inviteId, response: 'accepted' });
    assert.equal(res.ok, true);
    assert.ok((await members()).includes('nina'));
    const emp = await data(`families/${A}/employees/emp_nina`);
    assert.equal(emp.personUid, 'nina');
    assert.equal(emp.invite.status, 'accepted');
  });

  test('avslått eller tatt av en annen konto: ingen invitasjon', async () => {
    await oldRound({ status: 'declined' });
    assert.equal((await call(syncMyInvites, 'nina', {})).invites.length, 0);
    await oldRound({ status: 'sent' });
    await db.doc(`families/${A}/employees/emp_nina`).set({ personUid: 'annen' }, { merge: true });
    assert.equal((await call(syncMyInvites, 'nina', {})).invites.length, 0);
  });
});

describe('eksisterende bruker', () => {
  test('Avslå: ikke medlem, plassholder borte, medarbeideren viser avslått', async () => {
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'declined' });
    assert.equal(res.ok, true);
    assert.deepEqual(await members(), ['own']);
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'declined');
    assert.equal((await data(`users/eve/familyInvites/inv_eve`)).status, 'declined');
    const member = await data(`families/${A}/parents/eve`);
    assert.equal(member.deleted, true);
    assert.equal(member.inviteStatus, 'declined');
    const emp = await data(`families/${A}/employees/emp_eve`);
    assert.equal(emp.invite.status, 'declined');
    assert.equal(emp.personUid, undefined);
    const ownerNotes = await db.collection('users/own/notifications').get();
    assert.ok(ownerNotes.docs.some((row) => row.data().eventType === 'familyInviteDeclined'));
  });

  test('Godta med administratornivå gir administratorrettighet', async () => {
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' });
    assert.equal(res.ok, true);
    assert.equal(res.accessLevel, 'administrator');
    const family = await data(`families/${A}`);
    assert.ok(family.members.includes('eve'));
    assert.ok(family.adminUids.includes('eve'));
    assert.equal((await data(`families/${A}/parents/eve`)).admin, true);
    assert.equal((await data(`families/${A}/employees/emp_eve`)).personUid, 'eve');
  });

  test('knytting etter Godta virker, og krever bekreftet e-post', async () => {
    await db.doc(`families/${A}`).update({ members: ['own', 'eve'] });
    const unverified = await call(claimEmployeeInvite, 'eve', { familyId: A }, { verified: false });
    assert.equal(unverified.needsVerifiedEmail, true);
    const res = await call(claimEmployeeInvite, 'eve', { familyId: A });
    assert.equal(res.ok, true);
    assert.equal((await data(`families/${A}/employees/emp_eve`)).personUid, 'eve');
  });
});

describe('Microsoft-konto uten bekreftet e-post (REV-05)', () => {
  const ms = { verified: false, provider: 'microsoft.com' };

  test('invitasjon til kontoen (funnet på brukernavn) kan godtas, og medarbeideren knyttes på uid', async () => {
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ matchedBy: 'username' });
    // Vanlig ansatt. Ledertilgang krever bekreftet e-post (neste test).
    await db.doc(`families/${A}/employees/emp_eve`).set(employee('emp_eve', 'Eve', 'eve@firma.no', 'ansatt'));
    await db.doc(`families/${A}/employees/emp_eve`).update({ 'invite.parentKey': 'eve' });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, ms);
    assert.equal(res.ok, true);
    assert.ok((await members()).includes('eve'));
    const emp = await data(`families/${A}/employees/emp_eve`);
    assert.equal(emp.personUid, 'eve');
    // Den ubekreftede adressen skrives ikke inn som invitasjonens e-post.
    assert.equal(emp.invite.email, 'eve@firma.no');
    const claim = await call(claimEmployeeInvite, 'eve', { familyId: A }, ms);
    assert.equal(claim.ok, true);
    assert.notEqual(claim.needsVerifiedEmail, true);
  });

  test('SEC-26: administratorinvitasjon på kontoen krever bekreftet e-post lik invitasjonsadressen', async () => {
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ matchedBy: 'username' });
    await db.doc(`families/${A}/employees/emp_eve`).update({ 'invite.parentKey': 'eve' });
    // Nøkkelen alene (ubekreftet e-post): invitasjonen står, ingen kobling og ikke administrator.
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, ms);
    assert.deepEqual(res, { ok: false, error: 'email-not-verified' });
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'pending');
    assert.ok(!(await members()).includes('eve'));
    assert.equal((await data(`families/${A}/employees/emp_eve`)).personUid, undefined);
    assert.ok(!((await data(`families/${A}`)).adminUids || []).includes('eve'));
    // Bekreftet adresse lik invitasjonen (lenken fra ProTop eller confirmMicrosoftEmail): virker.
    const ok = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, { provider: 'microsoft.com' });
    assert.equal(ok.ok, true);
    assert.equal((await data(`families/${A}/employees/emp_eve`)).personUid, 'eve');
    assert.ok((await data(`families/${A}`)).adminUids.includes('eve'));
  });

  test('ubekreftet e-post tar ingen plass som bare passer på e-post, og invitasjonen står', async () => {
    // Funnet på brukernavn, men medarbeiderposten er bare knyttet til e-posten.
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ matchedBy: 'username' });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, ms);
    assert.deepEqual(res, { ok: false, error: 'email-not-verified' });
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'pending');
    assert.ok(!(await members()).includes('eve'));
    assert.equal((await data(`families/${A}/employees/emp_eve`)).personUid, undefined);
  });

  test('invitasjon funnet på e-post krever bekreftet e-post, og samme adresse', async () => {
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ matchedBy: 'email' });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, ms);
    assert.deepEqual(res, { ok: false, error: 'email-not-verified' });
    // Bekreftet, men en annen adresse enn invitasjonen ble sendt til (forfalsket profil-e-post).
    const other = await respondGroupInvite.run({
      data: { familyId: A, inviteId: 'inv_eve', response: 'accepted' },
      auth: { uid: 'eve', token: { email: 'angriper@gmail.com', email_verified: true } },
      rawRequest: { headers: {}, ip: '127.0.0.1' },
    });
    assert.deepEqual(other, { ok: false, error: 'other-email' });
    assert.ok(!(await members()).includes('eve'));
    // Bekreftet med lenken fra ProTop (eller confirmMicrosoftEmail): virker.
    const ok = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, { provider: 'microsoft.com' });
    assert.equal(ok.ok, true);
  });

  test('eldre invitasjon med e-post (uten matchedBy) krever fortsatt bekreftet e-post', async () => {
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }, ms);
    assert.deepEqual(res, { ok: false, error: 'email-not-verified' });
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'pending');
  });
});

describe('Avslå uten bekreftet e-post (REV-23)', () => {
  const ms = { verified: false, provider: 'microsoft.com' };

  test('en konto med en annens adresse (ubekreftet) avslår bare sin egen invitasjon', async () => {
    // mal er invitert på brukernavn, men har Ninas adresse som (ubekreftet) e-post på kontoen.
    await db.doc(`families/${A}/memberInvites/inv_mal`).set({
      status: 'pending', inviteKind: 'existing', inviteeUid: 'mal', inviteeName: 'Mal', invitedBy: 'own', familyId: A,
      matchedBy: 'username', groupType: 'organization',
    });
    const res = await respondGroupInvite.run({
      data: { familyId: A, inviteId: 'inv_mal', response: 'declined' },
      auth: { uid: 'mal', token: { email: 'nina@firma.no', email_verified: false, firebase: { sign_in_provider: 'microsoft.com' } } },
      rawRequest: { headers: {}, ip: '127.0.0.1' },
    });
    assert.equal(res.ok, true);
    assert.equal((await data(`families/${A}/memberInvites/inv_mal`)).status, 'declined');
    // Ninas plassholder, invitasjonslisten og medarbeiderposten står urørt.
    const nina = await data(`families/${A}/parents/ninafirmano`);
    assert.equal(nina.inviteStatus, 'pending');
    assert.notEqual(nina.deleted, true);
    assert.ok((await data(`families/${A}`)).invitedEmails.includes('nina@firma.no'));
    assert.equal((await data(`families/${A}/employees/emp_nina`)).invite.status, 'sent');
  });

  test('ubekreftet e-post: invitasjonen, plassholderen og posten som venter på kontoen avslås, e-postplassene står', async () => {
    await db.doc(`families/${A}/employees/emp_eve`).update({ 'invite.parentKey': 'eve' });
    await db.doc(`families/${A}/employees/emp_eve2`).set(employee('emp_eve2', 'Eve', 'eve@firma.no', 'ansatt'));
    await db.doc(`families/${A}/parents/evefirmano`).set({
      uid: 'evefirmano', email: 'eve@firma.no', familyId: A, createdBy: 'own', inviteStatus: 'pending', placeholder: true, active: false,
    });
    await db.doc(`families/${A}`).update({ invitedEmails: ['nina@firma.no', 'eve@firma.no'] });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'declined' }, ms);
    assert.equal(res.ok, true);
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'declined');
    assert.equal((await data(`families/${A}/parents/eve`)).inviteStatus, 'declined');
    assert.equal((await data(`families/${A}/employees/emp_eve`)).invite.status, 'declined');
    // Det som bare passer på adressen, avgjør den som har bekreftet den.
    assert.equal((await data(`families/${A}/employees/emp_eve2`)).invite.status, 'sent');
    assert.equal((await data(`families/${A}/parents/evefirmano`)).inviteStatus, 'pending');
    assert.ok((await data(`families/${A}`)).invitedEmails.includes('eve@firma.no'));
  });
});

describe('invitasjon fra en som ikke er administrator', () => {
  test('«asAdmin» fra en Øverste leder gir ikke administratorrettighet', async () => {
    await seed();
    await db.doc(`families/${A}`).update({ members: ['own', 'sjef'] });
    await db.doc(`families/${A}/parents/sjef`).set({ uid: 'sjef', admin: false, active: true });
    await db.doc(`families/${A}/employees/emp_eve`).set(employee('emp_eve', 'Eve', 'eve@firma.no', 'ansatt'));
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ invitedBy: 'sjef', asAdmin: true });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' });
    assert.equal(res.ok, true);
    const family = await data(`families/${A}`);
    assert.ok(family.members.includes('eve'));
    assert.ok(!(family.adminUids || []).includes('eve'));
    assert.equal((await data(`families/${A}/parents/eve`)).admin, false);
  });

  test('«asAdmin» fra eieren gir fortsatt administratorrettighet', async () => {
    await seed();
    await db.doc(`families/${A}/employees/emp_eve`).set(employee('emp_eve', 'Eve', 'eve@firma.no', 'ansatt'));
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ asAdmin: true });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' });
    assert.equal(res.ok, true);
    assert.ok((await data(`families/${A}`)).adminUids.includes('eve'));
  });
});

describe('invitasjoner som ikke lenger gjelder (FL-05, FL-10)', () => {
  test('slettet bedrift: Avslå lykkes og Godta feiler, og innboksen lukkes begge ganger', async () => {
    await db.doc(`families/${A}`).update({ deleted: true, hiddenFromApp: true });
    const accept = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' });
    assert.deepEqual(accept, { ok: false, error: 'gone' });
    assert.equal((await data(`users/eve/familyInvites/inv_eve`)).status, 'cancelled');
    await db.doc(`users/eve/familyInvites/inv_eve`).set({ status: 'pending' }, { merge: true });
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ status: 'pending' });
    const decline = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'declined' });
    assert.equal(decline.ok, true);
    assert.equal(decline.stale, 'gone');
    assert.equal((await data(`users/eve/familyInvites/inv_eve`)).status, 'cancelled');
  });

  test('invitasjon som ikke finnes eller er besvart: innboksen lukkes', async () => {
    await db.doc(`users/eve/familyInvites/borte`).set({ status: 'pending', familyId: A, inviteeUid: 'eve' });
    assert.deepEqual(
      await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'borte', response: 'accepted' }),
      { ok: false, error: 'not-found' },
    );
    assert.equal((await data('users/eve/familyInvites/borte')).status, 'expired');
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ status: 'declined' });
    const decline = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'declined' });
    assert.equal(decline.ok, true);
    assert.equal((await data('users/eve/familyInvites/inv_eve')).status, 'declined');
  });

  test('utløpt invitasjon kan ikke godtas', async () => {
    await db.doc(`families/${A}/memberInvites/inv_eve`).update({ expiresAt: '2020-01-01T00:00:00.000Z' });
    assert.deepEqual(
      await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }),
      { ok: false, error: 'expired' },
    );
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'expired');
    assert.equal((await data('users/eve/familyInvites/inv_eve')).status, 'expired');
    assert.equal((await data(`families/${A}/parents/eve`)).inviteStatus, 'expired', 'kan inviteres på nytt');
    assert.ok(!(await members()).includes('eve'));
  });

  test('bedriftsinvitasjon uten aktiv medarbeider avvises og trekkes tilbake', async () => {
    await db.doc(`families/${A}/employees/emp_eve`).delete();
    assert.deepEqual(
      await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' }),
      { ok: false, error: 'no-employee' },
    );
    assert.equal((await data(`families/${A}/memberInvites/inv_eve`)).status, 'revoked');
    assert.equal((await data('users/eve/familyInvites/inv_eve')).status, 'revoked');
    assert.ok(!(await members()).includes('eve'));
  });

  test('deaktivert medarbeider: invitasjonen gir ikke medlemskap', async () => {
    await db.doc(`families/${A}/employees/emp_eve`).set({ company: { status: 'inactive' } }, { merge: true });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' });
    assert.equal(res.error, 'no-employee');
    assert.ok(!(await members()).includes('eve'));
  });

  test('utløpt plassholder for ny bruker gir ingen invitasjon i innboksen', async () => {
    await db.doc(`families/${A}/parents/ninafirmano`).update({ inviteExpiresAt: '2020-01-01T00:00:00.000Z' });
    await db.doc(`families/${A}/employees/emp_nina`).set({ invite: { sentAt: '2020-01-01T00:00:00.000Z' } }, { merge: true });
    assert.equal((await call(syncMyInvites, 'nina', {})).invites.length, 0);
  });
});

describe('«Be om å bli med» (FL-15)', () => {
  test('forespørselen lukkes når personen godtar invitasjonen', async () => {
    await db.doc(`families/${A}/joinRequests/eve`).set({ uid: 'eve', status: 'pending', kind: 'member', source: 'orgnr' });
    const res = await call(respondGroupInvite, 'eve', { familyId: A, inviteId: 'inv_eve', response: 'accepted' });
    assert.equal(res.ok, true);
    assert.equal((await data(`families/${A}/joinRequests/eve`)).status, 'accepted');
  });
});
