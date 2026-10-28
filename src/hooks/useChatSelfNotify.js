import { useEffect, useRef } from 'react';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../../firebase';
import { getOpenChatId } from '../utils/openChat';
import {
  chatVisibleToUser,
  timestampToMs,
  unreadCountForUser,
} from '../utils/chats';
import { chatMessageNotice, chatNoticeId } from '../utils/chatsLogic';
import { pushSupported, showLocalNotification } from '../utils/push';
import { isChannelOn } from '../utils/notificationPrefs';
import { notificationNavPayload } from '../utils/inAppNotifications';
import { subscribeFamilyCollection } from '../utils/sharedCollectionListeners';

/**
 * Når noen andre skriver i en chat: oppdater egen inbox + lokal varsel.
 * Fungerer med gamle Firestore-regler (kun egen users/{uid}/notifications).
 * Trenger ikke Cloud Functions eller at avsender kan skrive til mottakers inbox.
 * Delte Firestore-lyttere med useChatUnread.
 */
export function useChatSelfNotify(familyId, uid, prefs) {
  const primedRef = useRef(false);
  const seenStampRef = useRef(new Map());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    primedRef.current = false;
    seenStampRef.current = new Map();
    if (!familyId || !uid) return undefined;

    return subscribeFamilyCollection(
      familyId,
      'chats',
      (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      (chats) => {
        const priming = !primedRef.current;
        (chats || []).forEach((data) => {
          if (!chatVisibleToUser(data.id, data, uid)) return;
          if (!data.lastSenderId || data.lastSenderId === uid) return;

          const stamp = data.unreadStampId
            || `${data.lastSenderId}_${timestampToMs(data.lastAt || data.updatedAt)}`;
          if (priming) {
            seenStampRef.current.set(data.id, stamp);
            return;
          }
          if (seenStampRef.current.get(data.id) === stamp) return;
          seenStampRef.current.set(data.id, stamp);

          // Tell via unreadCounts, ellers lastAt/lastSenderId (hvis counts mangler).
          const unread = unreadCountForUser(data, uid);
          const unreadFallback = unread > 0
            || (
              data.lastSenderId
              && data.lastSenderId !== uid
              && timestampToMs(data.lastAt || data.updatedAt) > 0
            );
          if (!unreadFallback) return;
          if (getOpenChatId() === data.id) return;

          // Samme id som avsenderen og serveren (msg_<meldings-id>), så det blir ett varsel
          // og ulest 1, ikke 2 (SOS-11).
          const notifId = chatNoticeId({ chatId: data.id, stampId: stamp, messageId: data.unreadStampId });
          // DM: chattens tittel er satt av avsenderen til mottakerens navn. Bruk avsenderen (SOS-13).
          const isDm = String(data.id).startsWith('dm_') || data.type === 'dm';
          const { title, body } = chatMessageNotice({
            chatId: data.id,
            isDm,
            chatTitle: String(data.title || data.name || '').trim(),
            senderName: data.lastSenderName,
            text: data.lastText,
          });
          const chatTitle = isDm ? title : (String(data.title || data.name || '').trim() || 'Chat');
          const payload = {
            eventType: 'messageReceived',
            title,
            body,
            chatTitle,
            familyId,
            chatId: data.id,
            createdAt: serverTimestamp(),
            seen: false,
            // Egen uid → tillatt av både gamle og nye notification-regler
            createdBy: uid,
          };

          // Reserve: skriv bare når avsenderen eller serveren ikke allerede har laget varselet.
          const notifRef = doc(db, 'users', uid, 'notifications', notifId);
          getDoc(notifRef)
            .then((snap) => (snap.exists() ? null : setDoc(notifRef, payload)))
            .catch((err) => {
              console.warn('[protop-notif] chat self-notify inbox', err?.code, err?.message);
            });
          console.log('[protop-notif] chat self-notify queued', {
            chatId: data.id, notifId, unread,
          });

          // In-app toast comes from NotificationContext when the inbox doc lands.
          // Only fire OS/local push when the app is not already visible.
          if (!pushSupported()) return;
          if (!isChannelOn(prefsRef.current, 'messageReceived', 'push')) return;
          if (Platform.OS === 'web') {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
          }

          showLocalNotification({
            title,
            body,
            // Samme tag som push fra serveren: én melding gir ett varsel.
            tag: `chat_${data.id}`,
            data: notificationNavPayload({
              id: notifId,
              eventType: 'messageReceived',
              chatId: data.id,
              familyId,
              title,
            }),
          });
        });
        primedRef.current = true;
      },
    );
  }, [familyId, uid]);
}
