import {
  addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp,
  setDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';

/**
 * AI-chatter lagres per bruker:
 * users/{uid}/aiChats/{chatId}
 * users/{uid}/aiChats/{chatId}/messages/{msgId}
 */

export function aiChatsCol(uid) {
  return collection(db, 'users', uid, 'aiChats');
}

export function aiChatDoc(uid, chatId) {
  return doc(db, 'users', uid, 'aiChats', chatId);
}

export function aiMessagesCol(uid, chatId) {
  return collection(db, 'users', uid, 'aiChats', chatId, 'messages');
}

export function titleFromMessage(text) {
  const t = String(text || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Ny AI-chat';
  return t.length > 42 ? `${t.slice(0, 40)}…` : t;
}

/** Enklere lytter uten where — unngår indekskrav. */
export function listenAiChatsSimple(uid, onChange) {
  if (!uid) return () => {};
  return onSnapshot(aiChatsCol(uid), (snap) => {
    const items = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c) => c.archived !== true);
    items.sort((a, b) => {
      const at = a.updatedAt?.toMillis?.() || a.updatedAtMs || 0;
      const bt = b.updatedAt?.toMillis?.() || b.updatedAtMs || 0;
      return bt - at;
    });
    onChange(items.slice(0, 40));
  }, () => onChange([]));
}

export function listenAiMessages(uid, chatId, onChange) {
  if (!uid || !chatId) return () => {};
  const qy = query(aiMessagesCol(uid, chatId), orderBy('createdAt', 'asc'));
  return onSnapshot(qy, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => onChange([]));
}

export async function createAiChat(uid, {
  familyId = '',
  context = 'parent',
  childId = '',
  title = 'Ny AI-chat',
} = {}) {
  const ref = await addDoc(aiChatsCol(uid), {
    familyId,
    context,
    childId: childId || null,
    title,
    preview: '',
    archived: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  });
  return ref.id;
}

export async function appendAiMessage(uid, chatId, { role, text }) {
  const trimmed = String(text || '').trim();
  if (!uid || !chatId || !trimmed) return null;
  const msgRef = await addDoc(aiMessagesCol(uid, chatId), {
    role,
    text: trimmed,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  const patch = {
    preview: trimmed.slice(0, 120),
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
  };
  if (role === 'user') {
    patch.title = titleFromMessage(trimmed);
  }
  await updateDoc(aiChatDoc(uid, chatId), patch).catch(() => {});
  return msgRef.id;
}

export async function ensureGreetingMessage(uid, chatId, text) {
  if (!uid || !chatId || !text) return;
  const ref = doc(db, 'users', uid, 'aiChats', chatId, 'messages', 'greeting');
  const snap = await getDoc(ref);
  if (snap.exists() && String(snap.data()?.text || '') === String(text)) return;
  await setDoc(ref, {
    role: 'assistant',
    text,
    createdAt: snap.exists() ? (snap.data()?.createdAt || serverTimestamp()) : serverTimestamp(),
    createdAtMs: snap.exists() ? (snap.data()?.createdAtMs || Date.now()) : Date.now(),
    isGreeting: true,
  }, { merge: true });
}

export function formatThreadTime(ts) {
  if (!ts) return '';
  const ms = ts?.toMillis?.() || ts?.createdAtMs || (typeof ts === 'number' ? ts : 0);
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'I går';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('no-NO', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: '2-digit' });
}

export function formatMessageStamp(ts) {
  if (!ts) return '';
  const ms = ts?.toMillis?.() || ts?.createdAtMs || (typeof ts === 'number' ? ts : 0);
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleString('no-NO', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
