/**
 * Innsynslogg (L-19): serveren skriver hvem som åpnet en annens HR-mappe, lønn, fravær
 * eller personnummer, og bare HR og den det gjelder kan lese loggen.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/accessLog.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { listAccessLog, logSensitiveAccess, writeAccessEvent } = await import('./accessLog.js');

const db = getFirestore();
const A = 'companyA';

function call(fn, uid, data) {
  return fn.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true, name: `Navn ${uid}` } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function logRows() {
  return (await db.collection(`families/${A}/accessLog`).get()).docs.map((row) => row.data());
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc(`families/${A}`).set({
    name: 'Bygg AS', type: 'organization', ownerUid: 'own', adminUids: ['own'],
    members: ['own', 'hr', 'per', 'ola'],
    company: { navn: 'Bygg AS', accessPolicy: { version: 1, actionsVersion: 2, levels: { avdelingsleder: { hr: 'write' } } } },
  });
  await db.doc(`families/${A}/employees/emp-hr`).set({ personUid: 'hr', person: { firstName: 'Hanne', lastName: 'HR' }, company: { accessLevel: 'avdelingsleder', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-per`).set({ personUid: 'per', person: { firstName: 'Per', lastName: 'Ansatt' }, company: { accessLevel: 'ansatt', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-ola`).set({ personUid: 'ola', person: { firstName: 'Ola' }, company: { accessLevel: 'ansatt', status: 'active' } });
});

test('innsyn i en annens lønn logges med hvem, hva og hvem det gjelder, uten verdier', async () => {
  assert.deepEqual(await call(logSensitiveAccess, 'hr', { familyId: A, kind: 'salary', employeeId: 'emp-per' }), { ok: true, logged: true });
  const [row] = await logRows();
  assert.equal(row.actorUid, 'hr');
  assert.equal(row.actorName, 'Navn hr');
  assert.equal(row.kind, 'salary');
  assert.equal(row.employeeId, 'emp-per');
  assert.equal(row.employeeName, 'Per Ansatt');
  assert.ok(row.at && row.createdAt);
  // Samme innsyn innen ti minutter gir ingen ny rad.
  assert.equal((await call(logSensitiveAccess, 'hr', { familyId: A, kind: 'salary', employeeId: 'emp-per' })).logged, false);
  assert.equal((await logRows()).length, 1);
  // Eget innsyn logges ikke.
  assert.equal((await call(logSensitiveAccess, 'per', { familyId: A, kind: 'salary', employeeId: 'emp-per' })).own, true);
  assert.equal((await logRows()).length, 1);
});

test('bare medlemmer kan logge, og bare kjente typer', async () => {
  await assert.rejects(call(logSensitiveAccess, 'fremmed', { familyId: A, kind: 'salary' }), (err) => err.code === 'permission-denied');
  await assert.rejects(call(logSensitiveAccess, 'hr', { familyId: A, kind: 'noe' }), (err) => err.code === 'invalid-argument');
  assert.equal((await logRows()).length, 0);
});

test('eier og Admin på HR ser hele loggen; en ansatt ser bare innsyn i egne opplysninger', async () => {
  const now = Date.now();
  await writeAccessEvent(db, { familyId: A, uid: 'hr', actorName: 'Hanne', event: { kind: 'nationalId', employeeId: 'emp-per' }, now });
  await writeAccessEvent(db, { familyId: A, uid: 'hr', actorName: 'Hanne', event: { kind: 'hrFolder', employeeId: 'emp-ola' }, now: now + 1 });
  await writeAccessEvent(db, { familyId: A, uid: 'own', actorName: 'Eier', event: { kind: 'salary', employeeId: '' }, now: now + 2 });
  for (const uid of ['own', 'hr']) {
    const res = await call(listAccessLog, uid, { familyId: A });
    assert.equal(res.ok, true, uid);
    assert.equal(res.scope, 'company');
    assert.deepEqual(res.rows.map((row) => row.kind), ['salary', 'hrFolder', 'nationalId'], 'nyeste først');
  }
  // Per ser hvem som har sett personnummeret hans, men ikke innsyn i andre.
  const self = await call(listAccessLog, 'per', { familyId: A, employeeId: 'emp-per' });
  assert.equal(self.scope, 'self');
  assert.deepEqual(self.rows.map((row) => [row.actorName, row.kind]), [['Hanne', 'nationalId']]);
  await assert.rejects(call(listAccessLog, 'per', { familyId: A }), (err) => err.code === 'permission-denied');
  await assert.rejects(call(listAccessLog, 'per', { familyId: A, employeeId: 'emp-ola' }), (err) => err.code === 'permission-denied');
  await assert.rejects(call(listAccessLog, 'fremmed', { familyId: A }), (err) => err.code === 'permission-denied');
});
