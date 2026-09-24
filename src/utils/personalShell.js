/**
 * Personal shell — a real family document that lets solo users use the app
 * without an explicit "create family" step. Later they can promote it by
 * giving it a family name (same document, isPersonal → false).
 */

export const PERSONAL_SHELL_DEFAULT_NAME = 'Mitt hjem';
export const FAMILY_NUDGE_DELAY_MS = 3 * 60 * 1000;
export const FAMILY_NUDGE_SNOOZE_MS = 24 * 60 * 60 * 1000;
export const FAMILY_NUDGE_STORAGE_PREFIX = 'weekplan.familyNudge.v1';

/** Same-session flag so RootNav does not bounce back to the wizard before Firestore catches up. */
const homeSetupSessionDone = new Set();

export function markHomeSetupCompleteSession(uid) {
  if (uid) homeSetupSessionDone.add(uid);
}

export function isHomeSetupCompleteSession(uid) {
  return !!(uid && homeSetupSessionDone.has(uid));
}

export function isPersonalShell(group) {
  if (!group || typeof group !== 'object') return false;
  if (group.deleted === true || group.hiddenFromApp === true) return false;
  return group.isPersonal === true;
}

export function findPersonalShell(families = []) {
  return (families || []).find((f) => isPersonalShell(f)) || null;
}

export function hasNonPersonalGroup(families = []) {
  return (families || []).some((f) => {
    if (!f || f.deleted === true || f.hiddenFromApp === true) return false;
    if (f.archived === true || f.active === false) return false;
    return !isPersonalShell(f);
  });
}

export function personalShellDisplayName(profile) {
  const raw = String(
    profile?.displayName || profile?.name || '',
  ).trim();
  if (!raw) return PERSONAL_SHELL_DEFAULT_NAME;
  const first = raw.split(/\s+/)[0];
  return first ? `${first}s hjem` : PERSONAL_SHELL_DEFAULT_NAME;
}

/**
 * Ensure the user has a usable family workspace.
 * - Invited users who already have a group: no-op (returns existing).
 * - Solo users with no groups: create isPersonal shell.
 * - Solo users who already have a personal shell: return it.
 *
 * @param {object} opts.createGroupFn — injectable for tests; defaults to groups.createGroup
 */
export async function ensurePersonalShellForUser({
  user,
  profile,
  language = 'nb',
  existingFamilies = [],
  createGroupFn,
} = {}) {
  if (!user?.uid) throw new Error('missing-user');

  const live = (existingFamilies || []).filter(
    (f) => f
      && f.deleted !== true
      && f.hiddenFromApp !== true
      && f.archived !== true
      && f.active !== false,
  );

  if (live.length > 0) {
    const personal = findPersonalShell(live);
    const pick = personal || live[0];
    return {
      id: pick.id,
      family: pick,
      created: false,
      isPersonal: isPersonalShell(pick),
    };
  }

  const create = createGroupFn || (await import('./groups.js')).createGroup;
  const name = personalShellDisplayName(profile);
  const id = await create({
    name,
    type: 'family',
    language,
    user,
    profile,
    isPersonal: true,
  });

  return {
    id,
    family: {
      id,
      name,
      type: 'family',
      ownerUid: user.uid,
      adminUids: [user.uid],
      members: [user.uid],
      isPersonal: true,
      active: true,
      archived: false,
      deleted: false,
    },
    created: true,
    isPersonal: true,
  };
}

/** Name the personal shell and make it a normal family. */
export async function promotePersonalShell(familyId, { name } = {}) {
  const trimmed = String(name || '').trim();
  if (!familyId) throw new Error('missing-family');
  if (!trimmed) throw new Error('missing-name');

  const { updateGroup } = await import('./groups.js');
  const { serverTimestamp } = await import('firebase/firestore');
  await updateGroup(familyId, {
    name: trimmed,
    isPersonal: false,
    promotedAt: serverTimestamp(),
  });

  return { id: familyId, name: trimmed, isPersonal: false };
}

export function familyNudgeStorageKey(uid) {
  return `${FAMILY_NUDGE_STORAGE_PREFIX}.${uid}`;
}

export function shouldShowFamilyNudge({
  family,
  families = [],
  now = Date.now(),
  firstHomeAt = null,
  snoozedUntil = null,
  dismissed = false,
  minDelayMs = FAMILY_NUDGE_DELAY_MS,
  hasActivity = false,
} = {}) {
  if (dismissed) return false;
  if (hasNonPersonalGroup(families)) return false;
  if (!isPersonalShell(family)) return false;
  if (snoozedUntil && now < snoozedUntil) return false;
  if (!firstHomeAt) return false;
  const elapsed = now - firstHomeAt;
  if (elapsed < minDelayMs) return false;
  // Prefer showing after some real use; still allow pure time after 2× delay.
  if (!hasActivity && elapsed < minDelayMs * 2) return false;
  return true;
}

export async function markHomeSetupComplete(uid) {
  if (!uid) return;
  markHomeSetupCompleteSession(uid);
  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
  const { db } = await import('../../firebase.js');
  await setDoc(
    doc(db, 'users', uid),
    { homeSetupComplete: true, homeSetupCompletedAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function readFamilyDoc(familyId) {
  if (!familyId) return null;
  const { doc, getDoc } = await import('firebase/firestore');
  const { db } = await import('../../firebase.js');
  const snap = await getDoc(doc(db, 'families', familyId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() || {}) };
}

export async function touchPersonalShellSeen(familyId) {
  if (!familyId) return;
  try {
    const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('../../firebase.js');
    await updateDoc(doc(db, 'families', familyId), {
      personalShellLastSeenAt: serverTimestamp(),
    });
  } catch {
    /* non-blocking */
  }
}
