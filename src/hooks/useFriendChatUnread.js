import { useEffect, useState } from 'react';
import { listenFriendChats } from '../utils/friendChats';
import { hasStoredUnreadCount, unreadCountForUser } from '../utils/chats';

/**
 * Uleste friend-DM-er fra friendChats/{id}.unreadCounts.{uid}.
 * Family useChatUnread does not cover peer chats — without this the bell/icon
 * stays at 0 even when messages arrive.
 */
export function useFriendChatUnread(uid) {
  const [state, setState] = useState({ total: 0, byChat: {}, hasStoredCounts: false });

  useEffect(() => {
    if (!uid) {
      setState({ total: 0, byChat: {}, hasStoredCounts: false });
      return undefined;
    }
    return listenFriendChats(uid, (chats) => {
      const byChat = {};
      let total = 0;
      let hasStoredCounts = false;
      (chats || []).forEach((data) => {
        if (!data?.id) return;
        if (hasStoredUnreadCount(data, uid)) hasStoredCounts = true;
        const n = unreadCountForUser(data, uid);
        if (n > 0) {
          byChat[data.id] = n;
          total += n;
        }
      });
      setState({ total, byChat, hasStoredCounts });
    });
  }, [uid]);

  return state;
}
