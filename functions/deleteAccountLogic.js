import { isOrganizationType } from '../src/utils/groupTypes.js';

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

function listHas(value, uid) {
  if (Array.isArray(value)) return value.includes(uid);
  return !!(value && typeof value === 'object' && value[uid]);
}

/**
 * Er uid medlem etter selskapsdokumentet (eier, medlemslister eller adminUids)?
 * familyIds på users/{uid} og parents/{uid} skriver brukeren selv, og teller ikke.
 */
export function isServerMember(data, uid) {
  if (!data || !uid) return false;
  if (data.ownerUid === uid || data.ownerId === uid) return true;
  return ['members', 'activeUsers', 'memberIds', 'adminUids'].some((key) => listHas(data[key], uid));
}

/** Bedrift (ikke familie eller lag): type 'organization' eller 'company', eller et firmanavn (REV-20). */
export function isCompanyGroup(data) {
  return isOrganizationType(data?.type) || !!data?.company?.navn;
}

/**
 * How to leave one family when the auth user deletes their account.
 * Not a member according to the family document → 'skip' (the family is not touched).
 * No other live adults → archive the family (do not strand it).
 * Other adults → transfer ownership if this user owns or admins it.
 * Last person in a company with issued invoices → blocked: the accounting records must
 * stay available for five years (bokføringsloven § 13), so the account is not deleted.
 */
export function planFamilyExit(uid, family) {
  const data = family?.data || {};
  if (!isServerMember(data, uid)) {
    return { familyId: family?.id || null, action: 'skip', nextOwner: null };
  }
  const others = uniqueIds(family?.otherLiveParentUids).filter((id) => id !== uid);
  // createdBy og adminUid kan medlemmer skrive selv. Bare eier og adminUids teller.
  const owns = data.ownerUid === uid
    || data.ownerId === uid
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
