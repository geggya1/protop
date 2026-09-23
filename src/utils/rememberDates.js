/**
 * Husk dato — bursdager fra familiemedlemmer + egne nedtellinger i Firestore.
 */

import {
  collection, doc, addDoc, updateDoc,
  onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  assertRememberInput,
  emptyRememberForm,
  buildUpcomingList,
  availableHolidayPresets,
  HOLIDAY_PRESETS,
  formatCountdown,
  formatNextDateLabel,
  formatRememberSubtitle,
  REMEMBER_KINDS,
  EMOJI_CHOICES,
} from './rememberDatesLogic.js';

export {
  emptyRememberForm,
  buildUpcomingList,
  availableHolidayPresets,
  HOLIDAY_PRESETS,
  formatCountdown,
  formatNextDateLabel,
  formatRememberSubtitle,
  REMEMBER_KINDS,
  EMOJI_CHOICES,
  assertRememberInput,
};

function eventsCol(familyId) {
  return collection(db, 'families', familyId, 'rememberDates');
}

function eventDoc(familyId, eventId) {
  return doc(db, 'families', familyId, 'rememberDates', eventId);
}

function mapDoc(d) {
  return { id: d.id, ...(d.data() || {}) };
}

export function listenRememberDates(familyId, cb) {
  if (!familyId) return () => {};
  return onSnapshot(
    eventsCol(familyId),
    (snap) => {
      const rows = snap.docs
        .map(mapDoc)
        .filter((e) => e.deleted !== true)
        .sort((a, b) => {
          const ta = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
          const tb = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
          return tb - ta;
        });
      cb(rows);
    },
    () => cb([]),
  );
}

export async function createRememberDate(familyId, uid, data) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const payload = assertRememberInput(data);
  return addDoc(eventsCol(familyId), {
    ...payload,
    memberId: data.memberId || null,
    memberUid: data.memberUid || null,
    createdBy: uid,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateRememberDate(familyId, eventId, patch) {
  if (!familyId || !eventId) throw new Error('Mangler hendelse.');
  const next = { updatedAt: serverTimestamp() };

  if (
    patch.title != null
    || patch.dateKey != null
    || patch.yearly != null
    || patch.emoji != null
    || patch.kind != null
    || patch.note != null
    || patch.presetKey != null
  ) {
    const payload = assertRememberInput({
      title: patch.title,
      dateKey: patch.dateKey,
      yearly: patch.yearly,
      emoji: patch.emoji,
      kind: patch.kind,
      note: patch.note,
      presetKey: patch.presetKey,
    });
    Object.assign(next, payload);
  }

  await updateDoc(eventDoc(familyId, eventId), next);
}

export async function deleteRememberDate(familyId, eventId) {
  if (!familyId || !eventId) throw new Error('Mangler hendelse.');
  await updateDoc(eventDoc(familyId, eventId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
}

export async function addHolidayPreset(familyId, uid, presetKey) {
  const preset = HOLIDAY_PRESETS.find((p) => p.key === presetKey);
  if (!preset) throw new Error('Ukjent merkedag.');
  const year = new Date().getFullYear();
  const dateKey = `${year}-${String(preset.month).padStart(2, '0')}-${String(preset.day).padStart(2, '0')}`;
  return createRememberDate(familyId, uid, {
    title: preset.title,
    emoji: preset.emoji,
    dateKey,
    yearly: true,
    kind: REMEMBER_KINDS.holiday,
    presetKey: preset.key,
    note: preset.note || '',
  });
}
