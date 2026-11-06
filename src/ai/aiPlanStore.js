/**
 * Lesing og lagring av AI-abonnementet fra appen.
 * Rammene: families/{c}/aiSettings/plan (eier, administrator eller Admin på AI-abonnement).
 * Forbruket: families/{c}/aiLedger/{måned} og /users, som bare serveren skriver.
 */
import {
  collection, doc, getDoc, getDocs, serverTimestamp, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { normalizeAiPlan } from './aiPlan';

export async function loadAiPlan(familyId) {
  if (!familyId) return { plan: normalizeAiPlan(null), exists: false };
  const snap = await getDoc(doc(db, 'families', familyId, 'aiSettings', 'plan'));
  return { plan: normalizeAiPlan(snap.exists() ? snap.data() : null), exists: snap.exists() };
}

export async function saveAiPlan(familyId, uid, plan) {
  if (!familyId || !uid) throw new Error('Mangler bedrift eller bruker.');
  const next = normalizeAiPlan(plan);
  if (next.enabled && next.monthlyBudgetNok <= 0) {
    throw new Error('Sett et månedsbudsjett før du slår på AI-assistenten.');
  }
  await setDoc(doc(db, 'families', familyId, 'aiSettings', 'plan'), {
    ...next,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return next;
}

export async function loadAiUsage(familyId, month) {
  if (!familyId || !month) return { month: null, users: [] };
  const monthRef = doc(db, 'families', familyId, 'aiLedger', month);
  const [monthSnap, usersSnap] = await Promise.all([
    getDoc(monthRef),
    getDocs(collection(monthRef, 'users')),
  ]);
  return {
    month: monthSnap.exists() ? monthSnap.data() : null,
    users: usersSnap.docs.map((row) => ({ id: row.id, ...row.data() })),
  };
}
