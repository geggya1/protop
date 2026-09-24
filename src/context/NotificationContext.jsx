import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, limit, onSnapshot, orderBy, query, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from './AppContext';
import { summarizeUnread, markNotificationsSeen, mergeBadgeCounts } from '../utils/notifications';
import { getOpenChatId } from '../utils/openChat';
import { useChatUnread } from '../hooks/useChatUnread';
import { useChatSelfNotify } from '../hooks/useChatSelfNotify';
import { useFriendChatUnread } from '../hooks/useFriendChatUnread';
import { useFriendChatSelfNotify } from '../hooks/useFriendChatSelfNotify';
import { useGameInviteSelfNotify } from '../hooks/useGameInviteSelfNotify';
import { useModuleActivity } from '../hooks/useModuleActivity';
import {
  loadMailInboxUnread,
  peekMailInboxUnread,
  subscribeMailInboxUnread,
} from '../utils/mailCache';
import {
  addPushOpenListener,
  configurePushHandlers,
  disablePushSubscription,
  ensurePushSubscription,
  pushSupported,
  showLocalNotification,
  isStandaloneDisplay,
} from '../utils/push';
import { isChannelOn, isMasterNotifEnabled, mergeNotificationPrefs } from '../utils/notificationPrefs';
import {
  appendToast,
  buildToastFromNotification,
  notificationNavPayload,
  removeToast,
  shouldShowInAppToast,
} from '../utils/inAppNotifications';
import { listenAfterAccess } from '../utils/firestoreAccess';
import { notifLog } from '../utils/notifLog';
import { navigateFromNotification } from '../navigation/navRef';
import InAppNotificationToast from '../../components/InAppNotificationToast';

const Ctx = createContext(null);
const PUSH_ASKED_KEY = 'weekplan_push_asked_v1';
const PUSH_MIGRATE_KEY = 'weekplan_push_enable_v1';

async function storageGet(key) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.localStorage.getItem(key);
    }
    return AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key, value) {
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  } catch { /* ignore */ }
}

function shouldShowForegroundPush(payload) {
  if (!payload) return false;
  if (payload.eventType === 'messageReceived' && payload.chatId && getOpenChatId() === payload.chatId) {
    return false;
  }
  return true;
}

function isAppVisibleNow() {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible';
  }
  return AppState.currentState === 'active';
}

export function NotificationProvider({ children }) {
  const { uid, userProfile, familyId, isChild, isActingAsChild } = useApp();
  const asChild = !!(isChild || isActingAsChild);
  const [items, setItems] = React.useState([]);
  const [toasts, setToasts] = useState([]);
  const seenIdsRef = useRef(new Set());
  const primedRef = useRef(false);
  const chatUnread = useChatUnread(familyId, uid);
  const friendChatUnread = useFriendChatUnread(uid);
  useChatSelfNotify(familyId, uid, userProfile?.notificationPrefs);
  useFriendChatSelfNotify(uid, userProfile?.notificationPrefs);
  const pendingGameInvites = useGameInviteSelfNotify(
    familyId,
    uid,
    userProfile?.notificationPrefs,
  );
  const activityCounts = useModuleActivity();
  const [mailUnread, setMailUnread] = useState(() => peekMailInboxUnread(uid));

  const dismissToast = useCallback((id) => {
    setToasts((prev) => removeToast(prev, id));
  }, []);

  const enqueueToast = useCallback((notification) => {
    const toast = buildToastFromNotification(notification);
    if (!toast) return;
    setToasts((prev) => appendToast(prev, toast, 3));
  }, []);

  const openToast = useCallback((toast) => {
    navigateFromNotification(toast?.data || {});
    if (toast?.id) {
      setToasts((prev) => removeToast(prev, toast.id));
      if (uid) markNotificationsSeen(uid, [toast.id]).catch(() => {});
    }
  }, [uid]);

  // Dev helper for manual verification (Expo __DEV__ only).
  useEffect(() => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return undefined;
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    window.__weekplanShowToast = (payload = {}) => {
      const id = payload.id || `demo_${Date.now()}`;
      enqueueToast({
        id,
        title: payload.title || 'Testvarsel',
        body: payload.body || 'Dette er et popup-varsel på skjermen.',
        eventType: payload.eventType || 'messageReceived',
        ...payload,
      });
    };
    return () => {
      try { delete window.__weekplanShowToast; } catch { /* ignore */ }
    };
  }, [enqueueToast]);

  useEffect(() => {
    setMailUnread(peekMailInboxUnread(uid));
    let alive = true;
    loadMailInboxUnread(uid).then((n) => {
      if (alive) setMailUnread(n);
    });
    const unsub = subscribeMailInboxUnread((changedUid, count) => {
      if (!uid || changedUid === uid) setMailUnread(count);
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [uid]);

  useEffect(() => {
    primedRef.current = false;
    seenIdsRef.current = new Set();
    setToasts([]);
    if (!uid) {
      setItems([]);
      return undefined;
    }
    const col = collection(db, 'users', uid, 'notifications');
    const applyDocs = (docs) => {
      const next = docs.map((d) => ({ id: d.id, ...d.data() }));
      if (!primedRef.current) {
        next.forEach((n) => { if (n.id) seenIdsRef.current.add(n.id); });
        primedRef.current = true;
        notifLog('inbox_primed', { uid, count: next.length });
      }
      setItems(next);
    };

    // Wait for Auth (+ App Check) before attaching — early permission-denied
    // used to leave the inbox permanently empty while chat badges still worked.
    return listenAfterAccess(
      uid,
      (onErr) => {
        let activeUnsub = () => {};
        const attachUnordered = () => {
          try { activeUnsub(); } catch { /* ignore */ }
          activeUnsub = onSnapshot(
            query(col, limit(80)),
            (snap) => {
              const docs = [...snap.docs].sort((a, b) => {
                const am = a.data()?.createdAt?.toMillis?.()
                  || (a.data()?.createdAt?.seconds || 0) * 1000;
                const bm = b.data()?.createdAt?.toMillis?.()
                  || (b.data()?.createdAt?.seconds || 0) * 1000;
                return bm - am;
              });
              applyDocs(docs);
            },
            (err2) => {
              notifLog('inbox_unordered_failed', {
                code: err2?.code, message: err2?.message, level: 'error',
              });
              onErr?.(err2);
            },
          );
        };

        activeUnsub = onSnapshot(
          query(col, orderBy('createdAt', 'desc'), limit(80)),
          (snap) => applyDocs(snap.docs),
          (err) => {
            notifLog('inbox_ordered_failed', {
              code: err?.code, message: err?.message,
            });
            attachUnordered();
          },
        );
        return () => {
          try { activeUnsub(); } catch { /* ignore */ }
        };
      },
      (err) => {
        notifLog('inbox_denied', {
          code: err?.code, message: err?.message, level: 'error',
        });
        setItems([]);
      },
    );
  }, [uid]);

  const summary = useMemo(() => summarizeUnread(items), [items]);
  const inboxChat = Number(summary.counts.chat) || 0;
  const docChat = (Number(chatUnread.total) || 0) + (Number(friendChatUnread.total) || 0);
  // Alltid ta det høyeste — unreadCounts kan mangle mens inbox finnes, og omvendt.
  const chatCount = Math.max(inboxChat, docChat);
  const inboxGames = Number(summary.counts.games) || 0;
  const gamesCount = Math.max(inboxGames, Number(pendingGameInvites) || 0);
  const unreadByModule = useMemo(() => {
    const merged = mergeBadgeCounts(
      { ...summary.counts, chat: chatCount, games: gamesCount },
      activityCounts,
      { asChild },
    );
    if (!asChild && mailUnread > 0) {
      merged.mail = Math.max(Number(merged.mail) || 0, mailUnread);
    }
    return merged;
  }, [summary.counts, chatCount, gamesCount, activityCounts, asChild, mailUnread]);
  const unreadByChat = useMemo(() => {
    const out = { ...summary.byChat };
    Object.entries(chatUnread.byChat || {}).forEach(([id, n]) => {
      out[id] = Math.max(Number(out[id]) || 0, Number(n) || 0);
    });
    Object.entries(friendChatUnread.byChat || {}).forEach(([id, n]) => {
      out[id] = Math.max(Number(out[id]) || 0, Number(n) || 0);
    });
    return out;
  }, [summary.byChat, chatUnread.byChat, friendChatUnread.byChat]);
  // Bjelle = inbox/chat/spillinvitasjoner, ikke «oppgaver i dag».
  const unreadTotal = summary.total - inboxChat + chatCount - inboxGames + gamesCount;

  const markSeen = useCallback(async (ids) => {
    if (!uid) return;
    await markNotificationsSeen(uid, ids);
  }, [uid]);

  const markChatSeen = useCallback(async (chatId) => {
    if (!uid || !chatId) return;
    const ids = items
      .filter((n) => n.seen !== true && n.chatId === chatId)
      .map((n) => n.id);
    if (ids.length) await markSeen(ids);
  }, [uid, items, markSeen]);

  useEffect(() => {
    let removeOpen = () => {};
    configurePushHandlers().catch(() => {});
    addPushOpenListener((payload) => navigateFromNotification(payload || {})).then((unsub) => {
      removeOpen = typeof unsub === 'function' ? unsub : () => {};
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onSwMessage = (event) => {
        const msg = event?.data || {};
        if (msg.type === 'weekplan-open') {
          navigateFromNotification(msg.payload || {});
          return;
        }
        // Push while app is open: surface large in-app popup immediately
        // (inbox snapshot may lag; OS notification still shows via SW).
        if (msg.type === 'weekplan-push') {
          const p = msg.payload || {};
          const id = p.notificationId || p.tag || `push_${Date.now()}`;
          if (seenIdsRef.current.has(id)) return;
          seenIdsRef.current.add(id);
          notifLog('sw_push_toast', { id, eventType: p.eventType });
          enqueueToast({
            id,
            title: p.title || 'ProTop',
            body: p.body || '',
            eventType: p.eventType || null,
            chatId: p.chatId || null,
            familyId: p.familyId || null,
            friendChat: p.friendChat === true || p.friendChat === '1' || p.friendChat === 'true',
            friendUid: p.friendUid || null,
            inviteId: p.inviteId || null,
            gameId: p.gameId || null,
            gameType: p.gameType || null,
          });
        }
      };
      navigator.serviceWorker?.addEventListener?.('message', onSwMessage);

      try {
        const pending = window.sessionStorage.getItem('weekplan_open_notif');
        if (pending) {
          window.sessionStorage.removeItem('weekplan_open_notif');
          navigateFromNotification(JSON.parse(pending));
        }
      } catch {}

      return () => {
        removeOpen();
        navigator.serviceWorker?.removeEventListener?.('message', onSwMessage);
      };
    }

    return () => { removeOpen(); };
  }, [enqueueToast]);

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    (async () => {
      const seen = await storageGet(PUSH_MIGRATE_KEY);
      if (seen || cancelled) return;
      await storageSet(PUSH_MIGRATE_KEY, '1');
      const merged = mergeNotificationPrefs(userProfile?.notificationPrefs);
      const alreadyOn = merged.events.messageReceived.push && merged.events.taskReceived.push;
      if (alreadyOn) return;
      merged.events.messageReceived.push = true;
      merged.events.taskReceived.push = true;
      try {
        await setDoc(doc(db, 'users', uid), { notificationPrefs: merged }, { merge: true });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [uid, userProfile?.notificationPrefs]);

  useEffect(() => {
    if (!uid || !pushSupported()) return undefined;
    const prefs = userProfile?.notificationPrefs;
    let cancelled = false;
    (async () => {
      if (!isMasterNotifEnabled(prefs)) {
        await disablePushSubscription(uid).catch(() => {});
        return;
      }
      try {
        const asked = await storageGet(PUSH_ASKED_KEY);
        if (!asked) await storageSet(PUSH_ASKED_KEY, '1');

        // På iPhone PWA: ikke spør automatisk mens permission er default —
        // iOS krever eksplisitt brukertap (PushEnableBanner).
        if (Platform.OS === 'web'
          && typeof Notification !== 'undefined'
          && Notification.permission === 'default'
          && isStandaloneDisplay()) {
          return;
        }
        // Har brukeren allerede gitt tillatelse: sørg for at abonnement finnes.
        if (!cancelled) {
          const sub = await ensurePushSubscription(uid);
          notifLog('push_subscription', {
            ok: !!sub,
            permission: typeof Notification !== 'undefined' ? Notification.permission : 'n/a',
          });
        }
      } catch (err) {
        notifLog('push_subscription_failed', {
          message: err?.message, level: 'error',
        });
      }
    })();
    return () => { cancelled = true; };
  }, [uid, userProfile?.notificationPrefs]);

  useEffect(() => {
    if (!uid) return;
    const prefs = userProfile?.notificationPrefs;
    const incoming = items.filter((n) => n.seen !== true && n.id && !seenIdsRef.current.has(n.id));
    const appVisible = isAppVisibleNow();
    const pushGranted = Platform.OS !== 'web'
      || (typeof Notification !== 'undefined' && Notification.permission === 'granted');

    incoming.forEach((n) => {
      seenIdsRef.current.add(n.id);
      const channelOn = isChannelOn(prefs, n.eventType, 'push', true);
      if (!channelOn) {
        notifLog('incoming_skipped_prefs', { id: n.id, eventType: n.eventType });
        return;
      }
      if (!shouldShowForegroundPush(n)) return;

      // Always pop in-app when the app is visible (does not need OS permission).
      if (appVisible && shouldShowInAppToast(n, { prefsChannelOn: channelOn })) {
        notifLog('incoming_toast', { id: n.id, eventType: n.eventType });
        enqueueToast(n);
      }

      // OS/local push when the app is not the primary surface.
      // While visible, in-app toast (or invite overlay) is enough — avoid duplicates.
      if (appVisible) return;
      if (!pushSupported()) return;
      if (Platform.OS === 'web' && !pushGranted) return;
      notifLog('incoming_local_push', { id: n.id, eventType: n.eventType });
      showLocalNotification({
        title: n.title || 'ProTop',
        body: n.body || '',
        tag: n.id,
        data: notificationNavPayload(n),
      });
    });
    if (seenIdsRef.current.size > 200) {
      seenIdsRef.current = new Set(items.slice(0, 80).map((n) => n.id));
    }
  }, [items, uid, userProfile?.notificationPrefs, enqueueToast]);

  const value = useMemo(() => ({
    items,
    unreadTotal,
    unreadByModule,
    unreadByChat,
    markSeen,
    markChatSeen,
  }), [items, unreadTotal, unreadByModule, unreadByChat, markSeen, markChatSeen]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <InAppNotificationToast
        toasts={toasts}
        onPress={openToast}
        onDismiss={dismissToast}
      />
    </Ctx.Provider>
  );
}

export function useUnread() {
  const ctx = useContext(Ctx);
  return ctx || {
    items: [],
    unreadTotal: 0,
    unreadByModule: {},
    unreadByChat: {},
    markSeen: async () => {},
    markChatSeen: async () => {},
  };
}
