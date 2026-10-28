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

/** Bedrift (ikke familie eller lag). */
export function isCompanyGroup(data) {
  return data?.type === 'organization' || !!data?.company?.navn;
}

/**
 * How to leave one family when the auth user deletes their account.
 * No other live adults → archive the family (do not strand it).
 * Other adults → transfer ownership if this user owns or admins it.
 * Last person in a company with issued invoices → blocked: the accounting records must
 * stay available for five years (bokføringsloven § 13), so the account is not deleted.
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
    if (isCompanyGroup(data) && family?.hasAccounting === true) {
      return { familyId: family?.id || null, action: 'blocked', reason: 'accounting', nextOwner: null };
    }
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

/** Melding når kontoen ikke kan slettes fordi regnskapet ellers blir utilgjengelig. */
export function accountingBlockMessage(names = []) {
  const list = uniqueIds(names).map((name) => `«${name}»`).join(', ') || 'bedriften';
  return `Kontoen kan ikke slettes ennå. Du er den siste i ${list}, som har utstedte fakturaer. `
    + 'Bokføringsloven krever at regnskapet oppbevares i fem år. Inviter en annen person og gi '
    + 'vedkommende administratortilgang før du sletter kontoen, eller kontakt support@protop.no.';
}

/** Google-kalenderkoblinger som har et token som kan trekkes tilbake. */
export function googleTokensToRevoke(connections = []) {
  const tokens = [];
  for (const row of connections || []) {
    if (row?.type !== 'google') continue;
    const token = String(row.refreshToken || row.accessToken || '').trim();
    if (token) tokens.push(token);
  }
  return [...new Set(tokens)];
}
