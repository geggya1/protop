/**
 * Chat inbox backup trigger — no Secret Manager deps.
 * Loaded by pushIndex.js (CI) and index.js.
 */
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();
const db = getFirestore();

function dmRecipientsFromChatId(chatId, senderUid) {
  if (!chatId || !String(chatId).startsWith('dm_')) return [];
  const rest = String(chatId).slice(3);
  const i = rest.indexOf('_');
  if (i <= 0) return [];
  return [rest.slice(0, i), rest.slice(i + 1)].filter((id) => id && id !== senderUid);
}

/** Backup: write inbox + unread when a chat message is created. No secrets. */
export const onChatMessageCreated = onDocumentCreated(
  {
    document: 'families/{familyId}/chats/{chatId}/messages/{messageId}',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const msg = event.data?.data?.() || {};
    const { familyId, chatId, messageId } = event.params || {};
    const senderUid = msg.senderId;
    if (!familyId || !chatId || !messageId || !senderUid) return;

    try {
      const [chatSnap, familySnap] = await Promise.all([
        db.doc(`families/${familyId}/chats/${chatId}`).get(),
        db.doc(`families/${familyId}`).get(),
      ]);
      const chatData = chatSnap.exists ? (chatSnap.data() || {}) : {};
      const familyData = familySnap.exists ? (familySnap.data() || {}) : {};
      const chatMembers = Array.isArray(chatData.memberIds) ? chatData.memberIds : [];
      const familyMembers = Array.isArray(familyData.members) ? familyData.members : [];
      const isDm = String(chatId).startsWith('dm_');
      let recipients;
      if (isDm) {
        const live = chatMembers.filter((id) => id && id !== senderUid);
        recipients = live.length ? live : dmRecipientsFromChatId(chatId, senderUid);
      } else if (String(chatId).startsWith('g_')) {
        recipients = chatMembers.filter((id) => id && id !== senderUid);
      } else {
        recipients = [...new Set([...chatMembers, ...familyMembers])]
          .filter((id) => id && id !== senderUid);
      }
      const preview = msg.type === 'image'
        ? (msg.text || '📷 Bilde')
        : (msg.text || '');

      const chatRef = db.doc(`families/${familyId}/chats/${chatId}`);
      await db.runTransaction(async (tx) => {
        const live = await tx.get(chatRef);
        const liveData = live.exists ? (live.data() || {}) : {};
        const alreadyStamped = liveData.unreadStampId === messageId;
        const patch = {
          lastSenderId: senderUid,
          lastAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastText: String(preview).slice(0, 140),
        };
        const liveMembers = Array.isArray(liveData.memberIds) ? liveData.memberIds : [];
        if (!liveMembers.length && familyMembers.length && !isDm) {
          patch.memberIds = familyMembers;
        }
        if (!alreadyStamped) {
          patch.unreadStampId = messageId;
          patch[`unreadCounts.${senderUid}`] = 0;
          patch[`reads.${senderUid}`] = FieldValue.serverTimestamp();
          recipients.forEach((id) => {
            patch[`unreadCounts.${id}`] = FieldValue.increment(1);
          });
        }
        tx.set(chatRef, patch, { merge: true });
      });

      if (!recipients.length) {
        logger.warn('onChatMessageCreated — no recipients', { familyId, chatId });
        return;
      }

      const notifId = `msg_${messageId}`;
      await Promise.all(recipients.map(async (toUid) => {
        try {
          await db.doc(`users/${toUid}/notifications/${notifId}`).create({
            eventType: 'messageReceived',
            title: 'Ny melding',
            body: String(preview).slice(0, 280),
            familyId,
            chatId,
            createdAt: FieldValue.serverTimestamp(),
            seen: false,
            createdBy: senderUid,
          });
        } catch {
          /* already written by client */
        }
      }));
      logger.info('onChatMessageCreated inbox', {
        familyId, chatId, recipients: recipients.length,
      });
    } catch (e) {
      logger.warn('onChatMessageCreated failed', {
        familyId,
        chatId,
        message: e?.message,
      });
    }
  },
);

/** Backup inbox + unread for peer friend DMs (no family path). */
export const onFriendChatMessageCreated = onDocumentCreated(
  {
    document: 'friendChats/{chatId}/messages/{messageId}',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (event) => {
    const msg = event.data?.data?.() || {};
    const { chatId, messageId } = event.params || {};
    const senderUid = msg.senderId;
    if (!chatId || !messageId || !senderUid) return;

    try {
      const chatRef = db.doc(`friendChats/${chatId}`);
      const chatSnap = await chatRef.get();
      const chatData = chatSnap.exists ? (chatSnap.data() || {}) : {};
      const members = Array.isArray(chatData.memberIds) ? chatData.memberIds : [];
      let recipients = members.filter((id) => id && id !== senderUid);
      if (!recipients.length) {
        recipients = dmRecipientsFromChatId(chatId, senderUid);
      }
      const preview = msg.type === 'image'
        ? (msg.text || '📷 Bilde')
        : (msg.text || '');
      const senderName = String(msg.senderName || '').trim();

      await db.runTransaction(async (tx) => {
        const live = await tx.get(chatRef);
        const liveData = live.exists ? (live.data() || {}) : {};
        const alreadyStamped = liveData.unreadStampId === messageId;
        const patch = {
          lastSenderId: senderUid,
          lastAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          lastText: String(preview).slice(0, 140),
        };
        if (!Array.isArray(liveData.memberIds) || !liveData.memberIds.length) {
          const ids = [...new Set([senderUid, ...recipients])].sort();
          if (ids.length) patch.memberIds = ids;
        }
        if (!alreadyStamped) {
          patch.unreadStampId = messageId;
          patch[`unreadCounts.${senderUid}`] = 0;
          patch[`reads.${senderUid}`] = FieldValue.serverTimestamp();
          recipients.forEach((id) => {
            patch[`unreadCounts.${id}`] = FieldValue.increment(1);
          });
        }
        tx.set(chatRef, patch, { merge: true });
      });

      if (!recipients.length) {
        logger.warn('onFriendChatMessageCreated — no recipients', { chatId });
        return;
      }

      await Promise.all(recipients.map(async (toUid) => {
        const notifId = `friendChat_${messageId}`;
        try {
          await db.doc(`users/${toUid}/notifications/${notifId}`).create({
            eventType: 'messageReceived',
            title: senderName || 'Ny melding',
            body: String(preview).slice(0, 280),
            chatId,
            friendChat: true,
            friendUid: senderUid,
            createdAt: FieldValue.serverTimestamp(),
            seen: false,
            read: false,
            createdBy: senderUid,
          });
        } catch {
          /* already written by Admin/client */
        }
      }));
      logger.info('onFriendChatMessageCreated inbox', {
        chatId, recipients: recipients.length,
      });
    } catch (e) {
      logger.warn('onFriendChatMessageCreated failed', {
        chatId,
        message: e?.message,
      });
    }
  },
);
