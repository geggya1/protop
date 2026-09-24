import { useEffect, useRef } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../../firebase';
import { getOpenChatId } from '../utils/openChat';
import { timestampToMs, unreadCountForUser } from '../utils/chats';
import { listenFriendChats } from '../utils/friendChats';
import { otherUidFromFriendChatId } from '../utils/friendsLogic';
import { pushSupported, showLocalNotification } from '../utils/push';
import { isChannelOn } from '../utils/notificationPrefs';
import { notificationNavPayload } from '../utils/inAppNotifications';

/**
 * Recipient-side inbox backup for peer friend DMs (mirrors useChatSelfNotify).
 * Friend chats have no family CF self-heal path — without this, Admin/client
 * inbox writes can fail silently while messages still show in the thread.
 */
export function useFriendChatSelfNotify(uid, prefs) {
  const primedRef = useRef(false);
  const seenStampRef = useRef(new Map());
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    primedRef.current = false;
    seenStampRef.current = new Map();
    if (!uid) return undefined;

    return listenFriendChats(uid, (chats) => {
      const priming = !primedRef.current;
      (chats || []).forEach((data) => {
        if (!data?.id || !data.lastSenderId || data.lastSenderId === uid) return;

        const stamp = data.unreadStampId
          || `${data.lastSenderId}_${timestampToMs(data.lastAt || data.updatedAt)}`;
        if (priming) {
          seenStampRef.current.set(data.id, stamp);
          return;
        }
        if (seenStampRef.current.get(data.id) === stamp) return;
        seenStampRef.current.set(data.id, stamp);

        const unread = unreadCountForUser(data, uid);
        const unreadFallback = unread > 0
          || (
            data.lastSenderId
            && data.lastSenderId !== uid
            && timestampToMs(data.lastAt || data.updatedAt) > 0
          );
        if (!unreadFallback) return;
        if (getOpenChatId() === data.id) return;

        const friendUid = otherUidFromFriendChatId(data.id, uid)
          || data.lastSenderId
          || null;
        const notifId = `friendChat_${data.id}_${stamp}`.slice(0, 700);
        const chatTitle = String(data.title || data.names?.[friendUid] || '').trim() || 'Chat';
        const title = chatTitle === 'Chat' ? 'Ny melding' : chatTitle;
        const body = String(data.lastText || '').slice(0, 280);
        const payload = {
          eventType: 'messageReceived',
          title,
          body,
          chatTitle,
          chatId: data.id,
          friendChat: true,
          friendUid,
          createdAt: serverTimestamp(),
          seen: false,
          createdBy: uid,
        };

        setDoc(doc(db, 'users', uid, 'notifications', notifId), payload).catch((err) => {
          console.warn('[weekplan-notif] friend chat self-notify inbox', err?.code, err?.message);
        });

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
            friendChat: true,
            friendUid,
            title,
          }),
        });
      });
      primedRef.current = true;
    });
  }, [uid]);
}
