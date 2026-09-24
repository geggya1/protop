import {
  collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { mapRewardGoalData, validateGoalDraft } from './rewardGoalsLogic.js';

export {
  parseRewardLink,
  rewardLinkHost,
  acceptRewardImageUrl,
  formatStarCount,
  mapMilestone,
  mapRewardGoalData,
  isMilestoneClaimed,
  goalsForChild,
  goalProgress,
  starsRemaining,
  motivationFor,
  lifetimeStarsFromTodos,
  validateGoalDraft,
} from './rewardGoalsLogic.js';

/**
 * Langsiktige stjernemål / opptjeningsmål.
 *
 * families/{familyId}/rewardGoals/{goalId}
 *   title, emoji, description?, imageUrl?, imagePath?, linkUrl?
 *   childIds: string[]
 *   shared: boolean   // true = poeng fra alle childIds summeres; false = hvert barn for seg
 *   milestones: [{
 *     id, points, title, emoji, description?, imageUrl?, imagePath?, linkUrl?,
 *     claimedAt?, claimedBy?, claimedForChildId?, claims?
 *   }]
 *   status: 'active' | 'archived'
 */

export function rewardGoalsCol(familyId) {
  return collection(db, 'families', familyId, 'rewardGoals');
}

export function rewardGoalDoc(familyId, goalId) {
  return doc(db, 'families', familyId, 'rewardGoals', goalId);
}

export function mapRewardGoal(snap) {
  return mapRewardGoalData(snap.id, snap.data() || {});
}

export function listenRewardGoals(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(rewardGoalsCol(familyId), (snap) => {
    const list = snap.docs.map(mapRewardGoal)
      .filter((g) => g.status === 'active')
      .sort((a, b) => String(a.title).localeCompare(String(b.title), 'nb'));
    cb(list);
  }, () => cb([]));
}

export function newMilestoneId() {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function saveRewardGoal(familyId, goalId, payload, uid) {
  if (!familyId) throw new Error('Mangler familyId');
  const checked = validateGoalDraft(payload);
  if (!checked.ok) {
    throw new Error(checked.errors[0]?.message || 'Ugyldig mål');
  }
  const ref = goalId
    ? rewardGoalDoc(familyId, goalId)
    : doc(rewardGoalsCol(familyId));
  const body = {
    ...checked.value,
    milestones: checked.value.milestones.map((m) => ({
      ...m,
      id: m.id || newMilestoneId(),
    })),
    status: payload?.status === 'archived' ? 'archived' : 'active',
    updatedAt: serverTimestamp(),
  };
  if (!goalId) {
    body.createdAt = serverTimestamp();
    body.createdBy = uid || null;
  }
  await setDoc(ref, body, { merge: true });
  return ref.id;
}

export async function archiveRewardGoal(familyId, goalId) {
  if (!familyId || !goalId) return;
  await updateDoc(rewardGoalDoc(familyId, goalId), {
    status: 'archived',
    updatedAt: serverTimestamp(),
  });
}

export async function deleteRewardGoal(familyId, goalId) {
  if (!familyId || !goalId) return;
  await deleteDoc(rewardGoalDoc(familyId, goalId));
}

/** Marker et nivå som innløst (delt = hele gruppen; individuelt = per barn). */
export async function claimMilestone(familyId, goal, milestoneId, {
  uid, childId = null,
} = {}) {
  if (!familyId || !goal?.id || !milestoneId) return;
  const stamp = new Date().toISOString();
  const milestones = (goal.milestones || []).map((m) => {
    if (m.id !== milestoneId) return m;
    if (goal.shared) {
      return {
        ...m,
        claimedAt: stamp,
        claimedBy: uid || null,
        claimedForChildId: childId || null,
      };
    }
    const claims = { ...(m.claims || {}) };
    if (childId) {
      claims[childId] = { claimedAt: stamp, claimedBy: uid || null };
    }
    return { ...m, claims };
  });
  await updateDoc(rewardGoalDoc(familyId, goal.id), {
    milestones,
    updatedAt: serverTimestamp(),
  });
}
