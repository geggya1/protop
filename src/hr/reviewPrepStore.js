/**
 * Medarbeidersamtalen i Firestore: families/{id}/hrReviewPrep/{dokument-id}. Se reviewPrep.js.
 * HR skriver invitasjonen og sender til signering. Den ansatte leser sin egen, og forberedelse og
 * signatur går gjennom serveren (hrReviewAction i functions/hrReview.js).
 */
import {
  collection, deleteDoc, doc, onSnapshot, query, setDoc, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { PREP_COLLECTION, normalizePrep } from './reviewPrep.js';

function cid(companyId) {
  return String(companyId || '').trim();
}

/** Firestore godtar ikke undefined. */
function plain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function prepRef(companyId, docId) {
  return doc(db, 'families', cid(companyId), PREP_COLLECTION, String(docId));
}

/** Følg én samtale (HR, mens skjemaet er åpent). cb(prep | null). Returnerer avmelding. */
export function watchPrep(companyId, docId, cb) {
  if (!cid(companyId) || !docId) {
    cb(null);
    return () => {};
  }
  return onSnapshot(
    prepRef(companyId, docId),
    (snap) => cb(snap.exists() ? normalizePrep({ ...snap.data(), docId: snap.id }) : null),
    (err) => {
      console.warn('hrReviewPrep watch failed', err?.code || err?.message);
      cb(null);
    },
  );
}

/** Den ansattes egne samtaler, nyeste først. cb(list). */
export function watchMyPreps(companyId, uid, cb) {
  if (!cid(companyId) || !uid) {
    cb([]);
    return () => {};
  }
  const q = query(collection(db, 'families', cid(companyId), PREP_COLLECTION), where('employeeUid', '==', uid));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs
      .map((row) => normalizePrep({ ...row.data(), docId: row.id }))
      .filter(Boolean)
      .sort((a, b) => String(b.meetingDate || b.sentAt).localeCompare(String(a.meetingDate || a.sentAt)))),
    (err) => {
      console.warn('hrReviewPrep list failed', err?.code || err?.message);
      cb([]);
    },
  );
}

/** HR: invitasjon, sending til signering og tilbaketrekking. */
export async function savePrep(companyId, prep) {
  const next = normalizePrep(prep);
  if (!cid(companyId) || !next) throw new Error('Samtalen mangler.');
  await setDoc(prepRef(companyId, next.docId), plain(next));
  return next;
}

export async function deletePrep(companyId, docId) {
  if (!cid(companyId) || !docId) return;
  try {
    await deleteDoc(prepRef(companyId, docId));
  } catch (err) {
    console.warn('hrReviewPrep delete failed', err?.code || err?.message);
  }
}

function friendly(err) {
  const msg = String(err?.message || '').replace(/^.*?:\s*/, '');
  return msg && !/internal/i.test(msg) ? msg : 'Fikk ikke kontakt med serveren. Prøv igjen.';
}

/**
 * Den ansatte: action 'save' | 'submit' | 'sign'. HR: 'resend'.
 * Svar: { ok, prep } eller { ok: false, error }.
 */
export async function reviewAction(companyId, docId, action, payload = {}) {
  try {
    const call = httpsCallable(functions, 'hrReviewAction', { timeout: 90000 });
    const res = await call({ familyId: cid(companyId), docId, action, ...payload });
    const prep = normalizePrep(res.data?.prep);
    return { ok: true, prep };
  } catch (err) {
    return { ok: false, error: friendly(err) };
  }
}
