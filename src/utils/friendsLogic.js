/** Pure helpers for peer friendships (no Firebase imports). */

export function friendshipPairId(uidA, uidB) {
  return [String(uidA || ''), String(uidB || '')].filter(Boolean).sort().join('_');
}

export function friendChatId(uidA, uidB) {
  const pair = friendshipPairId(uidA, uidB);
  return pair ? `dm_${pair}` : '';
}

/** Extract the other member's uid from `dm_{uidA}_{uidB}` (uids sorted). */
export function otherUidFromFriendChatId(chatId, myUid) {
  const raw = String(chatId || '').replace(/^dm_/, '');
  const mine = String(myUid || '');
  if (!raw || !mine) return null;
  if (raw.startsWith(`${mine}_`)) return raw.slice(mine.length + 1) || null;
  if (raw.endsWith(`_${mine}`)) return raw.slice(0, -(mine.length + 1)) || null;
  return null;
}

function truthyFlag(v) {
  return v === true || v === 'true' || v === '1' || v === 1;
}

/**
 * Whether a notification / dock payload should open friendChats (not family chats).
 * Messages + inbox body can succeed while the UI listens under families/... if this
 * is wrong — classic "varsel viser teksten, chatten er tom".
 */
export function isFriendChatNavPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.kind === 'friend') return true;
  if (truthyFlag(payload.friendChat)) return true;
  if (payload.friendUid) return true;
  const notifId = String(payload.notificationId || payload.id || '');
  if (notifId.startsWith('friendChat_')) return true;
  // Friend Admin inbox rows omit familyId; family DM notifs usually include it.
  const chatId = String(payload.chatId || '');
  if (chatId.startsWith('dm_') && !payload.familyId) return true;
  return false;
}

/** Resolve the other peer uid for a friend-chat navigation payload. */
export function friendUidFromNavPayload(payload = {}, myUid = null) {
  if (payload?.friendUid) return String(payload.friendUid);
  const createdBy = payload?.createdBy ? String(payload.createdBy) : '';
  if (createdBy && myUid && createdBy !== String(myUid)) return createdBy;
  return otherUidFromFriendChatId(payload?.chatId, myUid);
}

export function friendInviteAcceptUrl({ requestId, token } = {}) {
  const rid = encodeURIComponent(String(requestId || ''));
  const tok = encodeURIComponent(String(token || ''));
  if (tok) return `https://www.protop.no/friend-invite/${rid}?token=${tok}`;
  return `https://www.protop.no/friend-invite/${rid}`;
}

/**
 * Whose personal friends to show for the active profile.
 * - Parent on parent profile → parent auth uid
 * - Parent acting as child → that child's Auth uid (never the parent's)
 * - Child logged in → child auth uid (isActingAsChild is false)
 * Returns null when acting as a child who has no Auth uid yet (no friends graph).
 */
export function friendProfileOwnerUid({
  authUid = null,
  isActingAsChild = false,
  childUid = null,
} = {}) {
  if (isActingAsChild) {
    const c = String(childUid || '').trim();
    return c || null;
  }
  const self = String(authUid || '').trim();
  return self || null;
}

/**
 * True when the signed-in user may invite/remove friends on the viewed profile.
 * - Own graph: auth uid === owner uid
 * - Parent acting as child: may manage that child's graph (backend enforces family)
 */
export function canMutatePersonalFriends({
  authUid = null,
  friendOwnerUid = null,
  isActingAsChild = false,
} = {}) {
  const a = String(authUid || '').trim();
  const o = String(friendOwnerUid || '').trim();
  if (!a || !o) return false;
  if (a === o) return true;
  return !!isActingAsChild;
}

/** @deprecated Prefer friendProfileOwnerUid — kept for older imports during rollout. */
export function showPersonalFriends({ isActingAsChild } = {}) {
  return !isActingAsChild;
}

export function normalizeFriendUsername(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24);
}

/** Deep link / QR: skann for å legge til venn via @brukernavn. */
export function friendAddByUsernameUrl(username) {
  const u = normalizeFriendUsername(username);
  if (!u) return 'https://www.protop.no/add-friend';
  return `https://www.protop.no/add-friend/${encodeURIComponent(u)}`;
}

export function parseFriendAddUsername(pathOrUrl) {
  const raw = String(pathOrUrl || '');
  if (!raw) return '';

  const readParts = () => {
    if (/^https?:\/\//i.test(raw) || raw.startsWith('//')) {
      const url = new URL(raw, 'https://www.protop.no');
      return { pathname: String(url.pathname || ''), search: url.search || '' };
    }
    return {
      pathname: (raw.split('?')[0] || '').replace(/^https?:\/\/[^/]+/i, ''),
      search: raw.includes('?') ? raw.slice(raw.indexOf('?')) : '',
    };
  };

  try {
    const { pathname, search } = readParts();
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    const explicit = normalizeFriendUsername(params.get('addFriend') || '');
    const alias = normalizeFriendUsername(params.get('username') || params.get('u') || '');
    const isAddFriendPath = /\/add-friend(?:\.html)?(?:\/|$)/i.test(pathname);
    const m = String(pathname || '').match(/\/add-friend(?:\.html)?\/@?([^/?#]+)/i);
    if (m) {
      try {
        return normalizeFriendUsername(decodeURIComponent(m[1])) || explicit || alias;
      } catch {
        return normalizeFriendUsername(m[1]) || explicit || alias;
      }
    }
    if (explicit) return explicit;
    if (isAddFriendPath) return alias;
    return '';
  } catch {
    return '';
  }
}
