import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, query, orderBy, limit, getDocs, onSnapshot,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  uniqueMemberIds,
  timestampToMs,
  chatIsUnread,
  hasStoredUnreadCount,
  unreadCountForUser,
  otherDmMemberIds,
  resolveChatRecipients,
  chatVisibleToUser,
  canManageChatMessage,
  chatMessagePreview,
} from './chatsLogic';
import {
  isFirestorePermissionError,
  waitForFirestoreAccess,
  warnPermissionOnce,
} from './firestoreAccess';
import { ensureListedOnFamily } from './familyMembership';

export {
  uniqueMemberIds,
  timestampToMs,
  chatIsUnread,
  hasStoredUnreadCount,
  unreadCountForUser,
  otherDmMemberIds,
  resolveChatRecipients,
  chatVisibleToUser,
  canManageChatMessage,
  chatMessagePreview,
};

/**
 * Live message thread under families/{familyId}/chats/{chatId}/messages.
 * Waits for Auth, retries after permission-denied, and heals missing
 * members[]/activeUsers so LIST rules (isFamilyMemberLite) can succeed.
 * Without this, inbox/push can fire while the thread stays permanently empty.
 */
export function listenChatMessages(familyId, chatId, uid, onData, onDenied) {
  if (!familyId || !chatId) {
    onData?.([]);
    return () => {};
  }

  let cancelled = false;
  let unsub = () => {};
  let attempt = 0;

  const attach = async () => {
    if (cancelled) return;
    if (uid) {
      const ok = await waitForFirestoreAccess(uid);
      if (cancelled) return;
      if (!ok) {
        onDenied?.(null);
        return;
      }
    }
    try { unsub(); } catch { /* ignore */ }
    const qy = query(
      collection(db, 'families', familyId, 'chats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
    );
    unsub = onSnapshot(
      qy,
      (snap) => {
        if (cancelled) return;
        onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      async (err) => {
        if (cancelled) return;
        if (attempt < 2 && isFirestorePermissionError(err)) {
          attempt += 1;
          if (uid) {
            try {
              await ensureListedOnFamily(familyId, uid);
            } catch (healErr) {
              warnPermissionOnce(
                `chat-heal:${familyId}:${uid}`,
                '[chat] ensureListedOnFamily',
                healErr?.code || healErr?.message || healErr,
              );
            }
          }
          try { unsub(); } catch { /* ignore */ }
          unsub = () => {};
          attach();
          return;
        }
        try { unsub(); } catch { /* ignore */ }
        unsub = () => {};
        warnPermissionOnce(
          `chat-msgs:${familyId}:${chatId}:${uid || 'anon'}`,
          '[chat] messages listen failed',
          err?.code || err?.message || err,
        );
        onDenied?.(err || null);
      },
    );
  };

  attach();
  return () => {
    cancelled = true;
    try { unsub(); } catch { /* ignore */ }
  };
}

/** Unngå gjentatt getDoc for samme chat innen samme app-session. */
const ensuredOk = new Map(); // key -> signature

function chatSig(type, title, ids) {
  return `${type}|${title || ''}|${ids.join(',')}`;
}

/**
 * Opprett/oppdater chat-dokument KUN når innhold faktisk mangler eller endres.
 * Tom memberIds-liste får aldri overskrive eksisterende mottakere.
 */
export async function ensureChatDoc(familyId, chatId, {
  type = 'family',
  title = 'Familien',
  memberIds = [],
} = {}) {
  if (!familyId || !chatId) return;
  const ids = uniqueMemberIds(memberIds).sort();
  const want = chatSig(type, title || 'Chat', ids);
  const cacheKey = `${familyId}/${chatId}`;
  if (ensuredOk.get(cacheKey) === want) return;

  const ref = doc(db, 'families', familyId, 'chats', chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const payload = {
      type,
      title: title || 'Chat',
      createdAtMs: Date.now(),
    };
    if (ids.length) payload.memberIds = ids;
    await setDoc(ref, payload);
    ensuredOk.set(cacheKey, want);
    return;
  }
  const data = snap.data() || {};
  const existing = uniqueMemberIds(data.memberIds).sort();
  const nextMembers = ids.length ? ids : existing;
  const sameMembers = existing.length === nextMembers.length
    && existing.every((id, i) => id === nextMembers[i]);
  const sameTitle = String(data.title || '') === String(title || 'Chat');
  const sameType = String(data.type || '') === String(type || '');
  if (sameMembers && sameTitle && sameType) {
    ensuredOk.set(cacheKey, want);
    return;
  }
  const patch = {
    type,
    title: title || data.title || 'Chat',
  };
  if (ids.length) patch.memberIds = ids;
  await setDoc(ref, patch, { merge: true });
  ensuredOk.set(cacheKey, want);
}

export function memberIdsKey(membersOrIds) {
  if (!membersOrIds?.length) return '';
  if (typeof membersOrIds[0] === 'string') {
    return uniqueMemberIds(membersOrIds).sort().join('|');
  }
  return uniqueMemberIds(membersOrIds.map((m) => m?.uid)).sort().join('|');
}

export async function markChatRead(familyId, chatId, uid) {
  if (!familyId || !chatId || !uid) return;
  const ref = doc(db, 'families', familyId, 'chats', chatId);
  const patch = {
    [`reads.${uid}`]: serverTimestamp(),
    [`unreadCounts.${uid}`]: 0,
  };
  try {
    await updateDoc(ref, patch);
  } catch {
    await setDoc(ref, patch, { merge: true });
  }
}

export async function stampChatMessage(familyId, chatId, {
  senderId,
  text,
  memberIds,
  /** Who gets +1 unread. Defaults to memberIds minus sender. Never pass the whole family for a DM. */
  unreadFor,
  messageId,
} = {}) {
  if (!familyId || !chatId) return;
  const ids = uniqueMemberIds(memberIds);
  let bump = uniqueMemberIds(
    unreadFor !== undefined ? unreadFor : ids.filter((id) => id && id !== senderId),
  ).filter((id) => id && id !== senderId);
  if (!bump.length) {
    const dmOthers = otherDmMemberIds(chatId, senderId);
    if (dmOthers.length) {
      bump = dmOthers;
    } else if (ids.length && !String(chatId).startsWith('dm_') && !String(chatId).startsWith('g_')) {
      bump = ids.filter((id) => id && id !== senderId);
    }
  }
  const ref = doc(db, 'families', familyId, 'chats', chatId);

  // Unngå transaction+increment (kan feile stille i web SDK).
  // Les → skriv absolutt tall; idempotent via unreadStampId.
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() || {}) : {};
  if (messageId && existing.unreadStampId === messageId) {
    const patch = {
      lastSenderId: senderId || null,
      lastAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastText: String(text || '').slice(0, 140),
    };
    if (ids.length) patch.memberIds = ids;
    await setDoc(ref, patch, { merge: true });
    return;
  }

  const prevCounts = (
    existing.unreadCounts
    && typeof existing.unreadCounts === 'object'
    && !Array.isArray(existing.unreadCounts)
  ) ? existing.unreadCounts : {};

  const payload = {
    lastSenderId: senderId || null,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastText: String(text || '').slice(0, 140),
  };
  if (messageId) payload.unreadStampId = messageId;
  if (ids.length) payload.memberIds = ids;
  if (senderId) {
    payload[`reads.${senderId}`] = serverTimestamp();
    payload[`unreadCounts.${senderId}`] = 0;
  }
  bump.forEach((id) => {
    payload[`unreadCounts.${id}`] = (Number(prevCounts[id]) || 0) + 1;
  });
  try {
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    // Siste utvei: minst lastSenderId/lastAt slik at mottaker ser ulest via chatIsUnread.
    console.warn('[chat] stampChatMessage setDoc failed', err?.code || err?.message);
    await setDoc(ref, {
      lastSenderId: senderId || null,
      lastAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastText: String(text || '').slice(0, 140),
      ...(messageId ? { unreadStampId: messageId } : {}),
    }, { merge: true });
  }
}

function messageDoc(familyId, chatId, messageId) {
  return doc(db, 'families', familyId, 'chats', chatId, 'messages', messageId);
}

/**
 * Oppdater chat-listens forhåndstekst fra siste ikke-slettede melding.
 * Brukes etter endring/sletting slik at listen ikke viser utdatert preview.
 */
export async function refreshChatPreview(familyId, chatId, { imageFallback = '📷 Bilde' } = {}) {
  if (!familyId || !chatId) return;
  const qy = query(
    collection(db, 'families', familyId, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(40),
  );
  const snap = await getDocs(qy);
  const latest = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((m) => !m.deleted);

  const chatRef = doc(db, 'families', familyId, 'chats', chatId);
  if (!latest) {
    await setDoc(chatRef, {
      lastText: '',
      lastSenderId: null,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return;
  }

  await setDoc(chatRef, {
    lastText: chatMessagePreview(latest, imageFallback).slice(0, 140),
    lastSenderId: latest.senderId || null,
    lastAt: latest.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function updateChatMessage(familyId, chatId, messageId, { text, editedBy } = {}) {
  if (!familyId || !chatId || !messageId) return;
  const trimmed = String(text || '').trim();
  await updateDoc(messageDoc(familyId, chatId, messageId), {
    text: trimmed,
    editedAt: serverTimestamp(),
    editedBy: editedBy || null,
  });
  await refreshChatPreview(familyId, chatId);
}

export async function deleteChatMessage(familyId, chatId, messageId, { deletedBy } = {}) {
  if (!familyId || !chatId || !messageId) return;
  await updateDoc(messageDoc(familyId, chatId, messageId), {
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: deletedBy || null,
    text: '',
    imageUrl: null,
  });
  await refreshChatPreview(familyId, chatId);
}
