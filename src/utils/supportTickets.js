/**
 * Support tickets — in-app mailbox between user and ProTop support.
 * Path: users/{uid}/supportTickets/{ticketId}
 *        users/{uid}/supportTickets/{ticketId}/messages/{msgId}
 *
 * Ticket creation / AI analysis go through callables so admin inbox and
 * bug analysis can be written server-side.
 */

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '../../firebase';

export const TICKET_STATUSES = {
  open: 'open',
  pending: 'pending',
  answered: 'answered',
  resolved: 'resolved',
  closed: 'closed',
};

export function supportTicketsCol(uid) {
  return collection(db, 'users', uid, 'supportTickets');
}

export function supportTicketDoc(uid, ticketId) {
  return doc(db, 'users', uid, 'supportTickets', ticketId);
}

export function supportMessagesCol(uid, ticketId) {
  return collection(db, 'users', uid, 'supportTickets', ticketId, 'messages');
}

export function listenSupportTickets(uid, onChange) {
  if (!uid) return () => {};
  return onSnapshot(supportTicketsCol(uid), (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const at = a.updatedAtMs || a.updatedAt?.toMillis?.() || 0;
      const bt = b.updatedAtMs || b.updatedAt?.toMillis?.() || 0;
      return bt - at;
    });
    onChange(items);
  }, () => onChange([]));
}

export function listenSupportMessages(uid, ticketId, onChange) {
  if (!uid || !ticketId) return () => {};
  const qy = query(supportMessagesCol(uid, ticketId), orderBy('createdAt', 'asc'));
  return onSnapshot(qy, (snap) => {
    onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => onChange([]));
}

/**
 * Create ticket via callable (assigns ticket number, mirrors to admin inbox,
 * optional bug analysis for error/white-screen reports).
 * Falls back to a local Firestore ticket if the callable is not deployed yet.
 */
export async function createSupportTicket(payload) {
  try {
    const fn = httpsCallable(functions, 'createSupportTicket');
    const res = await fn(payload);
    if (res?.data?.ticketId) return res.data;
  } catch {
    // fall through — local create until functions are deployed
  }
  return createSupportTicketLocal(payload);
}

async function createSupportTicketLocal(payload) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Du må være innlogget.');
  const title = String(payload?.title || '').trim();
  const body = String(payload?.body || '').trim();
  if (!title || !body) throw new Error('Fyll ut tittel og beskrivelse.');

  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const ticketNumber = `WP-${y}${m}${day}-${rand}`;
  const contactEmail = String(payload?.contactEmail || '').trim() || null;
  const category = String(payload?.category || (looksLikeBugReport(`${title} ${body}`) ? 'bug' : 'question'));

  const ref = await addDoc(supportTicketsCol(uid), {
    ticketNumber,
    title,
    body,
    preview: body.slice(0, 120),
    status: TICKET_STATUSES.open,
    category,
    channel: contactEmail ? 'email+internal' : 'internal',
    contactEmail,
    audience: payload?.audience || 'parent',
    device: payload?.device || 'phone',
    lang: payload?.lang || 'nb',
    familyId: payload?.familyId || null,
    attachmentUrls: payload?.attachmentUrls || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    createdBy: uid,
    localFallback: true,
  });
  await addDoc(supportMessagesCol(uid, ref.id), {
    role: 'user',
    text: body,
    attachmentUrl: (payload?.attachmentUrls || [])[0] || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  await addDoc(supportMessagesCol(uid, ref.id), {
    role: 'system',
    text: `Takk — saken din ${ticketNumber} er registrert i hjelpe-postkassen.`,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  return { ticketId: ref.id, ticketNumber, channel: contactEmail ? 'email+internal' : 'internal', category };
}

export async function askSupportBot(payload) {
  const fn = httpsCallable(functions, 'aiSupportChat');
  const res = await fn(payload);
  return res?.data || null;
}

export async function appendTicketUserMessage(uid, ticketId, { text, attachmentUrl } = {}) {
  const trimmed = String(text || '').trim();
  if (!uid || !ticketId || (!trimmed && !attachmentUrl)) return null;
  await addDoc(supportMessagesCol(uid, ticketId), {
    role: 'user',
    text: trimmed,
    attachmentUrl: attachmentUrl || null,
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  });
  await updateDoc(supportTicketDoc(uid, ticketId), {
    updatedAt: serverTimestamp(),
    updatedAtMs: Date.now(),
    status: TICKET_STATUSES.pending,
    preview: trimmed.slice(0, 120),
  });
  return true;
}

export function statusLabel(status, lang = 'nb') {
  const map = {
    open: { nb: 'Åpen', en: 'Open' },
    pending: { nb: 'Venter', en: 'Pending' },
    answered: { nb: 'Svar mottatt', en: 'Answered' },
    resolved: { nb: 'Løst', en: 'Resolved' },
    closed: { nb: 'Lukket', en: 'Closed' },
  };
  const row = map[status] || map.open;
  return row[lang] || row.nb;
}

export function looksLikeBugReport(text = '') {
  const q = String(text).toLowerCase();
  return /feil|bug|error|crash|krasj|hvit skjerm|white screen|blank|500|404|fungerer ikke|virker ikke|broken|exception|stack/.test(q);
}
