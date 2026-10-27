import {
  collection, doc, setDoc, updateDoc, getDocs,
  onSnapshot, serverTimestamp, query, where, runTransaction,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { voiceNotesCol, voiceNoteDoc } from './voiceNotes';
import {
  canMigrateVoiceNotesInto, familyNoteFromVoiceNote, migratedVoiceNoteId, voiceNoteNeedsMigration,
} from './notesLogic.js';

export function notesCol(familyId) {
  return collection(db, 'families', familyId, 'notes');
}

export function noteDoc(familyId, noteId) {
  return doc(db, 'families', familyId, 'notes', noteId);
}

export function listenAccessibleNotes(familyId, uid, { includeArchived = false } = {}, cb) {
  if (!familyId || !uid) return () => {};
  const q = query(notesCol(familyId), where('memberIds', 'array-contains', uid));
  return onSnapshot(q, (snap) => {
    const notes = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((n) => !n.deleted && !n.permanentlyDeleted)
      .filter((n) => includeArchived || !n.archived)
      .sort((a, b) => {
        const ta = a.updatedAt?.toMillis?.() || a.updatedAt?.seconds || 0;
        const tb = b.updatedAt?.toMillis?.() || b.updatedAt?.seconds || 0;
        return tb - ta;
      });
    cb(notes);
  }, () => cb([]));
}

export function listenNote(familyId, noteId, cb) {
  if (!familyId || !noteId) return () => {};
  return onSnapshot(noteDoc(familyId, noteId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => cb(null));
}

/**
 * Start opprettelsen og få id-en med en gang. write løses først når serveren har svart,
 * så offline kan skjermen åpne notatet før skrivingen er bekreftet.
 */
export function startCreateNote(familyId, uid, title, creatorName, profileUid = null, extra = {}) {
  const memberIds = profileUid && profileUid !== uid
    ? [...new Set([uid, profileUid])]
    : [uid];
  const ref = doc(notesCol(familyId));
  const write = setDoc(ref, {
    title: String(title || '').trim() || 'Uten tittel',
    body: extra.body || '',
    bodyFormat: 'markdown',
    createdBy: uid,
    createdByName: creatorName || '',
    memberIds,
    visibility: memberIds.length <= 1 ? 'private' : 'shared',
    archived: false,
    deleted: false,
    source: extra.source || 'text',
    transcript: extra.transcript || '',
    summary: extra.summary || '',
    keyPoints: extra.keyPoints || [],
    durationMs: extra.durationMs || 0,
    voiceNoteId: extra.voiceNoteId || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { ref, write };
}

export async function createNote(familyId, uid, title, creatorName, profileUid = null, extra = {}) {
  const { ref, write } = startCreateNote(familyId, uid, title, creatorName, profileUid, extra);
  await write;
  return ref;
}

/**
 * Flytt gamle AI-lydnotater (users/{uid}/voiceNotes) inn i notatene til et personlig
 * arbeidsområde. Aldri inn i en bedrift: talenotatene er private.
 * Idempotent: fast notat-id per talenotat, og notatet og markøren på talenotatet
 * skrives i samme transaksjon. To samtidige kjøringer gir ikke duplikater.
 */
export async function migrateVoiceNotesIntoFamily(familyId, uid, creatorName, { groupType } = {}) {
  if (!familyId || !uid) return 0;
  if (!canMigrateVoiceNotesInto(groupType)) return 0;
  const snap = await getDocs(voiceNotesCol(uid));
  let moved = 0;
  for (const d of snap.docs) {
    const vn = { id: d.id, ...d.data() };
    if (!voiceNoteNeedsMigration(vn)) continue;
    const noteId = migratedVoiceNoteId(vn.id);
    const voiceRef = voiceNoteDoc(uid, vn.id);
    const done = await runTransaction(db, async (tx) => {
      const fresh = await tx.get(voiceRef);
      if (!fresh.exists() || !voiceNoteNeedsMigration({ id: fresh.id, ...fresh.data() })) return false;
      tx.set(noteDoc(familyId, noteId), {
        ...familyNoteFromVoiceNote({ id: fresh.id, ...fresh.data() }, uid, creatorName),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      tx.update(voiceRef, {
        migratedToFamilyNoteId: noteId,
        migratedToFamilyId: familyId,
        deleted: true,
        updatedAt: serverTimestamp(),
      });
      return true;
    });
    if (done) moved += 1;
  }
  return moved;
}

export async function updateNote(familyId, noteId, patch) {
  await updateDoc(noteDoc(familyId, noteId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveNote(familyId, noteId, archived = true) {
  await updateNote(familyId, noteId, { archived });
}

export async function deleteNote(familyId, noteId) {
  await updateNote(familyId, noteId, {
    deleted: true,
    archived: true,
    permanentlyDeleted: true,
  });
}

export async function setNoteMembers(familyId, noteId, memberIds, visibility) {
  const ids = [...new Set(memberIds.filter(Boolean))];
  await updateNote(familyId, noteId, {
    memberIds: ids,
    visibility: ids.length <= 1 ? 'private' : (visibility || 'shared'),
  });
}

export function canManageNote(note, uid, isAdmin) {
  if (!note || !uid) return false;
  return note.createdBy === uid || isAdmin;
}

export function isPrivateNote(note) {
  return !note || note.visibility === 'private' || (note.memberIds || []).length <= 1;
}

/** Notat synlig på en persons profil: egne (inkl. private) eller delt med den personen. */
export function noteVisibleOnProfile(note, profileUid) {
  if (!note || !profileUid) return true;
  const ids = note.memberIds || [];
  if (!ids.includes(profileUid)) return false;
  if (note.createdBy === profileUid) return true;
  return !isPrivateNote(note);
}

export function filterNotesForProfile(notes, profileUid) {
  if (!profileUid) return notes;
  return notes.filter((n) => noteVisibleOnProfile(n, profileUid));
}

export function memberSummary(note, members) {
  const ids = note?.memberIds || [];
  if (ids.length <= 1) return 'Privat';
  const names = ids
    .map((id) => members.find((m) => m.uid === id)?.name)
    .filter(Boolean)
    .slice(0, 3);
  return names.length ? names.join(', ') : `${ids.length} medlemmer`;
}

export function notePreview(body, maxLen = 80) {
  const plain = String(body || '')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  if (!plain) return 'Tomt notat';
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}
