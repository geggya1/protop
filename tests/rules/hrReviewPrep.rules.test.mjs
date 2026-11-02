/**
 * Medarbeidersamtalen fra invitasjon til signatur (src/hr/reviewPrep.js), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/hrReviewPrep.rules.test.mjs"
 *
 * own = eier, hr = HR (skriv), les = HR (lese), bob = ansatt samtalen gjelder, eve = annen ansatt.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from 'firebase/firestore';

const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
const hrSurface = (rank) => ({
  hr: rank, hrPeople: rank, hrAgreements: rank, hrPayroll: rank, hrFollowup: rank, hrCompliance: rank, hrRecruitment: rank,
});
const ansatt = { employees: 'see', absence: 'read', hours: 'read', iso: 'see' };
const ACL = {
  hr: { levelId: 'ansatt', employeeId: 'emp_hr', grants: { ...ansatt, ...hrSurface('read') } },
  les: { levelId: 'ansatt', employeeId: 'emp_les', grants: { ...ansatt, ...hrSurface('see') } },
  bob: { levelId: 'ansatt', employeeId: 'emp_bob', grants: ansatt },
  eve: { levelId: 'ansatt', employeeId: 'emp_eve', grants: ansatt },
};

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const prepRef = (db, id = 'dok1') => doc(db, 'families', A, 'hrReviewPrep', id);
const invitation = (extra = {}) => ({
  docId: 'dok1', employeeId: 'emp_bob', employeeUid: 'bob', employeeName: 'Bob', leaderUid: 'hr', leaderName: 'Hanne',
  meetingDate: '2026-03-12', topics: [{ id: 'r1', no: '1.', title: 'Mål', prompts: [] }],
  answers: {}, status: 'sent', submittedAt: '', comment: '', employeeSignature: null, signing: null, ...extra,
});

async function seed(prep = null) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'hr', 'les', 'bob', 'eve'];
    await setDoc(doc(db, 'families', A), {
      name: 'Bygg AS', type: 'company', ownerUid: 'own', adminUids: ['own'], members, activeUsers: members,
      company: { navn: 'Bygg AS', accessPolicy: { v: 1 } },
    });
    for (const uid of members) {
      await setDoc(doc(db, 'families', A, 'parents', uid), { uid, active: true });
      await setDoc(doc(db, 'families', A, 'employees', `emp_${uid}`), {
        personUid: uid,
        person: { firstName: uid },
        company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', status: 'active', canLogin: true },
        invite: { status: 'accepted', acceptedUid: uid },
      });
    }
    for (const [uid, row] of Object.entries(ACL)) {
      await setDoc(doc(db, 'families', A, 'accessAcl', uid), { uid, iso: 1, ...row, expiresAt: FUTURE });
    }
    if (prep) await setDoc(prepRef(db), prep);
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });

describe('hrReviewPrep: lese', () => {
  beforeEach(() => seed(invitation({ answers: { r1: 'Kurs' }, status: 'submitted', submittedAt: '2026-03-10T10:00:00Z' })));

  test('HR og den ansatte selv leser; andre ansatte ikke', async () => {
    await assertSucceeds(getDoc(prepRef(as('hr'))));
    await assertSucceeds(getDoc(prepRef(as('les'))));
    await assertSucceeds(getDoc(prepRef(as('own'))));
    await assertSucceeds(getDoc(prepRef(as('bob'))));
    await assertFails(getDoc(prepRef(as('eve'))));
    await assertFails(getDoc(prepRef(env.unauthenticatedContext().firestore())));
  });

  test('den ansatte lister bare sine egne', async () => {
    const col = (db) => collection(db, 'families', A, 'hrReviewPrep');
    await assertSucceeds(getDocs(query(col(as('bob')), where('employeeUid', '==', 'bob'))));
    await assertFails(getDocs(col(as('bob'))));
    await assertFails(getDocs(query(col(as('eve')), where('employeeUid', '==', 'bob'))));
    await assertSucceeds(getDocs(col(as('hr'))));
  });
});

describe('hrReviewPrep: skrive', () => {
  test('HR med skrivetilgang inviterer; lesetilgang og ansatte kan ikke', async () => {
    await seed();
    await assertFails(setDoc(prepRef(as('les')), invitation()));
    await assertFails(setDoc(prepRef(as('bob')), invitation()));
    // Ikke med svar, innsending eller signatur fra den ansatte.
    await assertFails(setDoc(prepRef(as('hr')), invitation({ answers: { r1: 'Falsk' } })));
    await assertFails(setDoc(prepRef(as('hr')), invitation({ status: 'submitted', submittedAt: '2026-03-10' })));
    await assertFails(setDoc(prepRef(as('hr')), invitation({ employeeSignature: { name: 'Bob', uid: 'bob' } })));
    await assertSucceeds(setDoc(prepRef(as('hr')), invitation()));
  });

  test('den ansatte skriver aldri selv (det går gjennom serveren)', async () => {
    await seed(invitation());
    await assertFails(updateDoc(prepRef(as('bob')), { answers: { r1: 'Kurs' } }));
    await assertFails(updateDoc(prepRef(as('bob')), { status: 'signed', employeeSignature: { name: 'Bob', uid: 'bob' } }));
    await assertFails(deleteDoc(prepRef(as('bob'))));
  });

  test('HR sender til signering og trekker tilbake, men endrer ikke svarene', async () => {
    const submitted = invitation({ answers: { r1: 'Kurs' }, status: 'submitted', submittedAt: '2026-03-10T10:00:00Z' });
    await seed(submitted);
    const db = as('hr');
    await assertFails(setDoc(prepRef(db), { ...submitted, answers: { r1: 'Endret' } }));
    await assertFails(setDoc(prepRef(db), { ...submitted, status: 'sent', submittedAt: '' }));
    await assertFails(setDoc(prepRef(db), { ...submitted, status: 'signed' }));
    await assertFails(setDoc(prepRef(db), { ...submitted, comment: 'Skrevet av HR' }));
    await assertSucceeds(setDoc(prepRef(db), { ...submitted, meetingTime: '10:00' }));
    const signing = { ...submitted, status: 'signing', signing: { doc: { id: 'dok1' }, requestedAt: '2026-03-12' } };
    await assertSucceeds(setDoc(prepRef(db), signing));
    // Tilbake til «sendt» når den ansatte har sendt inn, går ikke; «mottatt» går.
    await assertFails(setDoc(prepRef(db), { ...submitted, status: 'sent' }));
    await assertSucceeds(setDoc(prepRef(db), submitted));
  });

  test('signert samtale er låst for HR', async () => {
    await seed(invitation({ status: 'signed', employeeSignature: { name: 'Bob', uid: 'bob' } }));
    await assertFails(updateDoc(prepRef(as('hr')), { status: 'signing', employeeSignature: null }));
    await assertFails(updateDoc(prepRef(as('own')), { meetingTime: '11:00' }));
    // Sletting (når skjemaet slettes) går.
    await assertSucceeds(deleteDoc(prepRef(as('hr'))));
  });
});
