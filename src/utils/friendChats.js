/**
 * Peer-to-peer friend DMs — outside family platform.
 * Path: friendChats/{chatId}/messages/{messageId}
 *
 * Web ChatDock used a one-shot onSnapshot that cleared to [] on any error and
 * never recovered. Sends often succeed via Admin while LIST fails (missing chat
 * doc, Auth/App Check race, or rules not yet covering friendChats) — so the
 * thread stayed blank. Mirror family listenChatMessages: wait for Auth, ensure
 * the chat doc, retry, then fall back to Admin polling.
 */
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
  collection, query, orderBy, limit, onSnapshot, addDoc, increment, where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { friendChatId } from './friendsLogic';
import { uniqueMemberIds, unreadCountForUser } from './chatsLogic';
import { notifyUsers } from './notifications';
import {
  isFirestorePermissionError,
  waitForFirestoreAccess,
  warnPermissionOnce,
} from './firestoreAccess';

export { friendChatId };

export async function ensureFriendChatDoc(uidA, uidB, {
  title = '',
  names = {},
} = {}) {
  const chatId = friendChatId(uidA, uidB);
  if (!chatId) return null;
  const memberIds = uniqueMemberIds([uidA, uidB]).sort();
  const ref = doc(db, 'friendChats', chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      type: 'dm',
      title: title || 'Chat',
      memberIds,
      names: names || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });
  } else {
    const data = snap.data() || {};
    const existing = uniqueMemberIds(data.memberIds).sort();
    if (existing.length !== 2 || existing[0] !== memberIds[0] || existing[1] !== memberIds[1]) {
      await updateDoc(ref, { memberIds, updatedAt: serverTimestamp() });
    }
  }
  return chatId;
}

export async function sendFriendChatMessage({
  chatId, senderUid, senderName, text, type = 'text', imageUrl = null, imagePath = null,
}) {
  if (!chatId || !senderUid) throw new Error('missing-params');
  const isImage = type === 'image' && imageUrl;
  const body = String(text || '').trim().slice(0, 4000);
  if (!isImage && !body) throw new Error('missing-params');
  const chatRef = doc(db, 'friendChats', chatId);
  const chatSnap = await getDoc(chatRef);
  if (!chatSnap.exists()) throw new Error('chat-not-found');
  const chat = chatSnap.data() || {};
  const memberIds = uniqueMemberIds(chat.memberIds);
  if (!memberIds.includes(senderUid)) throw new Error('forbidden');

  const payload = {
    text: body,
    type: isImage ? 'image' : 'text',
    senderId: senderUid,
    senderName: senderName || '',
    createdAt: serverTimestamp(),
    createdAtMs: Date.now(),
  };
  if (isImage) {
    payload.imageUrl = imageUrl;
    if (imagePath) payload.imagePath = imagePath;
  }
  const msgRef = await addDoc(collection(db, 'friendChats', chatId, 'messages'), payload);

  const preview = isImage ? (body || 'Bilde') : body;
  const unreadPatch = {};
  memberIds.forEach((id) => {
    if (id !== senderUid) unreadPatch[`unreadCounts.${id}`] = increment(1);
  });
  await updateDoc(chatRef, {
    lastText: preview.slice(0, 120),
    lastSenderId: senderUid,
    lastAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    unreadStampId: msgRef.id,
    ...unreadPatch,
    [`unreadCounts.${senderUid}`]: 0,
  });

  const recipients = memberIds.filter((id) => id !== senderUid);
  await notifyUsers(recipients, {
    eventType: 'messageReceived',
    title: senderName || 'Melding',
    body: preview.slice(0, 80),
    chatId,
    friendChat: true,
    friendUid: senderUid,
    createdBy: senderUid,
    notificationId: `friendChat_${chatId}_${msgRef.id}`,
  }).catch(() => {});

  return msgRef.id;
}

export async function markFriendChatRead(chatId, uid) {
  if (!chatId || !uid) return;
  await updateDoc(doc(db, 'friendChats', chatId), {
    [`reads.${uid}`]: serverTimestamp(),
    [`unreadCounts.${uid}`]: 0,
  }).catch(() => {});
}

/** Load messages via Admin callable (works when client LIST rules deny). */
export async function listFriendChatMessagesViaAdmin({
  chatId = null,
  friendUid = null,
} = {}) {
  const fn = httpsCallable(functions, 'listFriendChatMessagesAdmin');
  const res = await fn({
    ...(chatId ? { chatId } : {}),
    ...(friendUid ? { friendUid } : {}),
  });
  if (!res?.data?.ok) return [];
  return Array.isArray(res.data.messages) ? res.data.messages : [];
}

/**
 * Live friend-thread listener with Auth wait, ensure-doc heal, retry, and
 * Admin poll fallback so web ChatDock never stays permanently blank.
 */
export function listenFriendChatMessages(chatId, onData, {
  max = 80,
  uid = null,
  friendUid = null,
  pollMs = 4000,
} = {}) {
  if (!chatId) {
    onData?.([]);
    return () => {};
  }

  let cancelled = false;
  let unsub = () => {};
  let pollTimer = null;
  let attempt = 0;
  let usingAdminPoll = false;

  const stopPoll = () => {
    if (pollTimer != null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const startAdminPoll = () => {
    if (cancelled || usingAdminPoll) return;
    usingAdminPoll = true;
    const tick = async () => {
      if (cancelled) return;
      try {
        const msgs = await listFriendChatMessagesViaAdmin({ chatId, friendUid });
        if (!cancelled) onData?.(msgs);
      } catch {
        /* keep last good snapshot */
      }
    };
    tick();
    pollTimer = setInterval(tick, Math.max(2000, pollMs));
  };

  const attach = async () => {
    if (cancelled) return;
    if (uid) {
      const ok = await waitForFirestoreAccess(uid);
      if (cancelled) return;
      if (!ok) {
        startAdminPoll();
        return;
      }
    }

    if (uid && friendUid) {
      try {
        await ensureFriendChatDoc(uid, friendUid);
      } catch (healErr) {
        warnPermissionOnce(
          `friend-chat-heal:${chatId}:${uid}`,
          '[friendChat] ensureFriendChatDoc',
          healErr?.code || healErr?.message || healErr,
        );
      }
    }
    if (cancelled) return;

    try { unsub(); } catch { /* ignore */ }
    const qy = query(
      collection(db, 'friendChats', chatId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(max),
    );
    unsub = onSnapshot(
      qy,
      (snap) => {
        if (cancelled) return;
        // Live path works — drop Admin poll if we had started it.
        if (usingAdminPoll) {
          stopPoll();
          usingAdminPoll = false;
        }
        onData?.(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      async (err) => {
        if (cancelled) return;
        if (attempt < 2 && isFirestorePermissionError(err)) {
          attempt += 1;
          if (uid && friendUid) {
            try {
              await ensureFriendChatDoc(uid, friendUid);
            } catch { /* Admin fallback below */ }
          }
          try { unsub(); } catch { /* ignore */ }
          unsub = () => {};
          attach();
          return;
        }
        try { unsub(); } catch { /* ignore */ }
        unsub = () => {};
        warnPermissionOnce(
          `friend-chat-msgs:${chatId}:${uid || 'anon'}`,
          '[friendChat] messages listen failed — Admin poll',
          err?.code || err?.message || err,
        );
        startAdminPoll();
      },
    );
  };

  attach();
  return () => {
    cancelled = true;
    stopPoll();
    try { unsub(); } catch { /* ignore */ }
  };
}

export function listenFriendChats(uid, onData) {
  if (!uid) {
    onData?.([]);
    return () => {};
  }

  let cancelled = false;
  let unsub = () => {};
  let attempt = 0;

  const attach = async () => {
    if (cancelled) return;
    const ok = await waitForFirestoreAccess(uid);
    if (cancelled) return;
    if (!ok) {
      onData?.([]);
      return;
    }
    try { unsub(); } catch { /* ignore */ }
    const qy = query(
      collection(db, 'friendChats'),
      where('memberIds', 'array-contains', uid),
      orderBy('updatedAt', 'desc'),
      limit(40),
    );
    unsub = onSnapshot(
      qy,
      (snap) => {
        if (cancelled) return;
        onData?.(snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            id: d.id,
            ...data,
            unread: unreadCountForUser(data, uid),
          };
        }));
      },
      async (err) => {
        if (cancelled) return;
        if (attempt < 2 && isFirestorePermissionError(err)) {
          attempt += 1;
          try { unsub(); } catch { /* ignore */ }
          unsub = () => {};
          setTimeout(() => {
            if (!cancelled) attach();
          }, 500 * attempt);
          return;
        }
        try { unsub(); } catch { /* ignore */ }
        unsub = () => {};
        warnPermissionOnce(
          `friend-chats:${uid}`,
          '[friendChat] chats listen failed',
          err?.code || err?.message || err,
        );
        onData?.([]);
      },
    );
  };

  attach();
  return () => {
    cancelled = true;
    try { unsub(); } catch { /* ignore */ }
  };
}
