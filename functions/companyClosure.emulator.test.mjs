/**
 * Avslutning, eksport og sletting av en bedrift (GRUNN-03) mot Firestore-emulatoren.
 * Storage er en falsk bucket som husker hva som slettes.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 functions/companyClosure.emulator.test.mjs"
 *
 * Bedrift A avsluttes og slettes. Bedrift B (samme eier) skal stå urørt.
 */
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getApps, initializeApp } = await import('firebase-admin/app');
if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { getFirestore } = await import('firebase-admin/firestore');
const {
  closeCompanyFor, exportCompanyDataFor, reopenCompanyFor, runCompanyPurge,
} = await import('./companyClosureStore.js');

const db = getFirestore();
const A = 'companyA';
const B = 'companyB';
const DAY = 24 * 60 * 60 * 1000;

function fakeBucket(names) {
  const files = new Map(names.map((name) => [name, { name, metadata: { size: '10', contentType: 'application/pdf' } }]));
  return {
    name: 'fake-bucket',
    deleted: [],
    files,
    async getFiles({ prefix }) {
      return [[...files.values()].filter((file) => file.name.startsWith(prefix))];
    },
    async deleteFiles({ prefix }) {
      this.deleted.push(prefix);
      for (const name of [...files.keys()]) if (name.startsWith(prefix)) files.delete(name);
    },
  };
}

async function exists(path) {
  return (await db.doc(path).get()).exists;
}

async function seedCompany(id, orgnr) {
  await db.doc(`families/${id}`).set({
    name: `Bygg ${id}`, type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'],
    members: ['own', 'adm', 'bob'], activeUsers: ['own', 'adm', 'bob'],
    company: { navn: `Bygg ${id} AS`, orgnr }, subscriptionStatus: 'active',
  });
  for (const uid of ['own', 'adm', 'bob']) await db.doc(`families/${id}/parents/${uid}`).set({ uid, active: true });
  await db.doc(`families/${id}/employees/e1`).set({ personUid: 'bob', person: { firstName: 'Bob' }, apiKey: 'hemmelig' });
  await db.doc(`families/${id}/employees/e1/usage/u1`).set({ type: 'login', at: '2026-10-01T08:00:00.000Z' });
  await db.doc(`families/${id}/employeesPrivate/e1`).set({ nationalId: '01017012345' });
  await db.doc(`families/${id}/invoices/i1`).set({ number: 1, issuedAt: '2026-09-01T10:00:00.000Z', total: 1000 });
  await db.doc(`families/${id}/timeEntries/t1`).set({ employeeId: 'e1', hours: 7.5, date: '2026-09-01' });
  // Melding i en chat der selve chat-dokumentet ikke finnes.
  await db.doc(`families/${id}/chats/team/messages/m1`).set({ text: 'Hei', senderId: 'bob' });
  await db.doc(`families/${id}/accessAcl/bob`).set({ grants: {} });
  await db.doc(`powerOfficeClients/${id}`).set({ clientKey: 'x' });
  await db.doc(`orgnrIndex/${orgnr}`).set({ orgnr, familyId: id });
  await db.doc(`joinCodes/CODE${id}`).set({ familyId: id });
  await db.doc(`ehfDeliveries/${id}_i1`).set({ status: 'sent' });
  await db.doc(`aiUsage/family_${id}_2026-10-01`).set({ count: 2 });
  await db.doc(`agreementShares/share${id}`).set({ companyId: id });
  await db.doc(`users/own/notifications/n${id}`).set({ familyId: id, title: 'Varsel' });
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await seedCompany(A, '111111111');
  await seedCompany(B, '222222222');
  await db.doc('users/own').set({ familyIds: [A, B], activeFamilyId: A });
  await db.doc('users/bob').set({ familyIds: [A], activeFamilyId: A });
  await db.doc('parents/bob').set({ familyIds: [A], familyId: A });
});

test('bare eier eller administrator kan avslutte, med navnet og bekreftelse om regnskapet', async () => {
  await assert.rejects(
    closeCompanyFor(db, { familyId: A, uid: 'bob', data: { confirm: 'Bygg companyA AS', accountingConfirmed: true } }),
    (err) => err.code === 'permission-denied',
  );
  await assert.rejects(
    closeCompanyFor(db, { familyId: A, uid: 'own', data: { confirm: 'Feil navn', accountingConfirmed: true } }),
    (err) => err.code === 'failed-precondition' && /bedriftens navn/.test(err.message),
  );
  // Utstedte fakturaer: bekreftelsen om regnskapsmaterialet kreves (bokføringsloven § 13).
  await assert.rejects(
    closeCompanyFor(db, { familyId: A, uid: 'own', data: { confirm: 'bygg companya as' } }),
    (err) => err.code === 'failed-precondition' && /bokføringsloven/.test(err.message),
  );
  assert.equal((await db.doc(`families/${A}`).get()).data().closure, undefined);

  const now = new Date('2026-10-28T10:00:00.000Z');
  const res = await closeCompanyFor(db, {
    familyId: A, uid: 'adm', actorName: 'Anne Admin', now, data: { confirm: 'bygg companya as', accountingConfirmed: true },
  });
  assert.equal(res.closure.deleteAfter, '2027-01-26T10:00:00.000Z');
  const family = (await db.doc(`families/${A}`).get()).data();
  assert.equal(family.deleteAfter, '2027-01-26T10:00:00.000Z');
  assert.equal(family.closure.closedByName, 'Anne Admin');
  assert.equal(family.subscriptionStatus, 'cancelled');
  const log = (await db.doc(`companyClosures/${A}`).get()).data();
  assert.equal(log.status, 'closed');
  assert.equal(log.events[0].type, 'closed');
  assert.equal(log.events[0].accountingConfirmed, true);
  // Eier får varsel om at en administrator avsluttet bedriften.
  const notes = await db.collection('users/own/notifications').where('eventType', '==', 'companyClosure').get();
  assert.equal(notes.size, 1);
  await assert.rejects(
    closeCompanyFor(db, { familyId: A, uid: 'own', data: { confirm: 'bygg companya as', accountingConfirmed: true } }),
    /allerede avsluttet/,
  );
});

test('angre før fristen gir bedriften tilbake som før', async () => {
  const now = new Date('2026-10-28T10:00:00.000Z');
  await closeCompanyFor(db, { familyId: A, uid: 'own', now, data: { confirm: 'Bygg companyA AS', accountingConfirmed: true } });
  await assert.rejects(reopenCompanyFor(db, { familyId: A, uid: 'bob', now }), (err) => err.code === 'permission-denied');
  await reopenCompanyFor(db, { familyId: A, uid: 'own', now: new Date('2026-11-01T10:00:00.000Z') });
  const family = (await db.doc(`families/${A}`).get()).data();
  assert.equal(family.closure, undefined);
  assert.equal(family.deleteAfter, undefined);
  assert.equal(family.subscriptionStatus, 'active');
  assert.equal((await db.doc(`companyClosures/${A}`).get()).data().status, 'reopened');
  // En angret avslutning slettes aldri.
  const run = await runCompanyPurge(db, [], { now: new Date('2027-06-01T00:00:00.000Z'), dryRun: false });
  assert.deepEqual(run.results, []);
  assert.ok(await exists(`families/${A}`));
});

test('eksporten har alle bedriftens dokumenter og filer, uten hemmelige felt og uten andre bedrifter', async () => {
  const bucket = fakeBucket([`families/${A}/invoices/i1/faktura-1.pdf`, `families/${B}/invoices/i1/faktura-1.pdf`]);
  const res = await exportCompanyDataFor(db, bucket, { familyId: A, uid: 'own', now: new Date('2026-10-28T10:00:00.000Z') });
  const data = JSON.parse(gunzipSync(Buffer.from(res.gzipBase64, 'base64')).toString('utf8'));
  assert.equal(data.format, 'protop-bedrift');
  assert.equal(data.company.id, A);
  const paths = data.documents.map((row) => row.path);
  for (const path of ['employees/e1', 'employees/e1/usage/u1', 'employeesPrivate/e1', 'invoices/i1', 'timeEntries/t1', 'chats/team/messages/m1', 'parents/own']) {
    assert.ok(paths.includes(path), `mangler ${path}`);
  }
  assert.equal(paths.some((path) => path.startsWith('accessAcl')), false, 'tilgangsspeilet er ikke bedriftens data');
  assert.equal(JSON.stringify(data).includes(B), false, 'ingenting fra bedrift B');
  assert.equal(data.documents.find((row) => row.path === 'employees/e1').data.apiKey, undefined);
  assert.deepEqual(data.files.map((row) => row.path), [`families/${A}/invoices/i1/faktura-1.pdf`]);
  assert.equal(res.fileName, 'protop-bedrift-bygg-companya-as-2026-10-28');
  await assert.rejects(exportCompanyDataFor(db, bucket, { familyId: A, uid: 'bob' }), (err) => err.code === 'permission-denied');
  // Eksporten logges, og avslutningen etterpå vet at den er tatt.
  await closeCompanyFor(db, { familyId: A, uid: 'own', data: { confirm: 'Bygg companyA AS', accountingConfirmed: true } });
  const log = (await db.doc(`companyClosures/${A}`).get()).data();
  assert.ok(log.lastExportAt);
  assert.equal(log.exportedBeforeClose, true);
  assert.deepEqual(log.events.map((row) => row.type), ['export', 'closed']);
});

test('slettingen tar bare bedriften der fristen er ute, med filer og koblinger, og ikke andre bedrifter', async () => {
  const closedAt = new Date(Date.now() - 100 * DAY);
  await closeCompanyFor(db, { familyId: A, uid: 'own', now: closedAt, data: { confirm: 'Bygg companyA AS', accountingConfirmed: true } });
  // B er også avsluttet, men nylig: fristen er ikke ute.
  await closeCompanyFor(db, { familyId: B, uid: 'own', data: { confirm: 'Bygg companyB AS', accountingConfirmed: true } });
  const bucket = fakeBucket([
    `families/${A}/invoices/i1/faktura-1.pdf`, `families/${A}/hr/e1/avtale.pdf`, `families/${B}/invoices/i1/faktura-1.pdf`,
  ]);

  const dry = await runCompanyPurge(db, [bucket]);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(dry.results.map((row) => [row.companyId, row.purge, row.reason]).sort(), [[A, true, 'due'], [B, false, 'not-due']]);
  assert.ok(await exists(`families/${A}`), 'tørrkjøring sletter ingenting');
  assert.equal(bucket.deleted.length, 0);

  const run = await runCompanyPurge(db, [bucket], { dryRun: false, actorUid: 'drift' });
  const rowA = run.results.find((row) => row.companyId === A);
  assert.equal(rowA.deleted, true, JSON.stringify(rowA.errors));
  assert.equal(rowA.files, 2);
  assert.deepEqual(bucket.deleted, [`families/${A}/`]);
  assert.deepEqual([...bucket.files.keys()], [`families/${B}/invoices/i1/faktura-1.pdf`]);

  for (const path of [
    `families/${A}`, `families/${A}/employees/e1`, `families/${A}/employees/e1/usage/u1`, `families/${A}/employeesPrivate/e1`,
    `families/${A}/invoices/i1`, `families/${A}/chats/team/messages/m1`, `families/${A}/parents/own`,
    `powerOfficeClients/${A}`, 'orgnrIndex/111111111', `joinCodes/CODE${A}`, `ehfDeliveries/${A}_i1`,
    `aiUsage/family_${A}_2026-10-01`, `agreementShares/share${A}`, `users/own/notifications/n${A}`,
  ]) {
    assert.equal(await exists(path), false, `${path} skulle vært slettet`);
  }
  for (const path of [
    `families/${B}`, `families/${B}/employees/e1/usage/u1`, `families/${B}/chats/team/messages/m1`, `families/${B}/invoices/i1`,
    `powerOfficeClients/${B}`, 'orgnrIndex/222222222', `joinCodes/CODE${B}`, `ehfDeliveries/${B}_i1`,
    `aiUsage/family_${B}_2026-10-01`, `agreementShares/share${B}`, `users/own/notifications/n${B}`,
  ]) {
    assert.equal(await exists(path), true, `${path} skal ikke røres`);
  }
  const own = (await db.doc('users/own').get()).data();
  assert.deepEqual(own.familyIds, [B]);
  assert.equal(own.activeFamilyId, undefined);
  const bobParent = (await db.doc('parents/bob').get()).data();
  assert.deepEqual(bobParent.familyIds, []);
  assert.equal(bobParent.familyId, undefined);

  const log = (await db.doc(`companyClosures/${A}`).get()).data();
  assert.equal(log.status, 'deleted');
  assert.equal(log.deletedBy, 'drift');
  assert.equal(log.companyName, undefined, 'beviset beholdes uten navn');
  assert.equal(log.orgnr, '111111111');
  assert.equal((await db.doc(`companyClosures/${B}`).get()).data().status, 'closed');

  // Ny kjøring: ingenting mer å slette.
  const again = await runCompanyPurge(db, [bucket], { dryRun: false });
  assert.deepEqual(again.results.map((row) => [row.companyId, row.purge]), [[B, false]]);
});

test('en frist som er endret på bedriften (ikke av serveren) gir ingen sletting', async () => {
  const closedAt = new Date(Date.now() - 100 * DAY);
  await closeCompanyFor(db, { familyId: A, uid: 'own', now: closedAt, data: { confirm: 'Bygg companyA AS', accountingConfirmed: true } });
  await db.doc(`families/${A}`).update({ 'closure.deleteAfter': '2099-01-01T00:00:00.000Z' });
  const run = await runCompanyPurge(db, [], { companyId: A, dryRun: false });
  assert.deepEqual(run.results.map((row) => [row.companyId, row.purge, row.reason]), [[A, false, 'mismatch']]);
  assert.ok(await exists(`families/${A}/invoices/i1`));
  // Et selskapsdokument med frist, men uten avslutning på serveren, slettes heller ikke.
  await db.doc(`families/${B}`).update({ closure: { status: 'closed', deleteAfter: '2020-01-01T00:00:00.000Z' }, deleteAfter: '2020-01-01T00:00:00.000Z' });
  const runB = await runCompanyPurge(db, [], { companyId: B, dryRun: false });
  assert.deepEqual(runB.results.map((row) => [row.companyId, row.purge]), [[B, false]]);
  assert.ok(await exists(`families/${B}`));
});
