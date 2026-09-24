/**
 * Fremgang for Mattehjelpen — stjerner per skill/topic.
 * families/{familyId}/children/{childId}/mattehjelpProgress/{docId}
 */
import {
  doc, getDoc, setDoc, serverTimestamp, collection, getDocs, query, limit,
} from 'firebase/firestore';
import { db } from '../../../firebase';

function summaryRef(familyId, childId) {
  return doc(db, 'families', familyId, 'children', childId, 'mattehjelpProgress', '_summary');
}

function skillRef(familyId, childId, skillId) {
  return doc(db, 'families', familyId, 'children', childId, 'mattehjelpProgress', `skill_${skillId}`);
}

export async function loadMattehjelpSummary(familyId, childId) {
  if (!familyId || !childId) return null;
  try {
    const snap = await getDoc(summaryRef(familyId, childId));
    return snap.exists() ? snap.data() : null;
  } catch {
    return null;
  }
}

/**
 * Registrer fullført runde / oppdrag.
 */
export async function recordMattehjelpProgress({
  familyId,
  childId,
  topicId,
  skill,
  subject,
  starsEarned = 1,
  correct = true,
  mode = 'lek',
} = {}) {
  if (!familyId || !childId) return null;
  const summary = summaryRef(familyId, childId);
  const skillId = skill || topicId || 'general';
  const sRef = skillRef(familyId, childId, skillId);

  try {
    const [sumSnap, skillSnap] = await Promise.all([getDoc(summary), getDoc(sRef)]);
    const prev = sumSnap.exists() ? sumSnap.data() : {};
    const prevSkill = skillSnap.exists() ? skillSnap.data() : {};

    const stars = (Number(prev.stars) || 0) + (correct ? Number(starsEarned) || 1 : 0);
    const missions = (Number(prev.missionsCompleted) || 0) + (correct ? 1 : 0);
    const attempts = (Number(prev.attempts) || 0) + 1;

    await Promise.all([
      setDoc(summary, {
        stars,
        missionsCompleted: missions,
        attempts,
        lastSubject: subject || prev.lastSubject || null,
        lastTopicId: topicId || prev.lastTopicId || null,
        lastMode: mode,
        updatedAt: serverTimestamp(),
        createdAt: prev.createdAt || serverTimestamp(),
      }, { merge: true }),
      setDoc(sRef, {
        skill: skillId,
        subject: subject || prevSkill.subject || null,
        topicId: topicId || prevSkill.topicId || null,
        stars: (Number(prevSkill.stars) || 0) + (correct ? Number(starsEarned) || 1 : 0),
        correctCount: (Number(prevSkill.correctCount) || 0) + (correct ? 1 : 0),
        attemptCount: (Number(prevSkill.attemptCount) || 0) + 1,
        updatedAt: serverTimestamp(),
      }, { merge: true }),
    ]);

    return { stars, missionsCompleted: missions };
  } catch (err) {
    console.warn('mattehjelp progress', err?.message || err);
    return null;
  }
}

export async function listSkillProgress(familyId, childId, max = 20) {
  if (!familyId || !childId) return [];
  try {
    const col = collection(db, 'families', familyId, 'children', childId, 'mattehjelpProgress');
    const snap = await getDocs(query(col, limit(max)));
    return snap.docs
      .filter((d) => d.id.startsWith('skill_'))
      .map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/** Lokal (optimistic) stjerne-teller når Firestore er treg / offline. */
export function bumpLocalStars(prev, earned = 1) {
  return (Number(prev) || 0) + (Number(earned) || 0);
}
