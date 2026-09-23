import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  listenFamilyPendingGameInvites,
  listenIncomingGameInvites,
  selfHealGameInviteInbox,
} from '../utils/familyGamesShared';
import { pushSupported, showLocalNotification } from '../utils/push';
import { isChannelOn } from '../utils/notificationPrefs';
import { notificationNavPayload } from '../utils/inAppNotifications';

/**
 * When someone invites you to a family game:
 * - Self-heal own users/{uid}/gameInvites + notifications if the host
 *   could not write cross-user (mirrors useChatSelfNotify).
 * - Expose pending invite count for the bell badge (inbox ∪ family games).
 */
export function useGameInviteSelfNotify(familyId, uid, prefs) {
  const [inboxPending, setInboxPending] = useState(0);
  const [familyPending, setFamilyPending] = useState(0);
  const healedRef = useRef(new Set());
  const primedRef = useRef(false);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  useEffect(() => {
    healedRef.current = new Set();
    primedRef.current = false;
    setInboxPending(0);
    setFamilyPending(0);
    if (!uid) return undefined;

    const unsubInbox = listenIncomingGameInvites(uid, (list) => {
      setInboxPending((list || []).length);
    });

    let unsubFamily = () => {};
    if (familyId) {
      unsubFamily = listenFamilyPendingGameInvites(familyId, uid, (list) => {
        const rows = list || [];
        setFamilyPending(rows.length);
        const priming = !primedRef.current;
        primedRef.current = true;
        rows.forEach((invite) => {
          const key = invite.id || `${invite.gameType}_${invite.gameId}`;
          if (!key || healedRef.current.has(key)) return;
          healedRef.current.add(key);
          if (priming) {
            // Still write missing inbox docs for existing pending invites,
            // but skip local OS push noise on first snapshot.
            selfHealGameInviteInbox(uid, invite);
            return;
          }
          selfHealGameInviteInbox(uid, invite).then(() => {
            if (!pushSupported()) return;
            if (!isChannelOn(prefsRef.current, 'gameInvite', 'push', true)) return;
            if (Platform.OS === 'web') {
              if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
              if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;
            }
            const label = invite.gameTitle || 'familiespill';
            const title = 'Spillinvitasjon';
            const body = `${invite.hostName || 'Noen'} inviterer deg til ${label}. Godta eller avslå.`;
            const notifId = `gameInvite_${invite.gameType}_${invite.gameId}`;
            showLocalNotification({
              title,
              body,
              tag: notifId,
              data: notificationNavPayload({
                id: notifId,
                eventType: 'gameInvite',
                familyId: invite.familyId || familyId,
                gameId: invite.gameId,
                gameType: invite.gameType,
                title,
              }),
            });
          }).catch(() => {});
        });
      });
    }

    return () => {
      try { unsubInbox(); } catch { /* ignore */ }
      try { unsubFamily(); } catch { /* ignore */ }
    };
  }, [familyId, uid]);

  return Math.max(inboxPending, familyPending);
}
