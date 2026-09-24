import {
  addDoc, collection, doc, getDocs, query, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';

export const EVENT_MODULE = {
  messageReceived: 'chat',
  taskReceived: 'stars',
  choreReceived: 'chores',
  eventCreated: 'plan',
  noteShared: 'notes',
  wishReserved: 'wishes',
  wishPurchased: 'wishes',
  wishShared: 'wishes',
  familyInvite: 'members',
  familyInviteAccepted: 'members',
  familyInviteDeclined: 'members',
  friendInvite: 'friends',
  friendInviteAccepted: 'friends',
  gameInvite: 'games',
  locationGeofence: 'location',
  wallPost: 'wall',
  attestPending: 'progress',
  birthdayReminder: 'rememberDates',
  boligReminder: 'boligmappa',
};

export const EVENT_LABELS = {
  messageReceived: 'Melding',
  taskReceived: 'Oppgave',
  choreReceived: 'Gjøremål',
  eventCreated: 'Kalender',
  noteShared: 'Notat',
  wishReserved: 'Gaveønske',
  wishPurchased: 'Gaveønske',
  wishShared: 'Gaveønske',
  familyInvite: 'Invitasjon',
  familyInviteAccepted: 'Invitasjon',
  familyInviteDeclined: 'Invitasjon',
  friendInvite: 'Venneforespørsel',
  friendInviteAccepted: 'Venn',
  gameInvite: 'Spillinvitasjon',
  locationGeofence: 'Posisjon',
  wallPost: 'Familievegg',
  attestPending: 'Attestering',
  birthdayReminder: 'Bursdag',
  boligReminder: 'Boligen',
};

const NAV_MODULE = {
  Leksehjelp: 'leksehjelp',
  Lekser: 'lekser',
  ChildSchedule: 'week-plan',
  FamilyProgress: 'progress',
  EventForm: 'plan',
};

const MORE_MODULE_IDS = [
  'shop', 'lekser', 'wishes', 'books', 'activities',
  'location', 'documents', 'meals', 'pantry', 'albums', 'holdings', 'boligmappa', 'wall',
  'childDrawings',
  'week-plan', 'hospitality', 'games', 'progress',
  'scratchMap', 'reiseplanlegger', 'familyTree', 'rememberDates',
];

export function moduleForNotification(n) {
  return EVENT_MODULE[n?.eventType] || null;
}

export function badgeLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  if (n > 99) return '99+';
  return String(n);
}

export function summarizeUnread(items) {
  const counts = {};
  const byChat = {};
  let total = 0;
  for (const n of items || []) {
    if (n?.seen === true) continue;
    total += 1;
    const mod = moduleForNotification(n);
    if (mod) counts[mod] = (counts[mod] || 0) + 1;
    if (n.eventType === 'messageReceived' && n.chatId) {
      byChat[n.chatId] = (byChat[n.chatId] || 0) + 1;
    }
  }
  return { total, counts, byChat };
}

export function countForModule(counts, moduleId) {
  if (!moduleId || !counts) return 0;
  return Number(counts[moduleId]) || 0;
}

export function countForAction(counts, action) {
  if (!action) return 0;
  if (action.type === 'tab') {
    if (action.tab === 'more') return countForModule(counts, action.subView);
    return countForModule(counts, action.tab);
  }
  if (action.type === 'nav') {
    return countForModule(counts, NAV_MODULE[action.screen] || null);
  }
  return 0;
}

export function countForItem(counts, item) {
  if (!item) return 0;
  return countForModule(counts, item.id) || countForAction(counts, item.action);
}

/** Aktivitet (i dag) og ulest inbox — ta det høyeste per modul.
 * For barn er åpne gjøremål/oppgaver sannheten for stars/chores —
 * gamle inbox-varsler skal ikke blåse opp badge når lista er tom.
 */
export function mergeBadgeCounts(unreadCounts, activityCounts, { asChild = false } = {}) {
  const out = { ...(activityCounts || {}) };
  Object.entries(unreadCounts || {}).forEach(([key, value]) => {
    if (asChild && (key === 'stars' || key === 'chores')) return;
    out[key] = Math.max(Number(out[key]) || 0, Number(value) || 0);
  });
  out.more = MORE_MODULE_IDS.reduce((sum, id) => sum + (Number(out[id]) || 0), 0);
  return out;
}

function omitUndefined(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value !== undefined) out[key] = value;
  });
  return out;
}

export async function notifyUsers(toUids, payload = {}) {
  const createdBy = payload.createdBy || null;
  const unique = [...new Set((toUids || []).filter((id) => id && id !== createdBy))];
  if (!unique.length) {
    console.warn('[weekplan-notif] notifyUsers skipped — no recipients', {
      eventType: payload.eventType,
      notificationId: payload.notificationId || null,
    });
    return { notified: 0, failed: 0 };
  }
  const docPayload = omitUndefined({
    eventType: payload.eventType || 'messageReceived',
    title: payload.title || 'Varsel',
    body: payload.body || '',
    familyId: payload.familyId || null,
    chatId: payload.chatId || null,
    // Required so recipient opens friendChats/{chatId}, not families/.../chats.
    friendChat: payload.friendChat === true ? true : undefined,
    friendUid: payload.friendUid || (payload.friendChat ? createdBy : undefined) || undefined,
    inviteId: payload.inviteId || null,
    gameId: payload.gameId || null,
    gameType: payload.gameType || null,
    childId: payload.childId || null,
    memberId: payload.memberId || null,
    todoId: payload.todoId || null,
    dateKey: payload.dateKey || null,
    createdAt: serverTimestamp(),
    seen: false,
    createdBy,
  });

  const writeOne = async (toUid) => {
    const fixedId = payload.notificationId ? String(payload.notificationId) : null;
    if (fixedId) {
      try {
        await setDoc(doc(db, 'users', toUid, 'notifications', fixedId), docPayload);
        return { toUid, ok: true, mode: 'set' };
      } catch (err) {
        const code = String(err?.code || '');
        // Cross-user setDoc on an existing doc is an update → permission-denied.
        // Treat as already delivered (create succeeded earlier / CF backup).
        if (code.includes('permission-denied') || code.includes('already-exists')) {
          console.warn('[weekplan-notif] notifyUsers existing/skip', {
            toUid, id: fixedId, code, eventType: docPayload.eventType,
          });
          return { toUid, ok: true, mode: 'skip-existing' };
        }
        console.warn('[weekplan-notif] notifyUsers setDoc fail → addDoc', {
          toUid, id: fixedId, code, message: err?.message,
        });
      }
    }
    await addDoc(collection(db, 'users', toUid, 'notifications'), docPayload);
    return { toUid, ok: true, mode: 'add' };
  };

  const results = await Promise.allSettled(unique.map(writeOne));
  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed) {
    results.forEach((r) => {
      if (r.status === 'rejected') {
        console.warn('[weekplan-notif] notifyUsers failed', {
          eventType: docPayload.eventType,
          message: r.reason?.message || r.reason,
          code: r.reason?.code,
        });
      }
    });
  } else {
    console.log('[weekplan-notif] notifyUsers ok', {
      eventType: docPayload.eventType,
      count: unique.length,
      id: payload.notificationId || null,
    });
  }
  return { notified: unique.length - failed, failed };
}

export async function markNotificationsSeen(uid, ids) {
  if (!uid || !ids?.length) return;
  const batch = writeBatch(db);
  const seenAt = serverTimestamp();
  ids.forEach((id) => {
    batch.update(doc(db, 'users', uid, 'notifications', id), { seen: true, seenAt });
  });
  await batch.commit();
}

export async function markChatNotificationsSeen(uid, chatId) {
  if (!uid || !chatId) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'notifications'),
      where('chatId', '==', chatId),
    ));
    const ids = snap.docs.filter((d) => d.data()?.seen !== true).map((d) => d.id);
    await markNotificationsSeen(uid, ids);
  } catch {
    /* ignore */
  }
}

export async function markAttestNotificationsSeen(uid, familyId = null) {
  if (!uid) return;
  try {
    const snap = await getDocs(query(
      collection(db, 'users', uid, 'notifications'),
      where('eventType', '==', 'attestPending'),
    ));
    const ids = snap.docs
      .filter((d) => {
        const data = d.data() || {};
        if (data.seen === true) return false;
        if (familyId && data.familyId && data.familyId !== familyId) return false;
        return true;
      })
      .map((d) => d.id);
    await markNotificationsSeen(uid, ids);
  } catch {
    /* ignore */
  }
}

export async function markNotificationSeen(uid, id) {
  if (!uid || !id) return;
  try {
    await updateDoc(doc(db, 'users', uid, 'notifications', id), {
      seen: true,
      seenAt: serverTimestamp(),
    });
  } catch {
    /* ignore */
  }
}
