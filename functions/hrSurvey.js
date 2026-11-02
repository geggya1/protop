/**
 * Avslutter en medarbeiderundersøkelse (src/hr/survey.js). Bare serveren kan avslutte, så
 * anonymiteten ikke hviler på appen:
 *  - De rå svarene (hrSurveyAnswers/{surveyId}_{uid}) leses av ingen andre enn serveren.
 *  - Her samles de i tilfeldig rekkefølge, uten id og tidspunkt, i hrSurveyResults/{surveyId}.
 *    Under SURVEY_MIN_ANSWERS svar lagres bare antallet.
 *  - De rå svarene slettes, og undersøkelsen settes til avsluttet. Den kan ikke åpnes igjen
 *    (firestore.rules).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomInt } from 'node:crypto';
import { SURVEY_MIN_ANSWERS } from '../src/hr/survey.js';
import { assertCompanyAccess, assertRateLimit, hashRateKey, requireAuth } from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

/** Fisher–Yates med kryptografisk tilfeldighet. */
export function shuffled(list) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Bare verdiene og kommentaren tas med. */
function cleanAnswer(row) {
  const answers = {};
  for (const [key, value] of Object.entries(row?.answers || {})) {
    const v = Number(value);
    if (/^[a-z0-9_]{1,40}$/i.test(key) && v >= 1 && v <= 5 && Number.isInteger(v)) answers[key] = v;
  }
  return { answers, comment: text(row?.comment, 1500) };
}

/**
 * Avslutt undersøkelsen og skriv resultatet. Svar: { ok, count, ready }.
 * store kan byttes i tester.
 */
export async function closeSurvey(store, { familyId, surveyId, now = new Date() }) {
  const surveyRef = store.doc(`families/${familyId}/hrSurveys/${surveyId}`);
  const snap = await surveyRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Fant ikke undersøkelsen.');
  const status = snap.data()?.status;
  const resultRef = store.doc(`families/${familyId}/hrSurveyResults/${surveyId}`);
  if (status === 'closed') {
    // Avbrutt avslutning (lukket, men uten resultat): kjør resten på nytt.
    if ((await resultRef.get()).exists) throw new HttpsError('failed-precondition', 'Undersøkelsen er allerede avsluttet.');
  } else if (status !== 'open') {
    throw new HttpsError('failed-precondition', 'Bare en åpen undersøkelse kan avsluttes.');
  } else {
    // Steng først, så ingen svar kommer inn mens svarene samles (reglene krever status open).
    await surveyRef.update({ status: 'closed', closedAt: now.toISOString() });
  }

  const raw = await store.collection(`families/${familyId}/hrSurveyAnswers`).where('surveyId', '==', surveyId).get();
  const answers = raw.docs.map((row) => cleanAnswer(row.data())).filter((row) => Object.keys(row.answers).length);
  const count = answers.length;
  const ready = count >= SURVEY_MIN_ANSWERS;
  await resultRef.set({
    surveyId,
    count,
    ready,
    answers: ready ? shuffled(answers) : [],
    closedAt: now.toISOString(),
    createdAt: FieldValue.serverTimestamp(),
  });
  // Rå svar, telleren og kvitteringer fra første versjon slettes. Ingen kan senere se hvem som svarte.
  const receipts = await store.collection(`families/${familyId}/hrSurveyReceipts`).where('surveyId', '==', surveyId).get();
  const refs = [
    ...raw.docs.map((row) => row.ref),
    ...receipts.docs.map((row) => row.ref),
    store.doc(`families/${familyId}/hrSurveyStats/${surveyId}`),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = store.batch();
    refs.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
  return { ok: true, count, ready };
}

export const closeHrSurvey = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const familyId = text(req.data?.familyId, 120);
  const surveyId = text(req.data?.surveyId, 120);
  if (!familyId || familyId.includes('/') || !surveyId || surveyId.includes('/')) {
    throw new HttpsError('invalid-argument', 'Mangler bedrift eller undersøkelse.');
  }
  await assertRateLimit(db, { key: hashRateKey(['hr-survey-close', uid]), limit: 30, windowMs: 60 * 60 * 1000 });
  // HR → Oppfølging med Begrenset redigering, som reglene (surveyWriter).
  await assertCompanyAccess(db, familyId, uid, {
    resource: 'hrFollowup',
    action: 'read',
    message: 'Du har ikke tilgang til å avslutte undersøkelsen.',
  });
  return closeSurvey(db, { familyId, surveyId });
});
