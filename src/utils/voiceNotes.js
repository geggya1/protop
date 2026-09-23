import {
  addDoc, collection, doc, onSnapshot, updateDoc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';
import { db } from '../../firebase';

export function voiceNotesCol(uid) {
  return collection(db, 'users', uid, 'voiceNotes');
}

export function voiceNoteDoc(uid, noteId) {
  return doc(db, 'users', uid, 'voiceNotes', noteId);
}

export function listenVoiceNotes(uid, cb) {
  if (!uid) return () => {};
  const q = query(voiceNotesCol(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => !n.deleted));
  }, () => cb([]));
}

export function listenVoiceNote(uid, noteId, cb) {
  if (!uid || !noteId) return () => {};
  return onSnapshot(voiceNoteDoc(uid, noteId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => cb(null));
}

export async function createVoiceNote(uid, data) {
  const ref = await addDoc(voiceNotesCol(uid), {
    title: data.title || 'Nytt notat',
    transcript: data.transcript || '',
    summary: data.summary || '',
    keyPoints: data.keyPoints || [],
    segments: data.segments || [],
    durationMs: data.durationMs || 0,
    audioUrl: data.audioUrl || null,
    status: data.status || 'draft',
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateVoiceNote(uid, noteId, patch) {
  await updateDoc(voiceNoteDoc(uid, noteId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveVoiceNote(uid, noteId) {
  await updateVoiceNote(uid, noteId, { deleted: true });
}

export function formatDuration(ms) {
  const sec = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (sec < 60) return `${sec} sek`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m} min ${s} sek` : `${m} min`;
}

export function formatNoteDate(ts) {
  if (!ts) return '';
  const ms = ts?.toMillis?.() || ts?.createdAtMs || 0;
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString('no-NO', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function titleFromTranscript(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Nytt lydnotat';
  const first = t.split(/[.!?]/)[0] || t;
  return first.length > 48 ? `${first.slice(0, 46)}…` : first;
}
