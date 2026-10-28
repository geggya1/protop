/**
 * Regresjoner fra gjennomgangen av rettingene (REV-01, 02, 03, 11, 13), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/regressions.rules.test.mjs"
 *
 * Mange av testene gjør det en klient på 86332db (versjonen som ligger ute) gjør i vanlig bruk,
 * så reglene kan deployes uten at eldre apper slutter å virke (se docs/utrulling-regler.md).
 *
 * Bedrift A: own = eier, adm = administrator, bob og eve = ansatte med speil, noacl = ansatt uten speil.
 * Familie F: mor = eier, far = medforelder uten admin, kid = barn (barnekonto), ph_bestemor = invitasjon.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, arrayRemove, arrayUnion, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from 'firebase/firestore';

// RULES_FILE: en annen regelfil (f.eks. reglene før rettingen, for å se at testene fanger feilen).
const RULES = process.env.RULES_FILE || new URL('../../firestore.rules', import.meta.url);
const A = 'companyA';
const F = 'familyF';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
let env;

const as = (uid) => env.authenticatedContext(uid).firestore();
const ansatt = { employees: 'see', absence: 'read', absenceReport: 'read', hours: 'read', hoursApproval: 'read', iso: 'see' };

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'adm', 'bob', 'eve', 'noacl'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own', 'adm'], members, activeUsers: members,
      company: { navn: 'Bygg AS' },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, active: true });
      await setDoc(doc(db, 'families', A, 'employees', `emp_${uid}`), {
        personUid: uid, person: { firstName: uid }, company: { accessLevels: ['ansatt'], status: 'active', canLogin: true },
        invite: { status: 'accepted', acceptedUid: uid },
      });
    }
    for (const uid of ['adm', 'bob', 'eve']) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), {
        uid, iso: 1, levelId: 'ansatt', employeeId: `emp_${uid}`, grants: ansatt, expiresAt: FUTURE,
      });
    }
    await setDoc(doc(db, 'families', A, 'timeEntries', 'te1'), {
      projectId: 'p1', employeeId: 'emp_bob', date: '2026-10-20', hours: 2, status: 'registrert', invoiceId: null,
    });
    await setDoc(doc(db, 'families', A, 'timeEntries', 'te_locked'), {
      projectId: 'p1', employeeId: 'emp_bob', date: '2026-10-21', hours: 2, status: 'låst', invoiceId: null,
    });
    await setDoc(doc(db, 'families', A, 'projectExpenses', 'ex1'), { projectId: 'p1', employeeId: 'emp_bob', amountExVat: 100 });
    await setDoc(doc(db, 'families', A, 'absences', 'ab1'), { employeeId: 'emp_bob', date: '2026-10-20', hours: 7.5, status: 'registrert' });
    await setDoc(doc(db, 'families', A, 'absences', 'ab_eve'), { employeeId: 'emp_eve', date: '2026-10-20', hours: 7.5, status: 'registrert' });
    // Kalender uten private hendelser ennå: en felles og en eldre uten audience (laget av bob).
    await setDoc(doc(db, 'families', A, 'events', 'ev_all'), { title: 'Julebord', audience: 'family', memberIds: [], createdBy: 'own' });
    await setDoc(doc(db, 'families', A, 'events', 'ev_old'), { title: 'Sommerfest', memberIds: [], createdBy: 'bob' });

    // Familie: mor er eier/admin, far er godtatt medforelder uten admin, kid er barnekonto.
    await setDoc(doc(db, 'families', F), {
      name: 'Familien', type: 'family', ownerUid: 'mor', adminUids: ['mor'],
      members: ['mor', 'far', 'kid'], activeUsers: ['mor', 'far', 'kid'],
    });
    await setDoc(doc(db, 'families', F, 'parents', 'mor'), { uid: 'mor', active: true, admin: true });
    await setDoc(doc(db, 'families', F, 'parents', 'far'), { uid: 'far', active: true, admin: false, createdBy: 'mor' });
    await setDoc(doc(db, 'families', F, 'children', 'kid'), { uid: 'kid', familyId: F, name: 'Kari', active: true });
    await setDoc(doc(db, 'children', 'kid'), { uid: 'kid', familyId: F, name: 'Kari', active: true });
    await setDoc(doc(db, 'users', 'kid'), { uid: 'kid', role: 'child' });
    await setDoc(doc(db, 'users', 'voksen'), { uid: 'voksen', role: 'adult', email: 'v@x.no' });
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(RULES, 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(seed);

describe('REV-01: sletting av en rad som allerede er slettet', () => {
  test('to samtidige slettinger av samme timeføring lykkes begge', async () => {
    const ref = doc(as('bob'), 'families', A, 'timeEntries', 'te1');
    const [first, second] = await Promise.allSettled([deleteDoc(ref), deleteDoc(ref)]);
    assert.equal(first.status, 'fulfilled');
    assert.equal(second.status, 'fulfilled', String(second.reason?.code || ''));
  });

  test('timeEntries: ansatt og admin sletter en føring som ikke finnes', async () => {
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'timeEntries', 'te1')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'timeEntries', 'te1')));
    await assertSucceeds(deleteDoc(doc(as('adm'), 'families', A, 'timeEntries', 'finnes_ikke')));
  });

  test('en låst føring kan fortsatt ikke slettes, og utenforstående sletter ingenting', async () => {
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'timeEntries', 'te_locked')));
    await assertFails(deleteDoc(doc(as('ext'), 'families', A, 'timeEntries', 'finnes_ikke')));
  });

  test('prosjektutlegg, fakturautkast, notater og kalender: sletting av det som ikke finnes', async () => {
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'projectExpenses', 'ex1')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'projectExpenses', 'ex1')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'invoices', 'finnes_ikke')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'notes', 'finnes_ikke')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'events', 'finnes_ikke')));
  });

  test('fravær: eget fravær slettes to ganger, andres fravær fortsatt ikke', async () => {
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'absences', 'ab1')));
    await assertSucceeds(deleteDoc(doc(as('bob'), 'families', A, 'absences', 'ab1')));
    await assertFails(deleteDoc(doc(as('bob'), 'families', A, 'absences', 'ab_eve')));
  });
});

describe('REV-02: eier fjerner et barn fra familien', () => {
  // removeMemberFromGroup: medlemsdokumentet, medlemslistene og speilprofilen i samme batch.
  const removeChild = (uid) => {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.delete(doc(db, 'families', F, 'children', 'kid'));
    batch.update(doc(db, 'families', F), {
      members: arrayRemove('kid'), activeUsers: arrayRemove('kid'), memberIds: arrayRemove('kid'),
      adminUids: arrayRemove('kid'), updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'children', 'kid'), { deleted: true, active: false, familyId: null, wipedAt: serverTimestamp() }, { merge: true });
    return batch.commit();
  };

  test('eier setter familyId: null på barnets speilprofil (også etter at medlemsdokumentet er slettet)', async () => {
    await assertSucceeds(deleteDoc(doc(as('mor'), 'families', F, 'children', 'kid')));
    await assertSucceeds(setDoc(doc(as('mor'), 'children', 'kid'), {
      deleted: true, active: false, familyId: null, wipedAt: serverTimestamp(),
    }, { merge: true }));
  });

  test('hele fjerningen går i én batch, og barnet står ikke lenger i medlemslistene', async () => {
    await assertSucceeds(removeChild('mor'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const family = (await getDoc(doc(ctx.firestore(), 'families', F))).data();
      assert.equal(family.members.includes('kid'), false);
      assert.equal(family.activeUsers.includes('kid'), false);
    });
  });

  test('en som ikke er admin, får ikke fjernet barnet, og ingenting endres', async () => {
    await assertFails(removeChild('far'));
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      assert.ok((await getDoc(doc(db, 'families', F, 'children', 'kid'))).exists());
      assert.ok((await getDoc(doc(db, 'families', F))).data().members.includes('kid'));
    });
  });

  test('en utenforstående kan ikke flytte barnet ut av familien', async () => {
    await assertFails(setDoc(doc(as('ext'), 'children', 'kid'), { familyId: null }, { merge: true }));
  });
});

describe('REV-03: medforelder uten admin legger til et barn', () => {
  const childPayload = (uid) => ({ uid, familyId: F, name: 'Nytt barn', active: true, createdBy: 'far' });

  // addChildMember: speilprofil, barneprofil, så medlemsdokument og medlemslister i én batch.
  async function addChild(actor, uid, { profile = true } = {}) {
    const db = as(actor);
    await setDoc(doc(db, 'children', uid), childPayload(uid), { merge: true });
    if (profile) await setDoc(doc(db, 'users', uid), { uid, role: 'child', displayName: 'Nytt barn' }, { merge: true });
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', F, 'children', uid), childPayload(uid), { merge: true });
    batch.update(doc(db, 'families', F), { members: arrayUnion(uid), activeUsers: arrayUnion(uid), updatedAt: serverTimestamp() });
    return batch.commit();
  }

  test('far legger til et barn han nettopp har laget', async () => {
    await assertSucceeds(addChild('far', 'kid1'));
  });

  test('eldre app: medlemsdokument og profiler først, så medlemslistene i en egen skriving', async () => {
    const db = as('far');
    await assertSucceeds(setDoc(doc(db, 'families', F, 'children', 'kid2'), childPayload('kid2'), { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'children', 'kid2'), childPayload('kid2'), { merge: true }));
    await assertSucceeds(setDoc(doc(db, 'users', 'kid2'), { uid: 'kid2', role: 'child' }, { merge: true }));
    await assertSucceeds(updateDoc(doc(db, 'families', F), {
      members: arrayUnion('kid2'), activeUsers: arrayUnion('kid2'), updatedAt: serverTimestamp(),
    }));
  });

  test('en voksen konto kan ikke legges til som barn, og bare ett barn om gangen', async () => {
    const db = as('far');
    await assertSucceeds(setDoc(doc(db, 'families', F, 'children', 'voksen'), childPayload('voksen'), { merge: true }));
    await assertFails(updateDoc(doc(db, 'families', F), { members: arrayUnion('voksen') }));
    await assertFails(addChild('far', 'kid3', { profile: false }));
    await setDoc(doc(db, 'children', 'kid4'), childPayload('kid4'));
    await setDoc(doc(db, 'users', 'kid4'), { uid: 'kid4', role: 'child' });
    await setDoc(doc(db, 'families', F, 'children', 'kid4'), childPayload('kid4'));
    await assertFails(updateDoc(doc(db, 'families', F), { members: arrayUnion('kid4', 'voksen') }));
  });

  test('i en bedrift legger ingen ansatte til barn i medlemslistene', async () => {
    const db = as('bob');
    await setDoc(doc(db, 'families', A, 'children', 'kidA'), { uid: 'kidA', familyId: A, name: 'Barn' });
    await assertFails(updateDoc(doc(db, 'families', A), { members: arrayUnion('kidA') }));
  });
});

describe('REV-11: bedriftskalenderen og eldre hendelser', () => {
  const visibleIds = async (uid) => {
    const col = collection(as(uid), 'families', A, 'events');
    const parts = await Promise.all([
      getDocs(query(col, where('audience', '==', 'family'))),
      getDocs(query(col, where('memberIds', 'array-contains', uid))),
      getDocs(query(col, where('createdBy', '==', uid))),
    ]);
    return [...new Set(parts.flatMap((part) => part.docs.map((item) => item.id)))].sort();
  };

  // sealCompanyCalendar: eldre hendelser får audience, så merkes bedriften.
  const seal = async (uid) => {
    const db = as(uid);
    const batch = writeBatch(db);
    batch.update(doc(db, 'families', A, 'events', 'ev_old'), { audience: 'family' });
    await batch.commit();
    await updateDoc(doc(db, 'families', A), { privateEvents: true });
  };

  test('uten private hendelser lister eldre apper hele kalenderen, med eldre hendelser', async () => {
    const all = await assertSucceeds(getDocs(collection(as('eve'), 'families', A, 'events')));
    assert.deepEqual(all.docs.map((item) => item.id).sort(), ['ev_all', 'ev_old']);
    await assertSucceeds(getDocs(collection(as('noacl'), 'families', A, 'events')));
    await assertFails(getDocs(collection(as('ext'), 'families', A, 'events')));
  });

  test('når bedriften merkes, ser kollegene fortsatt den eldre hendelsen', async () => {
    await assertSucceeds(seal('eve'));
    assert.deepEqual(await visibleIds('eve'), ['ev_all', 'ev_old']);
    assert.deepEqual(await visibleIds('adm'), ['ev_all', 'ev_old']);
  });

  test('etter merkingen er private hendelser skjermet, også for eldre apper som lister alt', async () => {
    await seal('bob');
    await assertSucceeds(setDoc(doc(as('bob'), 'families', A, 'events', 'ev_priv'), {
      title: 'Lønnssamtale', audience: 'selected', memberIds: ['bob'], createdBy: 'bob',
    }));
    await assertFails(getDocs(collection(as('eve'), 'families', A, 'events')));
    assert.deepEqual(await visibleIds('eve'), ['ev_all', 'ev_old']);
    assert.deepEqual(await visibleIds('bob'), ['ev_all', 'ev_old', 'ev_priv']);
    await assertFails(getDoc(doc(as('eve'), 'families', A, 'events', 'ev_priv')));
  });

  test('merkingen kan ikke slås av, heller ikke av eier eller administrator', async () => {
    await seal('bob');
    await assertFails(updateDoc(doc(as('own'), 'families', A), { privateEvents: false }));
    await assertFails(updateDoc(doc(as('adm'), 'families', A), { privateEvents: false }));
    await assertFails(updateDoc(doc(as('eve'), 'families', A), { privateEvents: false }));
    await assertSucceeds(updateDoc(doc(as('own'), 'families', A), { name: 'Bygg AS Nord' }));
  });

  test('i en familie gjelder ikke merkingen: hele kalenderen listes som før', async () => {
    await assertSucceeds(getDocs(collection(as('far'), 'families', F, 'events')));
  });
});
