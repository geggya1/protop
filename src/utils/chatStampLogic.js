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
 * Gjør `reads.uid`/`unreadCounts.uid` om til nestede kart for setDoc(…, { merge: true }).
 * setDoc tolker ikke punktum som sti, og lagret før toppnivåfelt som het
 * «unreadCounts.<uid>» i stedet for å oppdatere kartet (SOS-14). updateDoc tolker
 * punktum som sti og kan bruke patchen direkte.
 */
export function nestDottedPatch(patch = {}) {
  const out = {};
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (!key.includes('.')) {
      out[key] = value;
      return;
    }
    const parts = key.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!cur[part] || typeof cur[part] !== 'object' || Array.isArray(cur[part])) cur[part] = {};
      cur = cur[part];
    }
    cur[parts[parts.length - 1]] = value;
  });
  return out;
}

/**
 * Patch for families/{id}/chats/{chatId}.
 * Punktum-nøkler (`reads.uid`, `unreadCounts.uid`) er feltstier for updateDoc.
 * Med setDoc merge må patchen gå gjennom nestDottedPatch først.
 * `now` is a number in tests, or `() => serverTimestamp()` in the app.
 */
export function buildChatStampPatch({
  chatId,
  senderId,
  senderName,
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
  const name = String(senderName || '').trim().slice(0, 80);
  if (messageId && prev.unreadStampId === messageId) {
    const patch = {
      lastSenderId: senderId || null,
      lastAt: stamp(),
      updatedAt: stamp(),
      lastText: String(text || '').slice(0, 140),
    };
    if (name) patch.lastSenderName = name;
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
  // Avsenderens navn, så mottakerens varsel ikke viser chattens tittel (SOS-13).
  if (name) patch.lastSenderName = name;
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
