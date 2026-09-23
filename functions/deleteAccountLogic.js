/** Must match src/utils/deleteAccount.js. Reviewers type this in any language. */
export const DELETE_CONFIRM = 'DELETE';

export function isDeleteConfirmed(value) {
  return String(value || '').trim().toUpperCase() === DELETE_CONFIRM;
}

function uniqueIds(list) {
  return [...new Set((list || []).map((id) => String(id || '').trim()).filter(Boolean))];
}

/** Drop uid from an array or a uid-keyed map. Null becomes []. */
export function withoutUid(value, uid) {
  if (Array.isArray(value)) return value.filter((id) => id && id !== uid);
  if (value && typeof value === 'object') {
    const next = { ...value };
    delete next[uid];
    return next;
  }
  return [];
}

/**
 * How to leave one family when the auth user deletes their account.
 * No other live adults → archive the family (do not strand it).
 * Other adults → transfer ownership if this user owns or admins it.
 */
export function planFamilyExit(uid, family) {
  const data = family?.data || {};
  const others = uniqueIds(family?.otherLiveParentUids).filter((id) => id !== uid);
  const owns = data.ownerUid === uid
    || data.ownerId === uid
    || data.createdBy === uid
    || data.adminUid === uid
    || (Array.isArray(data.adminUids) && data.adminUids.includes(uid));

  if (!others.length) {
    return { familyId: family?.id || null, action: 'archive', nextOwner: null };
  }

  const otherAdmins = uniqueIds([
    ...(Array.isArray(data.adminUids) ? data.adminUids : []),
    data.ownerUid,
    data.ownerId,
    data.adminUid,
  ]).filter((id) => id !== uid && others.includes(id));

  return {
    familyId: family?.id || null,
    action: 'leave',
    nextOwner: owns ? (otherAdmins[0] || others[0]) : null,
  };
}
