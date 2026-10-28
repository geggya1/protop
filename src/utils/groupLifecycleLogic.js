/** Group membership, deletion and subscription patches (no Firebase). */

import { hasContactInfo } from './accountContact.js';
import { normalizeUsername } from './usernamesLogic.js';

export function isSuperAdmin(family, uid) {
  return !!(uid && family && (family.ownerUid === uid || family.ownerId === uid));
}

export function isGroupAdmin(family, uid) {
  if (!uid || !family) return false;
  if (isSuperAdmin(family, uid)) return true;
  return Array.isArray(family.adminUids) && family.adminUids.includes(uid);
}

/**
 * Administrator i et lag (idrettslag, klubb). Samme kilde som serveren og reglene: eier og
 * adminUids (REV-19). admin/superAdmin på medlemsdokumentet teller ikke lenger der, så de gir
 * heller ikke admin-knapper her. parents tas imot for eldre kall, men brukes ikke.
 */
// eslint-disable-next-line no-unused-vars
export function isTeamAdmin(team, uid, parents = []) {
  return isGroupAdmin(team, uid);
}

/** Rolle for voksne i familien: foresatt eller besteforeldre. */
export function normalizeAdultRole(value, { asGrandparent = false } = {}) {
  if (value === 'grandparent' || asGrandparent === true) return 'grandparent';
  return 'parent';
}

export function isGroupDeleted(group) {
  return group?.deleted === true || group?.hiddenFromApp === true;
}

export function isGroupDeactivated(group) {
  if (!group || isGroupDeleted(group)) return false;
  return group.archived === true || group.active === false;
}

export function deactivateGroupPatch() {
  return {
    archived: true,
    active: false,
  };
}

export function reactivateGroupPatch() {
  return {
    archived: false,
    active: true,
    deleted: false,
    hiddenFromApp: false,
  };
}

/**
 * Slett i appen = skjul gruppen og avslutt abonnementet.
 * Dokumentet beholdes. Join-kode fjernes så nye medlemmer ikke kan bli med.
 */
export function deleteGroupPatch(prev = {}) {
  return {
    deleted: true,
    active: false,
    archived: true,
    hiddenFromApp: true,
    subscriptionStatus: 'cancelled',
    subscriptionCancelReason: 'group_deleted',
    joinCode: null,
    joinCodePrevious: prev.joinCode || prev.joinCodePrevious || null,
  };
}

export function canChangeBilling(family, uid) {
  return isSuperAdmin(family, uid) && !isGroupDeleted(family);
}

/**
 * Documents written by createGroup, without server timestamps.
 * familyIds on the root parent/user docs are applied with arrayUnion at write time.
 */
export function buildNewFamilyRecords({
  name,
  type = 'family',
  language = 'nb',
  user,
  profile = {},
  isPersonal = false,
  familyId,
}) {
  const email = String(user?.email || '').toLowerCase();
  const personal = !!isPersonal;
  const displayName = profile?.displayName || profile?.name || user?.displayName || (email ? email.split('@')[0] : '');
  const family = {
    name,
    type: type || 'family',
    language: language || 'nb',
    ownerUid: user.uid,
    adminUids: [user.uid],
    members: [user.uid],
    moduleAccess: {},
    moduleAccessInitialized: true,
    active: true,
    archived: false,
    deleted: false,
    isPersonal: personal,
    photoURL: profile?.photoURL || null,
    avatarId: profile?.avatarId || (personal ? 'fox' : 'home'),
  };
  const parent = {
    uid: user.uid,
    email,
    phone: profile?.phone || '',
    name: displayName,
    username: profile?.username || '',
    usernameLower: profile?.usernameLower || '',
    admin: true,
    superAdmin: true,
    active: true,
    archived: false,
    placeholder: false,
    emailVerified: !!user.emailVerified,
    photoURL: profile?.photoURL || user?.photoURL || '',
    avatarId: profile?.avatarId || null,
    gender: profile?.gender || null,
    birthday: profile?.birthday || null,
    age: profile?.age ?? null,
    location: profile?.location || null,
  };
  return { family, parent, familyId: familyId || null };
}

export function buildChildMemberRecord({
  uid,
  name,
  username,
  birthday = null,
  age = null,
  gender = null,
  location = null,
  phone = '',
  email = '',
  photoURL = '',
  avatarId = 'fox',
  familyId,
  createdBy,
  authEmail,
}) {
  const uname = normalizeUsername(username);
  return {
    uid,
    name: String(name || '').trim(),
    username: uname,
    usernameLower: uname,
    usernameEmail: authEmail,
    birthday: birthday || null,
    age: age ?? null,
    gender: gender || null,
    location: location || null,
    phone: phone || '',
    email: String(email || '').toLowerCase(),
    photoURL: photoURL || '',
    avatarId: avatarId || 'fox',
    familyId,
    createdBy,
    active: true,
    archived: false,
    deleted: false,
    linkedParents: createdBy ? [createdBy] : [],
    rewardMode: 'points',
  };
}

/** Keep a contact profile, or wipe the member doc and free the username. */
export function memberRemovalPlan({ role, member, wipePersonal = false } = {}) {
  const id = member?.uid || member?.id || null;
  const keepProfile = hasContactInfo(member?.email, member?.phone) && !wipePersonal;
  return {
    id,
    collection: role === 'child' ? 'children' : 'parents',
    keepProfile,
    username: keepProfile ? '' : normalizeUsername(member?.username || member?.usernameLower || ''),
  };
}

export function listMemberOnFamily(family, uid) {
  const next = { ...(family || {}) };
  for (const key of ['members', 'activeUsers']) {
    const list = Array.isArray(next[key]) ? next[key] : [];
    next[key] = list.includes(uid) ? list : [...list, uid];
  }
  return next;
}

export function revokeMemberOnFamily(family, uid) {
  const next = { ...(family || {}) };
  for (const key of ['members', 'adminUids', 'activeUsers', 'memberIds']) {
    const list = Array.isArray(next[key]) ? next[key] : [];
    next[key] = list.filter((id) => id !== uid);
  }
  return next;
}
