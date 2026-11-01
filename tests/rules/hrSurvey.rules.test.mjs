/**
 * Anonym medarbeiderundersøkelse (src/hr/survey.js), kjørt mot Firestore-emulatoren:
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test --test-concurrency=1 tests/rules/hrSurvey.rules.test.mjs"
 *
 * own = eier, hr = HR-ansvarlig (skriv), bob og eve = ansatte, ext = bruker i et annet selskap.
 */
import { after, before, beforeEach, describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';

const A = 'companyA';
const FUTURE = Timestamp.fromMillis(Date.now() + 6 * 3600 * 1000);
const hrSurface = (rank) => ({
  hr: rank, hrPeople: rank, hrAgreements: rank, hrPayroll: rank, hrFollowup: rank, hrCompliance: rank, hrRecruitment: rank,
});
const ansatt = { employees: 'see', absence: 'read', hours: 'read', iso: 'see' };
const ACL = {
  hr: { levelId: 'ansatt', employeeId: 'emp_hr', grants: { ...ansatt, ...hrSurface('write') } },
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
    const members = ['own', 'hr', 'bob', 'eve'];
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
    await setDoc(doc(db, 'families', A, 'hrSurveys', 'mu_closed'), { ...survey('closed'), id: 'mu_closed' });
  });
}

function answerBatch(db, uid, surveyId = 'mu1', answer = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', A, 'hrSurveyReceipts', `${surveyId}_${uid}`), { surveyId, uid });
  batch.set(doc(collection(db, 'families', A, 'hrSurveyAnswers')), { surveyId, answers: { trivsel: 4 }, comment: '', ...answer });
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
  test('alle i bedriften leser undersøkelsen, bare HR lager og endrer den', async () => {
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'hrSurveys', 'mu1')));
    await assertSucceeds(getDocs(query(collection(as('bob'), 'families', A, 'hrSurveys'), where('status', '==', 'open'))));
    await assertFails(getDoc(doc(as('ext'), 'families', A, 'hrSurveys', 'mu1')));
    await assertFails(setDoc(doc(as('bob'), 'families', A, 'hrSurveys', 'mu2'), survey('draft')));
    await assertSucceeds(setDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu2'), survey('draft')));
    await assertSucceeds(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu1'), { status: 'closed' }));
  });

  test('en avsluttet undersøkelse kan ikke åpnes igjen', async () => {
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_closed'), { status: 'open' }));
    await assertSucceeds(updateDoc(doc(as('hr'), 'families', A, 'hrSurveys', 'mu_closed'), { title: 'Ny tittel' }));
  });

  test('den ansatte svarer én gang, med kvittering, og ser ikke svarene', async () => {
    await assertSucceeds(answerBatch(as('bob'), 'bob'));
    await assertFails(answerBatch(as('bob'), 'bob'));
    await assertSucceeds(getDoc(doc(as('bob'), 'families', A, 'hrSurveyReceipts', 'mu1_bob')));
    await assertFails(getDocs(collection(as('bob'), 'families', A, 'hrSurveyAnswers')));
    await assertFails(getDoc(doc(as('eve'), 'families', A, 'hrSurveyReceipts', 'mu1_bob')));
  });

  test('svar uten kvittering, med bruker-id eller til en lukket undersøkelse avvises', async () => {
    await assertFails(setDoc(doc(collection(as('bob'), 'families', A, 'hrSurveyAnswers')), { surveyId: 'mu1', answers: { trivsel: 4 }, comment: '' }));
    await assertFails(answerBatch(as('bob'), 'bob', 'mu1', { uid: 'bob' }));
    await assertFails(answerBatch(as('bob'), 'bob', 'mu_closed'));
    // Kvittering i en annens navn.
    const db = as('bob');
    const batch = writeBatch(db);
    batch.set(doc(db, 'families', A, 'hrSurveyReceipts', 'mu1_eve'), { surveyId: 'mu1', uid: 'eve' });
    batch.set(doc(collection(db, 'families', A, 'hrSurveyAnswers')), { surveyId: 'mu1', answers: { trivsel: 1 }, comment: '' });
    await assertFails(batch.commit());
    await assertFails(answerBatch(as('ext'), 'ext'));
  });

  test('HR leser svar og kvitteringer, men kan ikke endre et svar', async () => {
    await answerBatch(as('bob'), 'bob');
    const snap = await assertSucceeds(getDocs(query(collection(as('hr'), 'families', A, 'hrSurveyAnswers'), where('surveyId', '==', 'mu1'))));
    await assertSucceeds(getDocs(query(collection(as('hr'), 'families', A, 'hrSurveyReceipts'), where('surveyId', '==', 'mu1'))));
    await assertFails(updateDoc(doc(as('hr'), 'families', A, 'hrSurveyAnswers', snap.docs[0].id), { answers: { trivsel: 1 } }));
  });
});
