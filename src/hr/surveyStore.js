/**
 * Medarbeiderundersøkelsen i Firestore. Se survey.js for hvordan anonymiteten er sikret.
 *   families/{id}/hrSurveys/{surveyId}          undersøkelsen (alle i bedriften leser, HR skriver)
 *   families/{id}/hrSurveyAnswers/{auto-id}     svar uten bruker-id (bare HR leser)
 *   families/{id}/hrSurveyReceipts/{survey_uid} hvem som har svart (egen + HR leser)
 */
import {
  collection, doc, getDoc, getDocs, query, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeSurvey, receiptId, surveyAnswerDoc } from './survey.js';

function cid(companyId) {
  return String(companyId || '').trim();
}

function col(companyId, name) {
  return collection(db, 'families', cid(companyId), name);
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

export async function saveSurvey(companyId, survey) {
  const s = normalizeSurvey(survey);
  if (!cid(companyId) || !s.id) throw new Error('Mangler undersøkelse.');
  await setDoc(doc(db, 'families', cid(companyId), 'hrSurveys', s.id), s);
  return s;
}

export async function hasAnswered(companyId, surveyId, uid) {
  if (!cid(companyId) || !surveyId || !uid) return false;
  try {
    const snap = await getDoc(doc(db, 'families', cid(companyId), 'hrSurveyReceipts', receiptId(surveyId, uid)));
    return snap.exists();
  } catch {
    return false;
  }
}

/** Svar og kvittering i samme skriving. Reglene avviser svar uten ny kvittering. */
export async function submitSurveyAnswer(companyId, survey, uid, values, comment) {
  const answer = surveyAnswerDoc(survey, values, comment);
  if (!answer) throw new Error('Svar på minst ett spørsmål.');
  if (!cid(companyId) || !uid) throw new Error('Ikke innlogget.');
  const batch = writeBatch(db);
  batch.set(doc(db, 'families', cid(companyId), 'hrSurveyReceipts', receiptId(answer.surveyId, uid)), {
    surveyId: answer.surveyId, uid,
  });
  batch.set(doc(col(companyId, 'hrSurveyAnswers')), answer);
  await batch.commit();
  return true;
}

/** Svarene på én undersøkelse (HR). */
export async function loadSurveyAnswers(companyId, surveyId) {
  if (!cid(companyId) || !surveyId) return [];
  const snap = await getDocs(query(col(companyId, 'hrSurveyAnswers'), where('surveyId', '==', surveyId)));
  return snap.docs.map((row) => row.data());
}

/** Antall som har svart (HR), uten å lese svarene. */
export async function countSurveyReceipts(companyId, surveyId) {
  if (!cid(companyId) || !surveyId) return 0;
  const snap = await getDocs(query(col(companyId, 'hrSurveyReceipts'), where('surveyId', '==', surveyId)));
  return snap.size;
}
