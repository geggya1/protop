/**
 * Medlemskap og administrator på serveren: bare data klienten ikke kan skrive selv teller
 * (eierskap, adminUids, medlemslistene og et aktivt medlemsdokument). Regresjon for SEC-01,
 * SEC-02, SEC-03 og FL-08/FL-09 i sikkerhetsgjennomgangen.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/membership.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { assertCompanyAccess, assertFamilyAdmin, assertFamilyMember } = await import('./security.js');
const { syncCompany } = await import('./companyAccessSync.js');
const { writeMemberPasswordCopies } = await import('./authCallables.js');

const db = getFirestore();
const A = 'companyA';

async function denied(promise) {
  await assert.rejects(promise, (err) => err?.code === 'permission-denied');
}

async function data(path) {
  return (await db.doc(path).get()).data();
}

beforeEach(async () => {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc(`families/${A}`).set({
    name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'],
    members: ['own', 'adm', 'bob', 'eve', 'sjef', 'regn'], createdBy: 'bob', adminUid: 'bob',
    company: { navn: 'Bygg AS' },
  });
  for (const uid of ['own', 'adm', 'bob', 'sjef', 'regn']) {
    await db.doc(`families/${A}/parents/${uid}`).set({ uid, active: true, placeholder: false, admin: uid === 'bob' });
  }
  await db.doc(`families/${A}/parents/eve`).set({ uid: 'eve', active: false, deleted: true });
  for (const [uid, level] of [['bob', 'ansatt'], ['sjef', 'leder'], ['regn', 'regnskap_ekstern'], ['adm', 'administrator']]) {
    await db.doc(`families/${A}/employees/emp_${uid}`).set({ personUid: uid, company: { accessLevels: [level], status: 'active' } });
  }
  // Angriperen i et annet selskap skriver sine egne profildokumenter.
  await db.doc('parents/mal').set({ uid: 'mal', familyId: A, familyIds: [A], active: true });
  await db.doc('users/mal').set({ uid: 'mal', familyIds: [A] });
});

test('SEC-02: toppnivå parents/{uid}.familyId gir ikke medlemskap', async () => {
  await denied(assertFamilyMember(db, A, 'mal'));
  assert.ok(await assertFamilyMember(db, A, 'bob'));
  assert.ok(await assertFamilyMember(db, A, 'own'));
});

test('SEC-02: et aktivt medlemsdokument alene gir ikke medlemskap; et deaktivert vinner over listene', async () => {
  await db.doc(`families/${A}/parents/utenfor`).set({ uid: 'utenfor', active: true });
  await denied(assertFamilyMember(db, A, 'utenfor'));
  await denied(assertFamilyMember(db, A, 'eve'));
  // Eier og administrator kan fortsatt rydde, selv med et deaktivert dokument.
  await db.doc(`families/${A}/parents/adm`).set({ active: false }, { merge: true });
  assert.ok(await assertFamilyMember(db, A, 'adm'));
});

test('SEC-03: createdBy, adminUid og admin på medlemsdokumentet gir ikke admin', async () => {
  await denied(assertFamilyAdmin(db, A, 'bob'));
  assert.ok(await assertFamilyAdmin(db, A, 'adm'));
  assert.ok(await assertFamilyAdmin(db, A, 'own'));
});

test('FL-09: PowerOffice følger tilgangsstyringen som appen', async () => {
  const settings = { resource: 'economySettings', action: 'write' };
  const transfer = { resource: 'economyInvoices', action: 'read' };
  // Øverste leder har Admin på Økonomi – Innstillinger og redigerer Faktura.
  assert.ok(await assertCompanyAccess(db, A, 'sjef', settings));
  assert.ok(await assertCompanyAccess(db, A, 'sjef', transfer));
  // Regnskap eksternt kan bare lese.
  await denied(assertCompanyAccess(db, A, 'regn', settings));
  await denied(assertCompanyAccess(db, A, 'regn', transfer));
  await denied(assertCompanyAccess(db, A, 'bob', settings));
  await denied(assertCompanyAccess(db, A, 'mal', settings));
  assert.ok(await assertCompanyAccess(db, A, 'adm', settings));
  assert.ok(await assertCompanyAccess(db, A, 'own', transfer));
});

test('FL-08: administratorlisten følger nivået Administrator, og eieren beholder admin', async () => {
  // Bob blir administrator, adm nedgraderes til Øverste leder, eieren står uten ansattpost.
  await db.doc(`families/${A}/employees/emp_bob`).set({ personUid: 'bob', company: { accessLevels: ['administrator'], status: 'active' } });
  await db.doc(`families/${A}/employees/emp_adm`).set({ personUid: 'adm', company: { accessLevels: ['leder'], status: 'active' } });
  await db.doc(`families/${A}`).set({ adminUids: ['own', 'adm', 'gammel', 'ukoblet'], members: ['own', 'adm', 'bob', 'eve', 'sjef', 'regn', 'ukoblet'] }, { merge: true });
  const res = await syncCompany(A);
  assert.deepEqual(res.admins, { add: ['bob'], remove: ['adm', 'gammel'] });
  assert.deepEqual((await data(`families/${A}`)).adminUids, ['own', 'ukoblet', 'bob']);
  // Deaktivert administrator mister admin.
  await db.doc(`families/${A}/employees/emp_bob`).set({ company: { status: 'inactive' } }, { merge: true });
  await syncCompany(A);
  assert.deepEqual((await data(`families/${A}`)).adminUids, ['own', 'ukoblet']);
  // Speilet skrives for alle medlemmer.
  assert.equal((await data(`families/${A}/accessAcl/sjef`)).levelId, 'leder');
  // Ingen endring: ingen ny skriving.
  assert.deepEqual((await syncCompany(A)).admins, { add: [], remove: [] });
});

test('FL-08: administratorlisten i en familie røres ikke', async () => {
  await db.doc('families/F').set({ type: 'family', ownerUid: 'mor', adminUids: ['mor', 'far'], members: ['mor', 'far'] });
  await syncCompany('F');
  assert.deepEqual((await data('families/F')).adminUids, ['mor', 'far']);
});

test('SEC-01: passordkopiene lager aldri medlemsdokumenter i en fremmed gruppe', async () => {
  await writeMemberPasswordCopies(db, { uid: 'mal', familyId: A, isChildMember: true, password: 'hemmelig1' });
  assert.equal((await db.doc(`families/${A}/parents/mal`).get()).exists, false);
  assert.equal((await db.doc(`families/${A}/children/mal`).get()).exists, false);
  assert.equal((await db.doc('children/mal').get()).exists, false);
  await denied(assertFamilyMember(db, A, 'mal'));
  // Barnets egne kopier oppdateres når de finnes.
  await db.doc(`families/${A}/children/kid`).set({ uid: 'kid', active: true });
  await db.doc('children/kid').set({ uid: 'kid', familyId: A });
  await writeMemberPasswordCopies(db, { uid: 'kid', familyId: A, isChildMember: true, password: 'barn1234' });
  // SEC-21: passordet lagres ikke i klartekst; bare at det er satt.
  assert.equal((await data(`families/${A}/children/kid`)).password, undefined);
  assert.equal((await data('children/kid')).password, undefined);
  assert.ok((await data('children/kid')).passwordSetAt);
});

test('SEC-21: gamle lesbare barnepassord slettes når passordet settes på nytt', async () => {
  await db.doc(`families/${A}/children/kid`).set({ uid: 'kid', active: true, password: 'gammelt1' });
  await db.doc('children/kid').set({ uid: 'kid', familyId: A, password: 'gammelt1' });
  await db.doc('users/kid').set({ role: 'child', password: 'gammelt1' });
  await writeMemberPasswordCopies(db, { uid: 'kid', familyId: A, isChildMember: true, password: 'nytt1234' });
  for (const path of [`families/${A}/children/kid`, 'children/kid', 'users/kid']) {
    const row = await data(path);
    assert.equal(row.password, undefined, path);
    assert.equal(JSON.stringify(row).includes('nytt1234'), false, path);
  }
});
