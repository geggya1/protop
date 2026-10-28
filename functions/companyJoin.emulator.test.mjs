/**
 * Opprett bedrift når organisasjonsnummeret finnes: oppslag og forespørsel om å bli med.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/companyJoin.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { claimCompanyOrgnr, findCompanyByOrgnr, requestCompanyJoin } = await import('./companyJoin.js');
const { assertCanInvite } = await import('./security.js');

const db = getFirestore();

function call(fn, uid, data) {
  return fn.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true, name: `Navn ${uid}` } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc('families/A').set({
    name: 'Rådgiver AS', type: 'organization', orgnr: '999888777', ownerUid: 'own', adminUids: ['own', 'adm'],
    members: ['own', 'adm', 'sjef', 'avd', 'ans'], company: { navn: 'Rådgiver AS', organisasjonsnummer: '999888777' },
  });
  // Rollene i tilgangsstyringen.
  for (const [uid, accessLevel] of [['sjef', 'leder'], ['avd', 'avdelingsleder'], ['ans', 'ansatt']]) {
    await db.doc(`families/A/employees/emp-${uid}`).set({ personUid: uid, company: { accessLevel, status: 'active' } });
  }
  await db.doc('families/gammel').set({ name: 'Slettet AS', orgnr: '111222333', deleted: true, members: ['x'] });
});

test('oppslag gir bare id og navn, og om man allerede er med', async () => {
  assert.deepEqual(await call(findCompanyByOrgnr, 'ny', { orgnr: '999 888 777' }), {
    ok: true, company: { id: 'A', name: 'Rådgiver AS', member: false },
  });
  assert.equal((await call(findCompanyByOrgnr, 'own', { orgnr: '999888777' })).company.member, true);
  assert.deepEqual(await call(findCompanyByOrgnr, 'ny', { orgnr: '111222333' }), { ok: true, company: null });
  assert.deepEqual(await call(findCompanyByOrgnr, 'ny', { orgnr: '123' }), { ok: true, company: null });
});

test('forespørsel lagres og varsler eier, administratorer og Øverste leder, uten medlemskap', async () => {
  const res = await call(requestCompanyJoin, 'ny', { companyId: 'A', name: 'Ny Person' });
  assert.equal(res.ok, true);
  assert.equal(res.companyName, 'Rådgiver AS');
  const request = (await db.doc('families/A/joinRequests/ny').get()).data();
  assert.equal(request.status, 'pending');
  assert.equal(request.parentUid, 'ny');
  assert.equal(request.parentEmail, 'ny@firma.no');
  assert.deepEqual((await db.doc('families/A').get()).data().members, ['own', 'adm', 'sjef', 'avd', 'ans']);
  for (const admin of ['own', 'adm', 'sjef']) {
    const notes = await db.collection(`users/${admin}/notifications`).get();
    assert.equal(notes.size, 1, admin);
    assert.match(notes.docs[0].data().body, /Ny Person \(ny@firma\.no\) ber om å bli med i «Rådgiver AS»\. Inviter personen/);
  }
  // Avdelingsleder og ansatt har ikke Admin på Ansatte.
  for (const other of ['avd', 'ans']) {
    assert.equal((await db.collection(`users/${other}/notifications`).get()).size, 0, other);
  }
  const again = await call(requestCompanyJoin, 'ny', { companyId: 'A' });
  assert.equal(again.already, true);
  assert.equal((await db.collection('users/own/notifications').get()).size, 1, 'ingen dobbel varsling');
});

test('medlem eller ukjent bedrift gir feilkode', async () => {
  assert.deepEqual(await call(requestCompanyJoin, 'adm', { companyId: 'A' }), { ok: false, error: 'already-member' });
  assert.deepEqual(await call(requestCompanyJoin, 'ny', { companyId: 'gammel' }), { ok: false, error: 'not-found' });
  assert.deepEqual(await call(requestCompanyJoin, 'ny', { companyId: '' }), { ok: false, error: 'not-found' });
});

test('tilgangsstyringen bestemmer mottakerne: avdelingsleder med Admin på Ansatte får varselet', async () => {
  await db.doc('families/A').set({
    company: { accessPolicy: { version: 1, actionsVersion: 2, levels: { avdelingsleder: { employees: 'write' }, leder: { employees: 'read' } } } },
  }, { merge: true });
  await call(requestCompanyJoin, 'ny', { companyId: 'A', name: 'Ny Person' });
  const got = {};
  for (const uid of ['own', 'adm', 'sjef', 'avd', 'ans']) got[uid] = (await db.collection(`users/${uid}/notifications`).get()).size;
  assert.deepEqual(got, { own: 1, adm: 1, sjef: 0, avd: 1, ans: 0 });
});

test('de som får forespørselen kan også invitere; andre kan ikke', async () => {
  await db.doc('families/A/parents/own').set({ uid: 'own', admin: true, active: true });
  for (const uid of ['adm', 'sjef', 'avd', 'ans']) await db.doc(`families/A/parents/${uid}`).set({ uid, admin: false, active: true });
  for (const uid of ['own', 'adm', 'sjef']) {
    assert.ok(await assertCanInvite(db, 'A', uid), uid);
  }
  for (const uid of ['avd', 'ans', 'fremmed']) {
    await assert.rejects(assertCanInvite(db, 'A', uid), (err) => err.code === 'permission-denied', uid);
  }
  // Fjernet fra bedriften, men ansattraden står som Øverste leder: kan ikke invitere.
  await db.doc('families/A/employees/emp-tidligere').set({ personUid: 'tidligere', company: { accessLevel: 'leder', status: 'active' } });
  await assert.rejects(assertCanInvite(db, 'A', 'tidligere'), (err) => err.code === 'permission-denied');
  // Sluttet leder kan ikke lenger invitere.
  await db.doc('families/A/employees/emp-sjef').set({ personUid: 'sjef', company: { accessLevel: 'leder', status: 'inactive' } });
  await assert.rejects(assertCanInvite(db, 'A', 'sjef'), (err) => err.code === 'permission-denied');
  // I en familie gjelder ikke tilgangsmatrisen.
  await db.doc('families/F').set({ type: 'family', ownerUid: 'own', members: ['own', 'sjef'] });
  await db.doc('families/F/parents/sjef').set({ uid: 'sjef', admin: false, active: true });
  await db.doc('families/F/employees/emp-sjef').set({ personUid: 'sjef', company: { accessLevel: 'leder', status: 'active' } });
  await assert.rejects(assertCanInvite(db, 'F', 'sjef'), (err) => err.code === 'permission-denied');
});

/* ───────── SEC-18 / FL-26: orgnummeret eies av én bedrift ───────── */

test('ny bedrift med et orgnr som er i bruk, tar ikke over oppslaget', async () => {
  // Første oppslag knytter orgnummeret til A.
  assert.equal((await call(findCompanyByOrgnr, 'ny', { orgnr: '999888777' })).company.id, 'A');
  assert.equal((await db.doc('orgnrIndex/999888777').get()).data().familyId, 'A');
  // Angriperen lager en bedrift med samme orgnr og en forfalsket, gammel createdAt.
  // Id-en sorterer før A, så «første treff» ville gitt angriperen.
  await db.doc('families/0-kapring').set({
    name: 'Falsk AS', type: 'organization', orgnr: '999888777', ownerUid: 'angriper', members: ['angriper'],
    company: { navn: 'Falsk AS', organisasjonsnummer: '999888777' }, createdAt: new Date('2001-01-01'),
  });
  assert.deepEqual(await call(claimCompanyOrgnr, 'angriper', { familyId: '0-kapring' }), {
    ok: true, claimed: false, orgnr: '999888777', taken: { id: 'A', name: 'Rådgiver AS' },
  });
  for (let i = 0; i < 3; i += 1) {
    assert.equal((await call(findCompanyByOrgnr, 'ny', { orgnr: '999888777' })).company.id, 'A');
  }
  assert.equal((await db.doc('orgnrIndex/999888777').get()).data().familyId, 'A');
  // Slettes A, går oppslaget videre til den eldste levende bedriften.
  await db.doc('families/A').set({ deleted: true }, { merge: true });
  assert.equal((await call(findCompanyByOrgnr, 'ny', { orgnr: '999888777' })).company.id, '0-kapring');
});

test('uten indeks vinner den eldste bedriften etter Firestores opprettelsestid, ikke createdAt', async () => {
  // A finnes fra beforeEach. Den nye bedriften later som den er eldst.
  await db.doc('families/0-yngre').set({
    name: 'Yngre AS', type: 'organization', orgnr: '999888777', ownerUid: 'x', members: ['x'],
    createdAt: new Date('2001-01-01'),
  });
  assert.equal((await db.doc('orgnrIndex/999888777').get()).exists, false);
  assert.equal((await call(findCompanyByOrgnr, 'ny', { orgnr: '999888777' })).company.id, 'A');
  // Eldre bedrift som bare har orgnummeret i selskapsprofilen, blir også funnet.
  await db.doc('families/profil').set({ name: 'Profil AS', company: { navn: 'Profil AS', organisasjonsnummer: '555444333' } });
  assert.equal((await call(findCompanyByOrgnr, 'ny', { orgnr: '555444333' })).company.id, 'profil');
});

test('bare eier eller administrator i en bedrift kan knytte orgnummeret', async () => {
  await db.doc('families/ny-bedrift').set({
    name: 'Ny Bedrift AS', type: 'organization', orgnr: '123456785', ownerUid: 'eier', adminUids: ['eier'], members: ['eier', 'ans'],
  });
  assert.deepEqual(await call(claimCompanyOrgnr, 'ans', { familyId: 'ny-bedrift' }), { ok: false, error: 'forbidden' });
  assert.deepEqual(await call(claimCompanyOrgnr, 'fremmed', { familyId: 'ny-bedrift' }), { ok: false, error: 'forbidden' });
  assert.equal((await db.doc('orgnrIndex/123456785').get()).exists, false);
  assert.deepEqual(await call(claimCompanyOrgnr, 'eier', { familyId: 'ny-bedrift' }), { ok: true, claimed: true, orgnr: '123456785' });
  const index = (await db.doc('orgnrIndex/123456785').get()).data();
  assert.equal(index.familyId, 'ny-bedrift');
  assert.equal(index.source, 'claim');
  assert.equal(index.claimedBy, 'eier');
  // Familie, ukjent og bedrift uten orgnr.
  await db.doc('families/fam').set({ type: 'family', ownerUid: 'eier', orgnr: '123456785' });
  assert.deepEqual(await call(claimCompanyOrgnr, 'eier', { familyId: 'fam' }), { ok: false, error: 'not-company' });
  assert.deepEqual(await call(claimCompanyOrgnr, 'eier', { familyId: 'finnes-ikke' }), { ok: false, error: 'not-found' });
  await db.doc('families/uten').set({ type: 'organization', ownerUid: 'eier' });
  assert.deepEqual(await call(claimCompanyOrgnr, 'eier', { familyId: 'uten' }), { ok: true, claimed: false, orgnr: '' });
});

