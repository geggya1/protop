export function uniqueMemberIds(list) {
  return [...new Set((list || []).filter((id) => typeof id === 'string' && id.trim()))];
}

export function timestampToMs(value) {
  if (!value) return 0;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

/** True når noen andre har skrevet etter at `uid` sist åpnet tråden. */
export function chatIsUnread(data, uid) {
  if (!data || !uid) return false;
  if (!data.lastSenderId || data.lastSenderId === uid) return false;
  const lastMs = timestampToMs(data.lastAt || data.updatedAt);
  if (!lastMs) return false;
  const reads = data.reads && typeof data.reads === 'object' ? data.reads : {};
  return lastMs > timestampToMs(reads[uid]);
}

function unreadCountsMap(data) {
  const counts = data?.unreadCounts;
  return counts && typeof counts === 'object' && !Array.isArray(counts) ? counts : null;
}

export function hasStoredUnreadCount(data, uid) {
  const counts = unreadCountsMap(data);
  if (!counts || !uid) return false;
  return counts[uid] !== undefined && counts[uid] !== null;
}

/** Antall uleste meldinger for `uid`.
 * Hvis unreadCounts.{uid} finnes og er > 0, bruk det.
 * Hvis det er 0 (eller mangler), fall tilbake til lastAt/lastSenderId —
 * ellers blir badge stående på 0 når increment feilet etter en tidligere lesing.
 */
export function unreadCountForUser(data, uid) {
  if (!data || !uid) return 0;
  if (hasStoredUnreadCount(data, uid)) {
    const n = Math.max(0, Number(unreadCountsMap(data)[uid]) || 0);
    if (n > 0) return n;
  }
  return chatIsUnread(data, uid) ? 1 : 0;
}

export function otherDmMemberIds(chatId, senderUid) {
  if (!chatId || !String(chatId).startsWith('dm_')) return [];
  const rest = String(chatId).slice(3);
  const i = rest.indexOf('_');
  if (i <= 0) return [];
  const a = rest.slice(0, i);
  const b = rest.slice(i + 1);
  return uniqueMemberIds([a, b]).filter((id) => id && id !== senderUid);
}

/**
 * Finn hvem som skal varsles. Familie-/lag-chat bruker hele familien som fallback
 * hvis chat-dokumentet har mistet memberIds. DM bruker chatId.
 */
export function resolveChatRecipients({
  chatId,
  senderUid,
  memberIds = [],
  paramMemberIds = [],
  familyMemberIds = [],
  contextMemberIds = [],
} = {}) {
  const scoped = uniqueMemberIds([...memberIds, ...paramMemberIds]);
  const dmOthers = otherDmMemberIds(chatId, senderUid);
  if (dmOthers.length) {
    const fromScoped = scoped.filter((id) => id !== senderUid);
    return fromScoped.length ? fromScoped : dmOthers;
  }
  if (String(chatId || '').startsWith('g_')) {
    return scoped.filter((id) => id !== senderUid);
  }
  return uniqueMemberIds([...scoped, ...familyMemberIds, ...contextMemberIds])
    .filter((id) => id !== senderUid);
}

export function chatVisibleToUser(chatId, data, uid) {
  if (!uid) return false;
  if (chatId === 'family' || chatId === 'team') return true;
  const members = uniqueMemberIds(data?.memberIds);
  if (members.includes(uid)) return true;
  if (String(chatId).startsWith('dm_')) {
    const rest = String(chatId).slice(3);
    const i = rest.indexOf('_');
    if (i <= 0) return false;
    return rest.slice(0, i) === uid || rest.slice(i + 1) === uid;
  }
  return false;
}

/** Avsender eller admin kan endre/slette melding. */
export function canManageChatMessage(message, uid, isAdmin = false) {
  if (!message || message.deleted) return false;
  if (isAdmin) return true;
  if (!uid) return false;
  return message.senderId === uid;
}

/** Forhåndstekst til chat-listen / stamp. */
export function chatMessagePreview(message, imageFallback = '📷 Bilde') {
  if (!message || message.deleted) return '';
  const text = String(message.text || '').trim();
  if (message.type === 'image') return text || imageFallback;
  return text;
}
