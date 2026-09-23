import { useEffect, useRef } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../../firebase';
import { getOpenChatId } from '../utils/openChat';
import {
  chatVisibleToUser,
  timestampToMs,
  unreadCountForUser,
} from '../utils/chats';
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

          const notifId = `chat_${data.id}_${stamp}`.slice(0, 700);
          const chatTitle = String(data.title || data.name || '').trim() || 'Chat';
          const title = chatTitle === 'Chat' ? 'Ny melding' : chatTitle;
          const body = String(data.lastText || '').slice(0, 280);
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

          setDoc(doc(db, 'users', uid, 'notifications', notifId), payload).catch((err) => {
            console.warn('[weekplan-notif] chat self-notify inbox', err?.code, err?.message);
          });
          console.log('[weekplan-notif] chat self-notify queued', {
            chatId: data.id, notifId, unread,
          });

          // In-app toast comes from NotificationContext when the inbox doc lands.
          // Only fire OS/local push when the app is not already visible.
          if (!pushSupported()) return;
          if (!isChannelOn(prefsRef.current, 'messageReceived', 'push', true)) return;
          if (Platform.OS === 'web') {
            if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
          }

          showLocalNotification({
            title,
            body,
            tag: notifId,
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
