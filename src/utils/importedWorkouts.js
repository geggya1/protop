/**
 * Importerte turer/økter (GPX, TCX, Strava) lagret per bruker.
 * Path: users/{uid}/importedWorkouts/{id}
 */

import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  limit,
} from 'firebase/firestore';
import { db } from '../../firebase';

export function importedWorkoutsCol(uid) {
  return collection(db, 'users', uid, 'importedWorkouts');
}

export function listenImportedWorkouts(uid, cb, max = 50) {
  if (!uid) {
    cb([]);
    return () => {};
  }
  const q = query(importedWorkoutsCol(uid), orderBy('createdAt', 'desc'), limit(max));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      cb(rows);
    },
    () => cb([]),
  );
}

/**
 * Lagrer en normalisert workout. Track nedskaleres i gpxImport.
 * Unngår å lagre enorme polylines — max ~400 punkter fra parser.
 */
export async function saveImportedWorkout(uid, workout, source = 'gpx') {
  if (!uid || !workout) throw new Error('Mangler bruker eller turdata.');
  const track = Array.isArray(workout.track) ? workout.track.slice(0, 400) : [];
  const payload = {
    title: String(workout.title || 'Importert tur').slice(0, 120),
    type: workout.type || 'tur',
    source,
    sourceFormat: workout.sourceFormat || null,
    sourceFile: workout.sourceFile || null,
    externalId: workout.externalId || null,
    startedAt: workout.startedAt || null,
    durationSec: workout.durationSec ?? null,
    distanceM: workout.distanceM ?? null,
    elevationGainM: workout.elevationGainM ?? null,
    calories: workout.calories ?? null,
    avgHr: workout.avgHr ?? null,
    maxHr: workout.maxHr ?? null,
    weightKg: workout.weightKg ?? null,
    track,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(importedWorkoutsCol(uid), payload);
  return ref.id;
}

export async function deleteImportedWorkout(uid, id) {
  if (!uid || !id) return;
  await deleteDoc(doc(db, 'users', uid, 'importedWorkouts', id));
}

/** Summer helse-/treningsmål fra importerte økter. */
export function summarizeImportedHealth(workouts = []) {
  let distanceM = 0;
  let calories = 0;
  let durationSec = 0;
  let elevationGainM = 0;
  let count = 0;
  let lastWeightKg = null;
  for (const w of workouts) {
    count += 1;
    if (Number.isFinite(w.distanceM)) distanceM += w.distanceM;
    if (Number.isFinite(w.calories)) calories += w.calories;
    if (Number.isFinite(w.durationSec)) durationSec += w.durationSec;
    if (Number.isFinite(w.elevationGainM)) elevationGainM += w.elevationGainM;
    if (Number.isFinite(w.weightKg)) lastWeightKg = w.weightKg;
  }
  return {
    count,
    distanceM: Math.round(distanceM),
    calories: Math.round(calories),
    durationSec: Math.round(durationSec),
    elevationGainM: Math.round(elevationGainM),
    lastWeightKg,
  };
}
