/** Chat list stamp and unread fan-out (no Firebase). */

import { otherDmMemberIds, uniqueMemberIds } from './chatsLogic.js';

export function resolveChatUnreadBump({
  chatId,
  senderId,
  memberIds,
  unreadFor,
} = {}) {
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
  return { ids, bump };
}

/**
 * Patch for families/{id}/chats/{chatId}.
 * Dotted keys match Firestore setDoc merge (`reads.uid`, `unreadCounts.uid`).
 * `now` is a number in tests, or `() => serverTimestamp()` in the app.
 */
export function buildChatStampPatch({
  chatId,
  senderId,
  text,
  memberIds,
  unreadFor,
  messageId,
  prev = {},
  now,
} = {}) {
  const stamp = typeof now === 'function' ? now : () => now;
  const { ids, bump } = resolveChatUnreadBump({
    chatId, senderId, memberIds, unreadFor,
  });
  if (messageId && prev.unreadStampId === messageId) {
    const patch = {
      lastSenderId: senderId || null,
      lastAt: stamp(),
      updatedAt: stamp(),
      lastText: String(text || '').slice(0, 140),
    };
    if (ids.length) patch.memberIds = ids;
    return { patch, ids, bump, idempotent: true };
  }

  const prevCounts = (
    prev.unreadCounts
    && typeof prev.unreadCounts === 'object'
    && !Array.isArray(prev.unreadCounts)
  ) ? prev.unreadCounts : {};

  const patch = {
    lastSenderId: senderId || null,
    lastAt: stamp(),
    updatedAt: stamp(),
    lastText: String(text || '').slice(0, 140),
  };
  if (messageId) patch.unreadStampId = messageId;
  if (ids.length) patch.memberIds = ids;
  if (senderId) {
    patch[`reads.${senderId}`] = stamp();
    patch[`unreadCounts.${senderId}`] = 0;
  }
  bump.forEach((id) => {
    patch[`unreadCounts.${id}`] = (Number(prevCounts[id]) || 0) + 1;
  });
  return { patch, ids, bump, idempotent: false };
}
