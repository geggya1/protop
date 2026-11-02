/**
 * Anonym medarbeiderundersøkelse (src/hr/survey.js), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/hrSurvey.rules.test.mjs"
 *
 * own = eier, hr = HR-ansvarlig (skriv), rek = bare Rekruttering, bob og eve = ansatte, ext = bruker i et annet selskap.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, deleteDoc, doc, getDoc, getDocs, increment, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
const hrSurface = (rank) => ({
  hr: rank, hrPeople: rank, hrAgreements: rank, hrPayroll: rank, hrFollowup: rank, hrCompliance: rank, hrRecruitment: rank,
});
const ansatt = { employees: 'see', absence: 'read', hours: 'read', iso: 'see' };
const ACL = {
  hr: { levelId: 'ansatt', employeeId: 'emp_hr', grants: { ...ansatt, ...hrSurface('write') } },
  rek: { levelId: 'ansatt', employeeId: 'emp_rek', grants: { ...ansatt, hr: 'read', hrRecruitment: 'write' } },
  bob: { levelId: 'ansatt', employeeId: 'emp_bob', grants: ansatt },
  eve: { levelId: 'ansatt', employeeId: 'emp_eve', grants: ansatt },
};

let env;
const as = (uid) => env.authenticatedContext(uid).firestore();
const survey = (status) => ({ id: 'mu1', title: 'Medarbeiderundersøkelse 2026', status, questions: [{ id: 'trivsel', text: 'Jeg trives.' }] });

async function seed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const members = ['own', 'hr', 'rek', 'bob', 'eve'];
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
    await setDoc(doc(db, 'families', 'companyB'), { name: 'Annet AS', type: 'company', ownerUid: 'ext', members: ['ext'] });
    await setDoc(doc(db, 'families', A, 'hrSurveys', 'mu1'), survey('open'));
    await setDoc(doc(db, 'families', A, 'hrSurveyStats', 'mu1'), { count: 0 });
    await setDoc(doc(db, 'families', A, 'hrSurveys', 'mu_draft'), { ...survey('draft'), id: 'mu_draft' });
    await setDoc(doc(db, 'families', A, 'hrSurveys', 'mu_closed'), { ...survey('closed'), id: 'mu_closed' });
    await setDoc(doc(db, 'families', A, 'hrSurveyResults', 'mu_closed'), { count: 6, ready: true, answers: [] });
    // Åpnet med første versjon: uten teller, og med en gammel kvittering.
    await setDoc(doc(db, 'families', A, 'hrSurveys', 'mu_old'), { ...survey('open'), id: 'mu_old' });
    await setDoc(doc(db, 'families', A, 'hrSurveyReceipts', 'mu_old_eve'), { surveyId: 'mu_old', uid: 'eve' });
  });
}

function answer(db, uid, surveyId = 'mu1', extra = {}, { count = true } = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', A, 'hrSurveyAnswers', `${surveyId}_${uid}`), { surveyId, answers: { trivsel: 4 }, comment: '', ...extra });
  // Som appen: merge, så telleren lages om den mangler.
  if (count) batch.set(doc(db, 'families', A, 'hrSurveyStats', surveyId), { count: increment(1) }, { merge: true });
  return batch.commit();
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-protop',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
after(async () => { await env?.cleanup(); });
beforeEach(seed);

describe('Medarbeiderundersøkelse', () => {
  test('alle leser undersøkelsen; bare HR → Oppfølging lager den, og bare som utkast', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'hrSurveys', 'mu1')));
    await assertSucceeds(getDocs(query(collection(as('bob'), 'families', A, 'hrSurveys'), where('status', '==', 'open'))));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'hrSurveys', 'mu1')));
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'hrSurveys', 'mu2'), survey('draft')));
    await assertFails(setDoc(doc(as('rek'), 'families', A, 'hrSurveys', 'mu2'), survey('draft')), 'Rekruttering er ikke Oppfølging');
    await assertSucceeds(setDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu2'), survey('draft')));
    await assertFails(setDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu3'), survey('open')), 'ny må være utkast');
  });

  test('utkast kan åpnes; åpen kan ikke tilbake til utkast, få nye spørsmål eller avsluttes av appen', async () => {
    await assertSucceeds(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_draft'), { status: 'open' }));
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu1'), { status: 'draft' }));
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu1'), { status: 'closed' }));
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu1'), { questions: [{ id: 'x', text: 'Nytt' }] }));
    await assertSucceeds(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu1'), { title: 'Ny tittel' }));
  });

  test('en avsluttet undersøkelse kan ikke endres, slettes eller lages på nytt som åpen', async () => {
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_closed'), { status: 'open' }));
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_closed'), { title: 'Ny' }));
    await assertFails(deleteDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_closed')));
    await assertFails(deleteDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu1')), 'åpen kan ikke slettes');
    await assertSucceeds(deleteDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_draft')));
  });

  test('den ansatte svarer én gang, og telleren øker', async () => {
    await assertSucceeds(answer(as('bob'), 'bob'));
    await assertFails(answer(as('bob'), 'bob'), 'andre svar');
    await assertFails(answer(as('bob'), 'bob', 'mu1', {}, { count: false }), 'heller ikke uten teller');
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'hrSurveyAnswers', 'mu1_bob')));
    await assertSucceeds(answer(as('eve'), 'eve'));
    const stats = await assertSucceeds(getDoc(doc(as('hr'), 'families', A, 'hrSurveyStats', 'mu1')));
    if (stats.data().count !== 2) throw new Error(`teller ${stats.data().count}`);
  });

  test('ingen leser andres svar: ikke HR, ikke kolleger, ikke liste', async () => {
    await answer(as('bob'), 'bob');
    await assertFails(getDoc(doc(as('hr'), 'families', A, 'hrSurveyAnswers', 'mu1_bob')));
    await assertFails(getDoc(doc(as('own'), 'families', A, 'hrSurveyAnswers', 'mu1_bob')));
    await assertFails(getDoc(doc(as('eve'), 'families', A, 'hrSurveyAnswers', 'mu1_bob')));
    await assertFails(getDocs(collection(as('hr'), 'families', A, 'hrSurveyAnswers')));
    await assertFails(getDocs(query(collection(as('hr'), 'families', A, 'hrSurveyAnswers'), where('surveyId', '==', 'mu1'))));
  });

  test('svar i en annens navn, med ekstra felt, til lukket undersøkelse eller fra utenforstående avvises', async () => {
    const db = as('bob');
    await assertFails(setDoc(doc(db, 'families', A, 'hrSurveyAnswers', 'mu1_eve'), { surveyId: 'mu1', answers: { trivsel: 1 }, comment: '' }));
    await assertFails(answer(as('bob'), 'bob', 'mu1', { uid: 'bob' }));
    await assertFails(answer(as('bob'), 'bob', 'mu_closed', {}, { count: false }));
    await assertFails(answer(as('bob'), 'bob', 'mu_draft', {}, { count: false }));
    await assertFails(answer(as('ext'), 'ext'));
  });

  test('telleren kan ikke økes uten et nytt eget svar, og ikke settes fritt', async () => {
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'hrSurveyStats', 'mu1'), { count: increment(1) }));
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveyStats', 'mu1'), { count: 40 }));
    await answer(as('bob'), 'bob');
    await assertFails(updateDoc(doc(as('bob'), 'families', A, 'hrSurveyStats', 'mu1'), { count: increment(1) }));
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'hrSurveyStats', 'mu1')), 'bare HR ser telleren');
  });

  test('undersøkelse åpnet før telleren fantes: første svar lager den med 1', async () => {
    await assertSucceeds(answer(as('bob'), 'bob', 'mu_old'));
    const stats = await assertSucceeds(getDoc(doc(as('hr'), 'families', A, 'hrSurveyStats', 'mu_old')));
    if (stats.data().count !== 1) throw new Error(`teller ${stats.data().count}`);
    await assertSucceeds(answer(as('eve'), 'eve', 'mu_old'));
    // Uten eget nytt svar kan ingen lage telleren med 1.
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'hrSurveyStats', 'mu_new'), { count: 1 }));
  });

  test('kvitteringer fra første versjon kan verken leses eller skrives', async () => {
    for (const uid of ['bob', 'eve', 'hr', 'own']) {
      await assertFails(getDoc(doc(as(uid), 'families', A, 'hrSurveyReceipts', 'mu_old_eve')));
      await assertFails(getDocs(collection(as(uid), 'families', A, 'hrSurveyReceipts')));
    }
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'hrSurveyReceipts', 'x'), { surveyId: 'mu1', uid: 'bob' }));
  });

  test('resultatet leses bare av HR → Oppfølging, og skrives bare av serveren', async () => {
    await assertSucceeds(getDoc(doc(as('hr'), 'families', A, 'hrSurveyResults', 'mu_closed')));
    await assertFails(getDoc(doc(as('rek'), 'families', A, 'hrSurveyResults', 'mu_closed')));
    await assertFails(getDoc(doc(as('bob'), 'families', A, 'hrSurveyResults', 'mu_closed')));
    await assertFails(setDoc(doc(as('hr'), 'families', A, 'hrSurveyResults', 'mu1'), { count: 9, ready: true, answers: [] }));
    await assertFails(getDoc(doc(as('rek'), 'families', A, 'hrSurveyStats', 'mu1')));
  });
});
