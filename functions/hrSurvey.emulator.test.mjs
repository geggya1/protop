/**
 * Avslutning av medarbeiderundersøkelsen (closeHrSurvey): bare HR → Oppfølging kan avslutte,
 * resultatet har svarene uten id og i tilfeldig rekkefølge, under fem svar lagres bare antallet,
 * og de rå svarene slettes.
 *
 *   npx firebase emulators:exec --only firestore --config firebase.rules.json --project demo-protop \
 *     "node --test functions/hrSurvey.emulator.test.mjs"
 */
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

process.env.GCLOUD_PROJECT ||= 'demo-protop';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';

const { getFirestore } = await import('firebase-admin/firestore');
const { closeHrSurvey } = await import('./hrSurvey.js');

const db = getFirestore();
const A = 'companyA';
const S = 'mu_2026';

function call(uid, data) {
  return closeHrSurvey.run({
    data,
    auth: { uid, token: { email: `${uid}@firma.no`, email_verified: true } },
    rawRequest: { headers: {}, ip: '127.0.0.1' },
  });
}

async function seed(answers) {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`,
    { method: 'DELETE' },
  );
  assert.ok(res.ok);
  await db.doc(`families/${A}`).set({
    name: 'Bygg AS', type: 'organization', ownerUid: 'own', adminUids: ['own'],
    members: ['own', 'hr', 'rek', 'per'],
    company: {
      navn: 'Bygg AS',
      accessPolicy: { version: 1, actionsVersion: 2, levels: { avdelingsleder: { hrFollowup: 'write' }, tilbud: { hrRecruitment: 'write', hrFollowup: 'none' } } },
    },
  });
  await db.doc(`families/${A}/employees/emp-hr`).set({ personUid: 'hr', person: { firstName: 'Hanne' }, company: { accessLevel: 'avdelingsleder', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-rek`).set({ personUid: 'rek', person: { firstName: 'Rune' }, company: { accessLevel: 'tilbud', status: 'active' } });
  await db.doc(`families/${A}/employees/emp-per`).set({ personUid: 'per', person: { firstName: 'Per' }, company: { accessLevel: 'ansatt', status: 'active' } });
  await db.doc(`families/${A}/hrSurveys/${S}`).set({ id: S, title: 'Medarbeiderundersøkelse 2026', status: 'open', questions: [{ id: 'trivsel', text: 'Jeg trives.' }] });
  await db.doc(`families/${A}/hrSurveyStats/${S}`).set({ count: answers });
  for (let i = 0; i < answers; i += 1) {
    await db.doc(`families/${A}/hrSurveyAnswers/${S}_u${i}`).set({ surveyId: S, answers: { trivsel: (i % 5) + 1, rot: 9 }, comment: i === 0 ? 'Bra' : '' });
  }
  // Kvittering fra første versjon slettes ved avslutning.
  await db.doc(`families/${A}/hrSurveyReceipts/${S}_u0`).set({ surveyId: S, uid: 'u0' });
  // Et svar til en annen undersøkelse skal ikke røres.
  await db.doc(`families/${A}/hrSurveyAnswers/annen_u1`).set({ surveyId: 'annen', answers: { trivsel: 3 }, comment: '' });
}

test('ansatte og HR uten Oppfølging kan ikke avslutte', async () => {
  await seed(6);
  await assert.rejects(call('per', { familyId: A, surveyId: S }), (err) => err.code === 'permission-denied');
  await assert.rejects(call('rek', { familyId: A, surveyId: S }), (err) => err.code === 'permission-denied');
  await assert.rejects(call('fremmed', { familyId: A, surveyId: S }), (err) => err.code === 'permission-denied');
  assert.equal((await db.doc(`families/${A}/hrSurveys/${S}`).get()).data().status, 'open');
});

test('HR avslutter: resultat uten id og tidspunkt, rå svar og teller slettes', async () => {
  await seed(6);
  const res = await call('hr', { familyId: A, surveyId: S });
  assert.deepEqual(res, { ok: true, count: 6, ready: true });
  const survey = (await db.doc(`families/${A}/hrSurveys/${S}`).get()).data();
  assert.equal(survey.status, 'closed');
  assert.ok(survey.closedAt);
  const result = (await db.doc(`families/${A}/hrSurveyResults/${S}`).get()).data();
  assert.equal(result.count, 6);
  assert.equal(result.ready, true);
  assert.equal(result.answers.length, 6);
  for (const row of result.answers) {
    assert.deepEqual(Object.keys(row).sort(), ['answers', 'comment']);
    assert.deepEqual(Object.keys(row.answers), ['trivsel'], 'bare gyldige svar');
  }
  assert.equal(JSON.stringify(result).includes('_u'), false, 'ingen spor av bruker-id');
  const raw = await db.collection(`families/${A}/hrSurveyAnswers`).get();
  assert.deepEqual(raw.docs.map((d) => d.id), ['annen_u1']);
  assert.equal((await db.doc(`families/${A}/hrSurveyStats/${S}`).get()).exists, false);
  assert.equal((await db.collection(`families/${A}/hrSurveyReceipts`).get()).size, 0);
  // En avsluttet undersøkelse kan ikke avsluttes på nytt.
  await assert.rejects(call('hr', { familyId: A, surveyId: S }), (err) => err.code === 'failed-precondition');
});

test('under fem svar lagres bare antallet', async () => {
  await seed(3);
  const res = await call('own', { familyId: A, surveyId: S });
  assert.deepEqual(res, { ok: true, count: 3, ready: false });
  const result = (await db.doc(`families/${A}/hrSurveyResults/${S}`).get()).data();
  assert.deepEqual(result.answers, []);
  assert.equal(result.count, 3);
});

test('avbrutt avslutning (lukket uten resultat) kan kjøres på nytt', async () => {
  await seed(5);
  await db.doc(`families/${A}/hrSurveys/${S}`).update({ status: 'closed', closedAt: '2026-11-02T06:00:00.000Z' });
  const res = await call('hr', { familyId: A, surveyId: S });
  assert.deepEqual(res, { ok: true, count: 5, ready: true });
  assert.equal((await db.collection(`families/${A}/hrSurveyAnswers`).where('surveyId', '==', S).get()).size, 0);
});

test('et utkast kan ikke avsluttes', async () => {
  await seed(0);
  await db.doc(`families/${A}/hrSurveys/${S}`).update({ status: 'draft' });
  await assert.rejects(call('hr', { familyId: A, surveyId: S }), (err) => err.code === 'failed-precondition');
});
