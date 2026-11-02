/**
 * Medarbeiderundersøkelsen i Firestore. Se survey.js og functions/hrSurvey.js.
 *   families/{id}/hrSurveys/{surveyId}              undersøkelsen (alle leser, HR → Oppfølging skriver)
 *   families/{id}/hrSurveyAnswers/{surveyId}_{uid}   rå svar, én per person; bare personen selv leser sitt
 *   families/{id}/hrSurveyStats/{surveyId}           antall svar mens den er åpen (HR leser)
 *   families/{id}/hrSurveyResults/{surveyId}         resultatet, skrevet av serveren ved avslutning (HR leser)
 * Bare serveren avslutter (closeHrSurvey): den samler svarene i tilfeldig rekkefølge uten id og
 * tidspunkt, og sletter de rå svarene.
 */
import {
  collection, doc, getDoc, getDocs, increment, query, where, writeBatch,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { normalizeSurvey, receiptId, surveyAnswerDoc } from './survey.js';

function cid(companyId) {
  return String(companyId || '').trim();
}

function col(companyId, name) {
  return collection(db, 'families', cid(companyId), name);
}

function ref(companyId, name, id) {
  return doc(db, 'families', cid(companyId), name, id);
}

/** Alle undersøkelser (HR). Nyeste først. */
export async function loadSurveys(companyId) {
  if (!cid(companyId)) return [];
  const snap = await getDocs(col(companyId, 'hrSurveys'));
  return snap.docs.map((row) => normalizeSurvey({ ...row.data(), id: row.id }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Åpne undersøkelser (den ansatte på Min side). */
export async function loadOpenSurveys(companyId) {
  if (!cid(companyId)) return [];
  const snap = await getDocs(query(col(companyId, 'hrSurveys'), where('status', '==', 'open')));
  return snap.docs.map((row) => normalizeSurvey({ ...row.data(), id: row.id }));
}

/** Lagre et utkast. Status settes ikke her (se openSurvey og closeSurvey). */
export async function saveSurvey(companyId, survey) {
  const s = normalizeSurvey(survey);
  if (!cid(companyId) || !s.id) throw new Error('Mangler undersøkelse.');
  if (s.status !== 'draft') throw new Error('Bare utkast kan endres.');
  const batch = writeBatch(db);
  batch.set(ref(companyId, 'hrSurveys', s.id), s);
  await batch.commit();
  return s;
}

/** Åpne for svar: undersøkelsen og telleren (0) i samme skriving. */
export async function openSurvey(companyId, survey, { now = new Date() } = {}) {
  const s = normalizeSurvey(survey);
  if (s.status !== 'draft') throw new Error('Undersøkelsen er allerede åpnet.');
  const batch = writeBatch(db);
  batch.set(ref(companyId, 'hrSurveys', s.id), { ...s, status: 'open', openedAt: now.toISOString() });
  batch.set(ref(companyId, 'hrSurveyStats', s.id), { count: 0 });
  await batch.commit();
}

/** Avslutt (serveren). Svar: { ok, count, ready }. */
export async function closeSurvey(companyId, surveyId) {
  const res = await httpsCallable(functions, 'closeHrSurvey', { timeout: 60000 })({ familyId: cid(companyId), surveyId });
  return res.data || { ok: false };
}

/** Har personen svart? Personen kan lese sitt eget svar (og ingen andres). */
export async function hasAnswered(companyId, surveyId, uid) {
  if (!cid(companyId) || !surveyId || !uid) return false;
  try {
    const snap = await getDoc(ref(companyId, 'hrSurveyAnswers', receiptId(surveyId, uid)));
    return snap.exists();
  } catch {
    return false;
  }
}

/** Svaret og telleren i samme skriving. Reglene avviser et nytt svar fra samme person. */
export async function submitSurveyAnswer(companyId, survey, uid, values, comment) {
  const answer = surveyAnswerDoc(survey, values, comment);
  if (!answer) throw new Error('Svar på minst ett spørsmål.');
  if (!cid(companyId) || !uid) throw new Error('Ikke innlogget.');
  const batch = writeBatch(db);
  batch.set(ref(companyId, 'hrSurveyAnswers', receiptId(answer.surveyId, uid)), answer);
  // merge: lager telleren med 1 om den mangler (undersøkelse åpnet før telleren fantes).
  batch.set(ref(companyId, 'hrSurveyStats', answer.surveyId), { count: increment(1) }, { merge: true });
  await batch.commit();
  return true;
}

/** Antall svar mens undersøkelsen er åpen (HR). */
export async function countSurveyAnswers(companyId, surveyId) {
  if (!cid(companyId) || !surveyId) return 0;
  const snap = await getDoc(ref(companyId, 'hrSurveyStats', surveyId));
  return snap.exists() ? Number(snap.data()?.count) || 0 : 0;
}

/**
 * Resultatet etter avslutning (HR): { count, ready, answers } der answers er i tilfeldig
 * rekkefølge og uten id. null før serveren har skrevet det.
 */
export async function loadSurveyResult(companyId, surveyId) {
  if (!cid(companyId) || !surveyId) return null;
  const snap = await getDoc(ref(companyId, 'hrSurveyResults', surveyId));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  return {
    count: Number(data.count) || 0,
    ready: data.ready === true,
    answers: (Array.isArray(data.answers) ? data.answers : []).map((row) => ({ ...row, surveyId })),
  };
}
