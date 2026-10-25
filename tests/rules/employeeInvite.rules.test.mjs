/**
 * Invitasjon av medarbeider, kjørt mot Firestore-emulatoren med de samme
 * skrivingene og lesingene som appen gjør (src/utils/groups.js, notifications.js).
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test tests/rules/employeeInvite.rules.test.mjs"
 *
 * own = eier/administrator i bedriften, eve = eksisterende bruker som inviteres,
 * ext = innlogget bruker uten invitasjon.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const A = 'companyA';
const INVITE = 'inv1';

let env;

function as(uid) {
  return env.authenticatedContext(uid, { email: `${uid}@firma.no` }).firestore();
}

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'families', A), {
      name: 'Rådgiver AS', type: 'organization', ownerUid: 'own', adminUids: ['own'], members: ['own'],
    });
    await setDoc(doc(db, 'users', 'eve'), { uid: 'eve', displayName: 'Eve', email: 'eve@firma.no' });
    await setDoc(doc(db, 'parents', 'eve'), { uid: 'eve', name: 'Eve', email: 'eve@firma.no' });
  });
}

/** Det inviteExistingAdult skriver i én batch. */
function existingInviteBatch(db) {
  const invite = {
    status: 'pending', inviteKind: 'existing', inviteeUid: 'eve', inviteeName: 'Eve',
    inviteeEmail: 'eve@firma.no', invitedBy: 'own', asAdmin: false, familyId: A,
    familyName: 'Rådgiver AS', groupType: 'organization', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', A, 'memberInvites', INVITE), invite);
  batch.set(doc(db, 'families', A, 'parents', 'eve'), {
    uid: 'eve', name: 'Eve', email: 'eve@firma.no', familyId: A, createdBy: 'own',
    inviteStatus: 'pending', inviteKind: 'existing', inviteId: INVITE, active: false, placeholder: true,
    admin: false, superAdmin: false, deleted: false, archived: false,
  }, { merge: true });
  batch.set(doc(db, 'users', 'eve', 'familyInvites', INVITE), { ...invite, inviteId: INVITE }, { merge: true });
  return batch;
}

async function seedPendingExisting() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await existingInviteBatch(ctx.firestore()).commit();
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

describe('invitasjon til eksisterende bruker', () => {
  test('administrator kan sende invitasjonen (memberInvites + innboks hos mottaker)', async () => {
    await assertSucceeds(existingInviteBatch(as('own')).commit());
  });

  test('administrator kan varsle mottakeren', async () => {
    await assertSucceeds(setDoc(doc(as('own'), 'users', 'eve', 'notifications', `familyInvite_${A}_${INVITE}`), {
      eventType: 'familyInvite', title: 'Bedriftsinvitasjon', body: 'Du er invitert', familyId: A,
      inviteId: INVITE, createdBy: 'own', seen: false, createdAt: serverTimestamp(),
    }));
  });

  test('mottakeren ser ventende invitasjoner i innboksen', async () => {
    await seedPendingExisting();
    await assertSucceeds(getDocs(query(collection(as('eve'), 'users', 'eve', 'familyInvites'), where('status', '==', 'pending'))));
  });

  test('mottakeren kan åpne invitasjonen fra e-postlenken', async () => {
    await seedPendingExisting();
    await assertSucceeds(getDoc(doc(as('eve'), 'families', A, 'memberInvites', INVITE)));
  });

  test('før Godta: ingen tilgang til bedriften, og mottakeren kan ikke gjøre seg selv til medlem', async () => {
    await seedPendingExisting();
    const db = as('eve');
    await assertFails(getDoc(doc(db, 'families', A)));
    await assertFails(getDoc(doc(db, 'families', A, 'parents', 'own')));
    await assertFails(setDoc(doc(db, 'families', A, 'customers', 'k1'), { name: 'Kunde' }));
    await assertFails(updateDoc(doc(db, 'families', A), { members: arrayUnion('eve') }));
    await assertFails(setDoc(doc(db, 'families', A, 'parents', 'eve'), {
      active: true, placeholder: false, inviteStatus: 'accepted',
    }, { merge: true }));
  });

  test('etter Godta (serveren aktiverer medlemsdokumentet): tilgang til bedriften', async () => {
    await seedPendingExisting();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'families', A, 'parents', 'eve'), {
        active: true, placeholder: false, inviteStatus: 'accepted',
      }, { merge: true });
    });
    const db = as('eve');
    await assertSucceeds(getDoc(doc(db, 'families', A)));
    await assertSucceeds(setDoc(doc(db, 'families', A, 'customers', 'k1'), { name: 'Kunde' }));
  });

  test('deaktivert eller slettet medlem utenfor members[] har ikke tilgang', async () => {
    for (const patch of [{ active: false, archived: true }, { deleted: true }, { leftAt: new Date() }]) {
      await seed();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'families', A, 'parents', 'eve'), {
          uid: 'eve', placeholder: false, inviteStatus: 'accepted', active: true, ...patch,
        });
      });
      await assertFails(getDoc(doc(as('eve'), 'families', A)));
    }
  });

  test('en annen bruker kan ikke lese eller skrive mottakerens innboks', async () => {
    await seedPendingExisting();
    await assertFails(getDoc(doc(as('ext'), 'users', 'eve', 'familyInvites', INVITE)));
    await assertFails(setDoc(doc(as('ext'), 'users', 'eve', 'familyInvites', 'fake'), {
      status: 'pending', inviteeUid: 'eve', familyId: A, invitedBy: 'ext',
    }));
  });
});

describe('invitasjon til ny bruker', () => {
  test('administrator kan legge invitasjonen klar og merke e-posten', async () => {
    const db = as('own');
    await assertSucceeds(setDoc(doc(db, 'families', A, 'parents', 'ninafirmano'), {
      uid: 'ninafirmano', name: 'Nina', email: 'nina@firma.no', familyId: A, createdBy: 'own',
      inviteStatus: 'pending', clientSendsInvite: true, active: false, placeholder: true, admin: false,
    }, { merge: true }));
    await assertSucceeds(updateDoc(doc(db, 'families', A), { invitedEmails: arrayUnion('nina@firma.no') }));
  });

  test('administrator kan lagre medarbeideren med invitasjonsstatus', async () => {
    await assertSucceeds(setDoc(doc(as('own'), 'families', A, 'employees', 'emp_nina'), {
      id: 'emp_nina', person: { firstName: 'Nina', lastName: 'Berg', email: 'nina@firma.no' },
      company: { status: 'active', accessLevel: 'ansatt', accessRole: 'Ansatt', canLogin: false, email: 'nina@firma.no' },
      invite: { status: 'queued', email: 'nina@firma.no', accessLevel: 'ansatt' },
    }));
  });
});
