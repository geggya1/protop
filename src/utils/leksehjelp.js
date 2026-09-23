import { Platform } from 'react-native';
import { pickPlanImage, uploadTempPlanImage, compressImageBlob } from './aiImport';
import { HOMEWORK_SUBJECTS } from './homeworkModel';
import { guardedCallable } from './guardedCallable';

export const SUBJECTS = HOMEWORK_SUBJECTS;

export const DIFFICULTY_LABELS = {
  lett: 'Lett',
  middels: 'Middels',
  vanskelig: 'Litt vanskelig',
};

/**
 * @param {object} params
 * @param {string} params.familyId
 * @param {string} params.childId
 * @param {string} [params.childName]
 * @param {number|null} [params.childAge]
 * @param {string} [params.subject]
 * @param {string} [params.message]
 * @param {'start'|'reply'|'hint'|'stuck'|'check'|'reveal'} [params.action]
 * @param {number} [params.hintLevel]
 * @param {Array<{role:string,text:string}>} [params.history]
 * @param {string|null} [params.storagePath]
 * @param {string|null} [params.imageBase64]
 * @param {boolean} [params.revealRequested]
 * @param {boolean} [params.allowFasit]
 * @param {number} [params.attemptCount]
 */
export async function askLeksehjelp(params) {
  return guardedCallable('aiTutor', {
    familyId: params.familyId,
    childId: params.childId,
    childName: params.childName || null,
    childAge: params.childAge ?? null,
    subject: params.subject || null,
    message: params.message || '',
    action: params.action || 'reply',
    hintLevel: params.hintLevel || 0,
    history: (params.history || []).slice(-10),
    storagePath: params.storagePath || null,
    imageBase64: params.imageBase64 || null,
    revealRequested: params.revealRequested === true,
    allowFasit: params.allowFasit !== false,
    attemptCount: Number(params.attemptCount) || 0,
  }, { timeout: 75000 });
}

export async function pickHomeworkImage({ camera = false } = {}) {
  return pickPlanImage({ camera });
}

export async function prepareHomeworkImage(familyId, uid, blob) {
  if (Platform.OS === 'web' && blob) {
    blob = await compressImageBlob(blob);
  }
  return uploadTempPlanImage(familyId, uid, blob);
}
