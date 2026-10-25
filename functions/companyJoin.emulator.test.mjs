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
const { findCompanyByOrgnr, requestCompanyJoin } = await import('./companyJoin.js');

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
    members: ['own', 'adm'], company: { navn: 'Rådgiver AS', organisasjonsnummer: '999888777' },
  });
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

test('forespørsel lagres og varsler eier og administratorer, uten medlemskap', async () => {
  const res = await call(requestCompanyJoin, 'ny', { companyId: 'A', name: 'Ny Person' });
  assert.equal(res.ok, true);
  assert.equal(res.companyName, 'Rådgiver AS');
  const request = (await db.doc('families/A/joinRequests/ny').get()).data();
  assert.equal(request.status, 'pending');
  assert.equal(request.parentUid, 'ny');
  assert.equal(request.parentEmail, 'ny@firma.no');
  assert.deepEqual((await db.doc('families/A').get()).data().members, ['own', 'adm']);
  for (const admin of ['own', 'adm']) {
    const notes = await db.collection(`users/${admin}/notifications`).get();
    assert.equal(notes.size, 1);
    assert.match(notes.docs[0].data().body, /Ny Person \(ny@firma\.no\) ber om å bli med i «Rådgiver AS»\. Inviter personen/);
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
