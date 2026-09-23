/**
 * Resolve Firebase Auth UIDs for game (and similar) invites.
 * Never fall back to child/parent Firestore doc ids — those are not Auth UIDs
 * and writes land under users/{docId}/… where the invitee never listens.
 */

/** Firebase Auth UIDs are typically ~28 chars; Firestore auto-ids are 20. */
export function looksLikeAuthUid(value) {
  const s = String(value || '').trim();
  // Exclude 20-char Firestore auto-ids commonly used as child/parent doc ids.
  if (!s || s.length < 27 || s.length > 128) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return false;
  return true;
}

/**
 * Prefer the first candidate that looks like a Firebase Auth UID.
 * Falls back to the first non-empty value when none look like Auth UIDs.
 */
export function preferAuthUid(...candidates) {
  for (const c of candidates) {
    if (looksLikeAuthUid(c)) return String(c).trim();
  }
  for (const c of candidates) {
    const s = String(c || '').trim();
    if (s) return s;
  }
  return null;
}

/**
 * Auth uid to invite, or null if this member cannot receive inbox/push invites.
 * - Parents/friends: prefer uid / friendUid / docId when Auth-shaped
 * - Children: only when they have a linked Auth account (uid ≠ child doc id)
 */
export function memberInviteAuthUid(member) {
  if (!member || typeof member !== 'object') return null;

  if (member.role === 'friend' || member.isFriend) {
    const id = preferAuthUid(member.friendUid, member.uid, member.id, member.docId);
    return looksLikeAuthUid(id) ? id : null;
  }

  if (member.role === 'child') {
    const docId = member.docId || member.childId || member.id;
    const linked = member.uid && docId && member.uid !== docId ? member.uid : null;
    // Some children store auth uid on `uid` while id is also auth (rare)
    if (linked && looksLikeAuthUid(linked)) return linked;
    if (member.uid && looksLikeAuthUid(member.uid) && member.uid !== docId) return member.uid;
    // Child doc keyed by Auth UID (uid === id === docId)
    if (looksLikeAuthUid(member.uid) && member.uid === docId) return member.uid;
    return null;
  }

  // parent / adult — docId is often the real Auth UID when `uid` is a stale invite key
  const id = preferAuthUid(member.uid, member.id, member.docId);
  return looksLikeAuthUid(id) ? id : null;
}

export function filterInvitableMembers(members = []) {
  return (members || []).filter((m) => !!memberInviteAuthUid(m));
}

/** Family members (excl. self) who can receive Auth-UID game invites. */
export function inviteableFamilyMembers(members = [], hostUid = null) {
  return filterInvitableMembers(members).filter((m) => {
    const id = memberInviteAuthUid(m);
    return id && id !== hostUid;
  });
}

/** Friend list entries that can receive Auth-UID game invites. */
export function inviteableFriends(friends = [], hostUid = null) {
  return filterInvitableMembers(
    (friends || []).map((f) => ({ ...f, role: f.role || 'friend', isFriend: true })),
  ).filter((m) => {
    const id = memberInviteAuthUid(m);
    return id && id !== hostUid;
  });
}

export function normalizeInviteAuthUids(ids = [], hostUid = null) {
  return [...new Set(
    (ids || [])
      .map((id) => String(id || '').trim())
      .filter((id) => looksLikeAuthUid(id) && id !== hostUid),
  )];
}
