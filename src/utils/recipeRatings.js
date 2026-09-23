/**
 * Familievurderinger av oppskrifter (innebygde + egne).
 * families/{familyId}/recipeRatings/{recipeKey}
 */

import {
  collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  recipeRatingKey,
  ratingForRecipe,
  sortRecipesByRating,
  summarizeRatingEntries,
} from './recipeRatingHelpers';

export {
  recipeRatingKey,
  ratingForRecipe,
  sortRecipesByRating,
  summarizeRatingEntries,
};

export function recipeRatingsCol(familyId) {
  return collection(db, 'families', familyId, 'recipeRatings');
}

export function recipeRatingDoc(familyId, recipeKey) {
  return doc(db, 'families', familyId, 'recipeRatings', String(recipeKey));
}

export function listenRecipeRatings(familyId, cb) {
  if (!familyId) {
    cb({});
    return () => {};
  }
  return onSnapshot(recipeRatingsCol(familyId), (snap) => {
    try {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data() || {};
        const entries = data.entries && typeof data.entries === 'object' ? data.entries : {};
        const summary = summarizeRatingEntries(entries);
        map[d.id] = {
          id: d.id,
          entries,
          averageRating: Number(data.averageRating) || summary.averageRating,
          ratingCount: Number(data.ratingCount) || summary.ratingCount,
        };
      });
      cb(map);
    } catch {
      cb({});
    }
  }, () => cb({}));
}

export async function upsertRecipeRating(familyId, recipeKey, {
  uid,
  userName = '',
  stars,
  comment = '',
}) {
  if (!familyId || !recipeKey || !uid) return null;
  const starsClamped = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
  if (!starsClamped) throw new Error('Velg 1–5 stjerner.');

  const ref = recipeRatingDoc(familyId, recipeKey);
  const snap = await getDoc(ref);
  const prev = snap.exists() ? (snap.data() || {}) : {};
  const entries = { ...(prev.entries || {}) };
  entries[uid] = {
    stars: starsClamped,
    comment: String(comment || '').trim().slice(0, 500),
    userName: String(userName || '').trim().slice(0, 80),
    updatedAt: new Date().toISOString(),
  };
  const summary = summarizeRatingEntries(entries);
  await setDoc(ref, {
    recipeKey: String(recipeKey),
    entries,
    averageRating: summary.averageRating,
    ratingCount: summary.ratingCount,
    updatedAt: serverTimestamp(),
    createdAt: prev.createdAt || serverTimestamp(),
  }, { merge: true });
  return { ...summary, entries };
}
