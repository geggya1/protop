import { useEffect, useState } from 'react';
import { subscribeFamilyCollection } from '../utils/sharedCollectionListeners';
import { chatVisibleToUser, hasStoredUnreadCount, unreadCountForUser } from '../utils/chats';

/**
 * Uleste chat-meldinger fra chat-dokumentet (unreadCounts.{uid}).
 * Fungerer også når inbox-varsler ikke ble skrevet.
 * Delte Firestore-lyttere med useChatSelfNotify.
 */
export function useChatUnread(familyId, uid) {
  const [state, setState] = useState({ total: 0, byChat: {}, hasStoredCounts: false });

  useEffect(() => {
    if (!familyId || !uid) {
      setState({ total: 0, byChat: {}, hasStoredCounts: false });
      return undefined;
    }
    return subscribeFamilyCollection(
      familyId,
      'chats',
      (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })),
      (chats) => {
        const byChat = {};
        let total = 0;
        let hasStoredCounts = false;
        (chats || []).forEach((data) => {
          if (!chatVisibleToUser(data.id, data, uid)) return;
          if (hasStoredUnreadCount(data, uid)) hasStoredCounts = true;
          const n = unreadCountForUser(data, uid);
          if (n > 0) {
            byChat[data.id] = n;
            total += n;
          }
        });
        setState({ total, byChat, hasStoredCounts });
      },
    );
  }, [familyId, uid]);

  return state;
}
