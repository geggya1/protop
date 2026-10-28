/**
 * Samlingene utenfor families/** (profil, innboks, oppslag, venner, klassekart),
 * kjørt mot Firestore-emulatoren med de samme kallene som appen gjør.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/appCollections.rules.test.mjs"
 *
 * mor = foresatt i familien F, kid = barnet, ola = venn av mor, ext = fremmed.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  addDoc, arrayUnion, collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, orderBy, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const F = 'famF';
let env;

function as(uid) {
  return env.authenticatedContext(uid).firestore();
}

function anon() {
  return env.unauthenticatedContext().firestore();
}

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', F), {
      name: 'Familien', type: 'family', ownerUid: 'mor', adminUids: ['mor'], members: ['mor', 'kid'],
    });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', email: 'mor@x.no', admin: true });
    await setDoc(doc(db, 'families', F, 'children', 'kid'), { uid: 'kid', familyId: F, name: 'Kid' });
    await setDoc(doc(db, 'children', 'kid'), { uid: 'kid', familyId: F, name: 'Kid' });
    for (const uid of ['mor', 'kid', 'ola', 'ext']) {
      // Barnets profil er merket som barn, slik addChildMember lager den.
      await setDoc(doc(db, 'users', uid), { uid, displayName: uid, ...(uid === 'kid' ? { role: 'child' } : {}) });
      await setDoc(doc(db, 'parents', uid), { uid, name: uid, familyId: uid === 'mor' ? F : '' });
    }
    await setDoc(doc(db, 'users', 'mor', 'friends', 'ola'), { uid: 'ola', status: 'active' });
    await setDoc(doc(db, 'users', 'ola', 'friends', 'mor'), { uid: 'mor', status: 'active' });
    await setDoc(doc(db, 'users', 'mor', 'notifications', 'n1'), { title: 'Hei', createdBy: 'ola', seen: false });
    await setDoc(doc(db, 'usernames', 'mormor'), { uid: 'mor', type: 'adult', username: 'mormor' });
    await setDoc(doc(db, 'joinCodes', 'ABCD1234'), { code: 'ABCD1234', familyId: F, type: 'family' });
    await setDoc(doc(db, 'friendChats', 'mor_ola'), { type: 'dm', memberIds: ['mor', 'ola'], updatedAt: 1 });
    await setDoc(doc(db, 'friendships', 'mor_ola'), { memberIds: ['mor', 'ola'], status: 'active' });
    await setDoc(doc(db, 'classroomMaps', 'c1_s1'), { classroomId: F, studentId: 's1', viewerUids: ['mor'] });
    await setDoc(doc(db, 'families', F, 'events', 'e1'), { title: 'Bursdag', memberIds: ['mor', 'ola'] });
    await setDoc(doc(db, 'recipeCatalog', 'r1'), { title: 'Taco' });
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

describe('profil og innboks', () => {
  test('egen profil og egne undersamlinger kan leses og skrives', async () => {
    const db = as('mor');
    await assertSucceeds(getDoc(doc(db, 'users', 'mor')));
    await assertSucceeds(setDoc(doc(db, 'users', 'mor'), { notificationPrefs: { chat: true } }, { merge: true }));
    await assertSucceeds(getDocs(collection(db, 'users', 'mor', 'notifications')));
    await assertSucceeds(updateDoc(doc(db, 'users', 'mor', 'notifications', 'n1'), { seen: true }));
    await assertSucceeds(setDoc(doc(db, 'users', 'mor', 'pushSubscriptions', 'p1'), { endpoint: 'x' }));
    await assertSucceeds(getDocs(collection(db, 'users', 'mor', 'friends')));
  });

  test('andres profil og innboks er stengt', async () => {
    const db = as('ext');
    await assertFails(getDoc(doc(db, 'users', 'mor')));
    await assertFails(setDoc(doc(db, 'users', 'mor'), { displayName: 'x' }, { merge: true }));
    await assertFails(getDocs(collection(db, 'users', 'mor', 'notifications')));
    await assertFails(getDocs(collection(db, 'users', 'mor', 'friends')));
    await assertFails(getDocs(query(collection(db, 'users'), where('phone', '==', '+4712345678'))));
    await assertFails(getDoc(doc(anon(), 'users', 'mor')));
  });

  test('varsel til en annen: bare nytt varsel i eget navn, aldri overskriving', async () => {
    const db = as('ext');
    // Venn (ola) kan varsle mor. En fremmed kan ikke (se tests/rules/notifications.rules.test.mjs).
    await assertSucceeds(setDoc(doc(as('ola'), 'users', 'mor', 'notifications', 'n2'), {
      title: 'Melding', createdBy: 'ola', seen: false, createdAt: serverTimestamp(),
    }));
    await assertSucceeds(addDoc(collection(as('ola'), 'users', 'mor', 'notifications'), { title: 'x', createdBy: 'ola' }));
    await assertFails(addDoc(collection(db, 'users', 'mor', 'notifications'), { title: 'x', createdBy: 'ext' }));
    await assertFails(setDoc(doc(db, 'users', 'mor', 'notifications', 'n3'), { title: 'Falsk', createdBy: 'ola' }));
    await assertFails(setDoc(doc(db, 'users', 'mor', 'notifications', 'n1'), { title: 'Overskrevet', createdBy: 'ext' }));
    // Uten avsender: bare mellom medlemmer i samme gruppe (påminnelser, geofence).
    await assertSucceeds(setDoc(doc(as('kid'), 'users', 'mor', 'notifications', 'n4'), { title: 'Påminnelse', createdBy: null, familyId: F }));
    await assertFails(setDoc(doc(db, 'users', 'mor', 'notifications', 'n5'), { title: 'Påminnelse', createdBy: null, familyId: F }));
    await assertFails(setDoc(doc(db, 'users', 'mor', 'notifications', 'n6'), { title: 'Påminnelse' }));
  });

  test('foresatt kan stelle barnets profil og varsler, fremmede kan ikke', async () => {
    await assertSucceeds(setDoc(doc(as('mor'), 'users', 'kid'), { notificationPrefs: { chores: true } }, { merge: true }));
    await assertSucceeds(getDoc(doc(as('mor'), 'users', 'kid')));
    await assertSucceeds(setDoc(doc(as('mor'), 'children', 'kid'), { custody: {} }, { merge: true }));
    await assertFails(setDoc(doc(as('ext'), 'users', 'kid'), { displayName: 'x' }, { merge: true }));
    await assertFails(setDoc(doc(as('ext'), 'children', 'kid'), { familyId: 'annen' }, { merge: true }));
    // En ventende invitert voksen er ikke foresatt ennå.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', F, 'parents', 'ext'), { uid: 'ext', placeholder: true, inviteStatus: 'pending' });
    });
    await assertFails(setDoc(doc(as('ext'), 'users', 'kid'), { displayName: 'x' }, { merge: true }));
    await assertSucceeds(getDocs(query(collection(as('kid'), 'children'), where('uid', '==', 'kid'))));
  });

  test('spillinvitasjon og venneforespørsel kan legges i andres innboks i eget navn', async () => {
    await assertSucceeds(setDoc(doc(as('mor'), 'users', 'ola', 'gameInvites', 'chess_g1'), {
      status: 'pending', inviteeUid: 'ola', hostUid: 'mor', gameId: 'g1', gameType: 'chess',
    }));
    await assertFails(setDoc(doc(as('mor'), 'users', 'ola', 'gameInvites', 'chess_g2'), {
      status: 'pending', inviteeUid: 'ola', hostUid: 'ext', gameId: 'g2', gameType: 'chess',
    }));
    await assertSucceeds(setDoc(doc(as('ext'), 'users', 'ola', 'friendRequests', 'r1'), {
      status: 'pending', fromUid: 'ext', toUid: 'ola',
    }));
    await assertFails(setDoc(doc(as('ext'), 'users', 'ola', 'friendRequests', 'r2'), {
      status: 'accepted', fromUid: 'ext', toUid: 'ola',
    }));
  });

  test('deling til venn krever vennskap; den andre kan fjerne seg fra vennelisten', async () => {
    await assertSucceeds(setDoc(doc(as('ola'), 'users', 'mor', 'sharedAlbums', 'a1'), {
      albumId: 'a1', sharedBy: 'ola', kind: 'album',
    }));
    await assertFails(setDoc(doc(as('ext'), 'users', 'mor', 'sharedAlbums', 'a2'), {
      albumId: 'a2', sharedBy: 'ext', kind: 'album',
    }));
    await assertSucceeds(deleteDoc(doc(as('ola'), 'users', 'mor', 'sharedAlbums', 'a1')));
    await assertSucceeds(deleteDoc(doc(as('ola'), 'users', 'mor', 'friends', 'ola')));
    await assertFails(deleteDoc(doc(as('ext'), 'users', 'ola', 'friends', 'mor')));
  });
});

describe('grupper', () => {
  test('ny gruppe kan opprettes med seg selv som eier, ikke med andre som medlemmer', async () => {
    const db = as('ext');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', 'nyF'), {
      name: 'Ny', type: 'organization', ownerUid: 'ext', adminUids: ['ext'], members: ['ext'], active: true,
    });
    batch.set(doc(db, 'families', 'nyF', 'parents', 'ext'), { uid: 'ext', admin: true });
    batch.set(doc(db, 'parents', 'ext'), { familyIds: arrayUnion('nyF') }, { merge: true });
    batch.set(doc(db, 'users', 'ext'), { familyIds: arrayUnion('nyF') }, { merge: true });
    await assertSucceeds(batch.commit());
    await assertFails(setDoc(doc(db, 'families', 'kapret'), {
      name: 'X', ownerUid: 'ext', adminUids: ['ext'], members: ['ext', 'mor'],
    }));
    await assertFails(setDoc(doc(db, 'families', 'falsk'), {
      name: 'X', ownerUid: 'mor', adminUids: ['mor'], members: ['mor'],
    }));
  });

  test('egne grupper kan listes; andres kan ikke', async () => {
    await assertSucceeds(getDocs(query(collection(as('mor'), 'families'), where('members', 'array-contains', 'mor'))));
    await assertSucceeds(getDocs(query(collection(as('mor'), 'families'), where('adminUids', 'array-contains', 'mor'))));
    await assertSucceeds(getDocs(query(collection(as('mor'), 'families'), where('ownerUid', '==', 'mor'))));
    await assertFails(getDocs(query(collection(as('ext'), 'families'), where('members', 'array-contains', 'mor'))));
    await assertFails(getDocs(collection(as('ext'), 'families')));
  });

  test('egne medlemsdokumenter kan finnes på tvers av grupper (collectionGroup på uid)', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as('mor'), 'parents'), where('uid', '==', 'mor'))));
    await assertFails(getDocs(query(collectionGroup(as('ext'), 'parents'), where('uid', '==', 'mor'))));
    await assertFails(getDocs(query(collectionGroup(as('ext'), 'parents'), where('email', '==', 'mor@x.no'))));
    await assertSucceeds(getDocs(query(collectionGroup(as('kid'), 'children'), where('uid', '==', 'kid'))));
  });

  test('delte hendelser kan leses av den de er delt med', async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as('ola'), 'events'), where('memberIds', 'array-contains', 'ola'))));
    await assertFails(getDocs(query(collectionGroup(as('ext'), 'events'), where('memberIds', 'array-contains', 'ola'))));
  });
});

describe('oppslag', () => {
  test('brukernavn: oppslag før innlogging, ingen kan ta andres navn', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'usernames', 'mormor')));
    await assertFails(getDocs(collection(anon(), 'usernames')));
    await assertSucceeds(setDoc(doc(as('ext'), 'usernames', 'extern'), { uid: 'ext', type: 'adult', username: 'extern' }));
    await assertFails(setDoc(doc(as('ext'), 'usernames', 'mormor'), { uid: 'ext', type: 'adult', username: 'mormor' }));
    await assertFails(setDoc(doc(as('ext'), 'usernames', 'falsk'), { uid: 'mor', type: 'adult', username: 'falsk' }));
    await assertSucceeds(setDoc(doc(as('mor'), 'usernames', 'lillekid'), { uid: 'kid', type: 'child', username: 'lillekid' }));
    await assertFails(deleteDoc(doc(as('ext'), 'usernames', 'mormor')));
  });

  test('gruppekoder: innloggede slår opp, bare medlemmer skriver', async () => {
    await assertSucceeds(getDoc(doc(as('ext'), 'joinCodes', 'ABCD1234')));
    await assertFails(getDoc(doc(anon(), 'joinCodes', 'ABCD1234')));
    await assertSucceeds(setDoc(doc(as('mor'), 'joinCodes', 'NEW12345'), { code: 'NEW12345', familyId: F, type: 'family' }));
    await assertFails(setDoc(doc(as('ext'), 'joinCodes', 'HACK1234'), { code: 'HACK1234', familyId: F, type: 'family' }));
    await assertFails(setDoc(doc(as('mor'), 'joinCodes', 'NAME1234'), { code: 'NAME1234', familyId: F, name: 'Familien' }));
  });

  test('felles kataloger er skrivebeskyttet', async () => {
    await assertSucceeds(getDocs(collection(as('ext'), 'recipeCatalog')));
    await assertFails(setDoc(doc(as('ext'), 'recipeCatalog', 'r2'), { title: 'x' }));
  });
});

describe('venner og klassekart', () => {
  test('vennechat: bare de to i chatten leser og skriver', async () => {
    await assertSucceeds(getDocs(query(
      collection(as('mor'), 'friendChats'), where('memberIds', 'array-contains', 'mor'), orderBy('updatedAt', 'desc'),
    )));
    await assertSucceeds(addDoc(collection(as('ola'), 'friendChats', 'mor_ola', 'messages'), { text: 'Hei', senderId: 'ola' }));
    await assertFails(addDoc(collection(as('ola'), 'friendChats', 'mor_ola', 'messages'), { text: 'Hei', senderId: 'mor' }));
    await assertFails(getDocs(collection(as('ext'), 'friendChats', 'mor_ola', 'messages')));
    await assertFails(getDoc(doc(as('ext'), 'friendChats', 'mor_ola')));
    await assertSucceeds(getDoc(doc(as('ola'), 'friendships', 'mor_ola')));
    // Ny chat: appen sjekker om den finnes før den lages. Bare de to kan spørre.
    await assertSucceeds(getDoc(doc(as('mor'), 'friendChats', 'dm_kid_mor')));
    await assertFails(getDoc(doc(as('ext'), 'friendChats', 'dm_kid_mor')));
    await assertSucceeds(setDoc(doc(as('mor'), 'friendChats', 'dm_kid_mor'), { type: 'dm', memberIds: ['kid', 'mor'] }));
    await assertFails(getDoc(doc(as('ext'), 'friendChats', 'dm_kid_mor')));
    await assertFails(setDoc(doc(as('ext'), 'friendships', 'ext_mor'), { memberIds: ['ext', 'mor'], status: 'active' }));
  });

  test('klassekart: bare oppførte lesere; oppføringer kan ikke endres i ettertid', async () => {
    await assertSucceeds(getDoc(doc(as('mor'), 'classroomMaps', 'c1_s1')));
    await assertFails(getDoc(doc(as('ext'), 'classroomMaps', 'c1_s1')));
    const entry = await assertSucceeds(addDoc(collection(as('mor'), 'classroomMaps', 'c1_s1', 'entries'), { text: 'Notat' }));
    await assertFails(updateDoc(doc(as('mor'), 'classroomMaps', 'c1_s1', 'entries', entry.id), { text: 'Endret' }));
    await assertFails(getDocs(collection(as('ext'), 'classroomMaps', 'c1_s1', 'entries')));
    // Kartet finnes ikke ennå: medlem av klassen kan sjekke, andre ikke.
    await assertSucceeds(getDoc(doc(as('mor'), 'classroomMaps', `${F}_s9`)));
    await assertFails(getDoc(doc(as('ext'), 'classroomMaps', `${F}_s9`)));
  });
});
