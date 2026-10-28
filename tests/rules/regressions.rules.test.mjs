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
