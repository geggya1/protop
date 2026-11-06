/**
 * Lesing og lagring av AI-abonnementet fra appen.
 * Rammene: families/{c}/aiSettings/plan (eier, administrator eller Admin på AI-abonnement).
 * Forbruket: families/{c}/aiLedger/{måned} og /users, som bare serveren skriver.
 *
 * Tilgangen per person styres fra to steder: AI-abonnement i selskapsinnstillingene og
 * Brukerkonto på personsiden. Begge lytter på samme dokument (subscribeAiPlan) og lagrer
 * i en transaksjon som bare legger på sin egen endring. Da viser begge steder alltid samme
 * status, og det ene stedet overskriver ikke det andre.
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { mergeAiPlan, normalizeAiPlan } from './aiPlan';

function planRef(familyId) {
  return doc(db, 'families', familyId, 'aiSettings', 'plan');
}

export async function loadAiPlan(familyId) {
  if (!familyId) return { plan: normalizeAiPlan(null), exists: false };
  const snap = await getDoc(planRef(familyId));
  return { plan: normalizeAiPlan(snap.exists() ? snap.data() : null), exists: snap.exists() };
}

/** Lytt på abonnementet. Svarer med en funksjon som stopper lyttingen. */
export function subscribeAiPlan(familyId, onPlan, onError) {
  if (!familyId) {
    onPlan(normalizeAiPlan(null));
    return () => {};
  }
  return onSnapshot(
    planRef(familyId),
    (snap) => onPlan(normalizeAiPlan(snap.exists() ? snap.data() : null)),
    (err) => onError?.(err),
  );
}

/**
 * Lagre. `settings` er feltene fra selskapsinnstillingene (eller null), `accessChanges`
 * er personene som er slått av eller på. Alt annet beholdes slik det står lagret.
 */
export async function saveAiPlan(familyId, uid, { settings = null, accessChanges = [] } = {}) {
  if (!familyId || !uid) throw new Error('Mangler bedrift eller bruker.');
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(planRef(familyId));
    const next = mergeAiPlan(snap.exists() ? snap.data() : null, settings, accessChanges);
    if (next.enabled && next.monthlyBudgetNok <= 0) {
      throw new Error('Sett et månedsbudsjett før du slår på AI-assistenten.');
    }
    tx.set(planRef(familyId), { ...next, updatedAt: serverTimestamp(), updatedBy: uid });
    return next;
  });
}

/** Gi eller ta AI-tilgang for én person (fra personsiden). */
export function setAiPersonAccess(familyId, actorUid, { uid, external = false }, on) {
  return saveAiPlan(familyId, actorUid, { accessChanges: [{ uid, on, external }] });
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
