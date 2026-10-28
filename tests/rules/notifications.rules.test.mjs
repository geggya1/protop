/**
 * Varsler i andres innboks (users/{uid}/notifications), kjørt mot Firestore-emulatoren
 * med de samme skrivingene som appen gjør (src/utils/notifications.js notifyUsers).
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/notifications.rules.test.mjs"
 *
 * boss og kari = medlemmer i bedriften B, ola = venn av kari, ext = fremmed,
 * eve = invitert til B (ikke medlem ennå), kid = barn i familien F.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const B = 'companyB';
const F = 'famF';
const INVITE = 'inv1';
let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

function note(extra = {}) {
  return { eventType: 'messageReceived', title: 'Melding', body: 'Hei', seen: false, createdAt: serverTimestamp(), ...extra };
}

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', B), {
      name: 'Bygg AS', type: 'organization', ownerUid: 'boss', adminUids: ['boss'], members: ['boss', 'kari'],
    });
    await setDoc(doc(db, 'families', B, 'parents', 'boss'), { uid: 'boss', active: true });
    await setDoc(doc(db, 'families', B, 'parents', 'kari'), { uid: 'kari', active: true });
    await setDoc(doc(db, 'families', F), { name: 'Familien', type: 'family', ownerUid: 'mor', members: ['mor'] });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', active: true });
    await setDoc(doc(db, 'families', F, 'children', 'kid'), { uid: 'kid', familyId: F });
    await setDoc(doc(db, 'children', 'kid'), { uid: 'kid', familyId: F });
    await setDoc(doc(db, 'users', 'kari', 'friends', 'ola'), { uid: 'ola', status: 'active' });
    await setDoc(doc(db, 'users', 'ola', 'friends', 'kari'), { uid: 'kari', status: 'active' });
    await setDoc(doc(db, 'users', 'kari', 'notifications', 'old'), note({ createdBy: 'boss' }));
    // Invitasjon fra boss til eve (inviteExistingAdult skriver dette før varselet).
    const invite = { status: 'pending', inviteeUid: 'eve', invitedBy: 'boss', familyId: B, inviteId: INVITE };
    await setDoc(doc(db, 'families', B, 'memberInvites', INVITE), invite);
    await setDoc(doc(db, 'users', 'eve', 'familyInvites', INVITE), invite);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(seed);

describe('varsel til andre', () => {
  test('kollega i samme bedrift kan varsle (oppgave, chat, notat)', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'users', 'kari', 'notifications', 'n1'),
      note({ eventType: 'taskReceived', familyId: B, createdBy: 'boss' })));
    await assertSucceeds(addDoc(collection(as('kari'), 'users', 'boss', 'notifications'),
      note({ familyId: B, createdBy: 'kari', chatId: 'family' })));
  });

  test('fremmed kan ikke legge varsel i en annens innboks', async () => {
    await assertFails(setDoc(doc(as('ext'), 'users', 'kari', 'notifications', 'phish'),
      note({ title: 'Passordet ditt utløper', createdBy: 'ext' })));
    await assertFails(addDoc(collection(as('ext'), 'users', 'kari', 'notifications'),
      note({ createdBy: 'ext' })));
    // Ikke medlem, men oppgir bedriftens id.
    await assertFails(setDoc(doc(as('ext'), 'users', 'kari', 'notifications', 'phish2'),
      note({ familyId: B, createdBy: 'ext' })));
    // Medlem av egen gruppe, men mottakeren er ikke med der.
    await assertFails(setDoc(doc(as('mor'), 'users', 'kari', 'notifications', 'phish3'),
      note({ familyId: F, createdBy: 'mor' })));
  });

  test('avsender må være den innloggede', async () => {
    await assertFails(setDoc(doc(as('ext'), 'users', 'kari', 'notifications', 'n2'),
      note({ familyId: B, createdBy: 'boss' })));
  });

  test('venn kan varsle (vennechat, delt hendelse)', async () => {
    await assertSucceeds(setDoc(doc(as('ola'), 'users', 'kari', 'notifications', 'friendChat_1'),
      note({ friendChat: true, friendUid: 'ola', chatId: 'dm_kari_ola', createdBy: 'ola' })));
  });

  test('fjernet venn kan ikke varsle', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(ctx.firestore(), 'users', 'kari', 'friends', 'ola'));
    });
    await assertFails(setDoc(doc(as('ola'), 'users', 'kari', 'notifications', 'friendChat_2'),
      note({ friendChat: true, createdBy: 'ola' })));
  });

  test('gruppeinvitasjon: den som inviterte kan varsle den inviterte', async () => {
    await assertSucceeds(setDoc(doc(as('boss'), 'users', 'eve', 'notifications', `familyInvite_${B}_${INVITE}`),
      note({ eventType: 'familyInvite', familyId: B, inviteId: INVITE, createdBy: 'boss' })));
    // Andre kan ikke bruke invitasjonen til å varsle eve.
    await assertFails(setDoc(doc(as('kari'), 'users', 'eve', 'notifications', 'x1'),
      note({ eventType: 'familyInvite', familyId: B, inviteId: INVITE, createdBy: 'kari' })));
    await assertFails(setDoc(doc(as('ext'), 'users', 'eve', 'notifications', 'x2'),
      note({ eventType: 'familyInvite', familyId: B, inviteId: 'finnes-ikke', createdBy: 'ext' })));
  });

  test('svar på invitasjon går tilbake til den som inviterte', async () => {
    await assertSucceeds(setDoc(doc(as('eve'), 'users', 'boss', 'notifications', 'svar'),
      note({ eventType: 'familyInviteDeclined', familyId: B, inviteId: INVITE, createdBy: 'eve' })));
    await assertFails(setDoc(doc(as('eve'), 'users', 'kari', 'notifications', 'svar2'),
      note({ eventType: 'familyInviteDeclined', familyId: B, inviteId: INVITE, createdBy: 'eve' })));
  });

  test('foresatt kan varsle barnet i familien', async () => {
    await assertSucceeds(setDoc(doc(as('mor'), 'users', 'kid', 'notifications', 'chore'),
      note({ eventType: 'choreReceived', familyId: F, createdBy: 'mor' })));
  });

  test('uten avsender: bare mellom medlemmer i samme gruppe', async () => {
    await assertSucceeds(setDoc(doc(as('kari'), 'users', 'boss', 'notifications', 'r1'),
      note({ eventType: 'boligReminder', familyId: B, createdBy: null })));
    await assertFails(setDoc(doc(as('ext'), 'users', 'boss', 'notifications', 'r2'),
      note({ familyId: B, createdBy: null })));
    await assertFails(setDoc(doc(as('kari'), 'users', 'boss', 'notifications', 'r3'), note({})));
  });

  test('eksisterende varsel kan ikke overskrives av andre, eieren kan markere sett', async () => {
    await assertFails(setDoc(doc(as('boss'), 'users', 'kari', 'notifications', 'old'),
      note({ title: 'Overskrevet', familyId: B, createdBy: 'boss' })));
    await assertSucceeds(updateDoc(doc(as('kari'), 'users', 'kari', 'notifications', 'old'), { seen: true }));
  });
});
