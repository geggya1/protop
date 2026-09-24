/**
 * Synlighet, deling og hemmelige reservasjoner for ønskelister.
 * Ren logikk — ingen Firebase-import (trygg for node-tester).
 */

const RESERVATION_KEYS = [
  'reservedByUid', 'reservedByName', 'reservedAt',
  'purchasedByUid', 'purchasedByName', 'purchasedAt',
  'status',
];

export function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

export function memberUids(members) {
  return uniqueIds((members || []).map((m) => m?.uid));
}

export function memberAliases(member) {
  if (!member) return [];
  return uniqueIds([member.uid, member.id, member.docId, member.childId]);
}

export function isFamilySharedWishlist(list) {
  if (!list || list.deleted) return false;
  return list.scope === 'family' || list.kind === 'family_shared';
}

/** Personen listen «handler om» — skal ikke se reservasjon/kjøp. */
export function isWishlistSubject(list, { uid, childId } = {}) {
  if (!list) return false;
  if (isFamilySharedWishlist(list)) return false;
  if (childId && list.forChildId === childId) return true;
  if (uid && list.forMemberUid && list.forMemberUid === uid) return true;
  if (!list.forChildId && uid && (list.subjectUid === uid || list.ownerUid === uid)) return true;
  return false;
}

/** Uid-er som ikke skal se/få vite om reservasjoner. */
export function wishlistSecretUids(list) {
  if (!list) return [];
  return uniqueIds([
    list.subjectUid,
    list.ownerUid,
    list.forMemberUid,
    (list.createdBy && (list.createdBy === list.subjectUid
      || list.createdBy === list.ownerUid
      || list.createdBy === list.forMemberUid))
      ? list.createdBy
      : null,
  ]);
}

/** Skjul reservasjons- og kjøpsstatus helt (badge, hvem, antall). */
export function shouldHideReservations(list, { uid, childId } = {}) {
  if (!list || !uid) return false;
  if (isFamilySharedWishlist(list)) return false;
  if (isWishlistSubject(list, { uid, childId })) return true;
  if (!list.forChildId
    && list.createdBy === uid
    && (list.ownerUid === uid || !list.forMemberUid)) {
    return true;
  }
  return false;
}

export function canEditWishContent(list, {
  uid, childId, isAdmin, isParent = false, isChild = false, isActingAsChild = false,
} = {}) {
  if (!list || !uid) return false;
  if (isFamilySharedWishlist(list)) {
    return !!(isParent || isAdmin || isChild || isActingAsChild);
  }
  if (isWishlistSubject(list, { uid, childId })) return true;
  if (list.createdBy === uid) return true;
  if (isAdmin) return true;
  return false;
}

/** Reserver / fjern egen reservasjon — aldri listen-subjektet. */
export function canReserveWish(list, item, {
  uid, childId,
} = {}) {
  if (!list || !item || !uid) return false;
  if (isWishlistSubject(list, { uid, childId })) return false;
  if (shouldHideReservations(list, { uid, childId })) return false;
  if (item.purchasedByUid && item.purchasedByUid !== uid) return false;
  if (item.reservedByUid && item.reservedByUid !== uid) return false;
  return true;
}

/** Marker som kjøpt — samme personer som kan reservere, og eieren av reservasjonen. */
export function canPurchaseWish(list, item, {
  uid, childId,
} = {}) {
  if (!list || !item || !uid) return false;
  if (isWishlistSubject(list, { uid, childId })) return false;
  if (shouldHideReservations(list, { uid, childId })) return false;
  if (item.purchasedByUid && item.purchasedByUid !== uid) return false;
  if (item.reservedByUid && item.reservedByUid !== uid) return false;
  return true;
}

export function canManageWishlist(list, actor = {}) {
  if (!list || !actor?.uid) return false;
  if (isFamilySharedWishlist(list)) {
    if (actor.isChild || actor.isActingAsChild || actor.childId) return false;
    if (actor.isAdmin || list.createdBy === actor.uid) return true;
    return false;
  }
  if (canEditWishContent(list, actor)) return true;
  return false;
}

/** Eier/oppretter kan velge hvem som ser listen. */
export function canShareWishlist(list, actor = {}) {
  if (!list || !actor?.uid) return false;
  if (isFamilySharedWishlist(list)) {
    return !!(actor.isAdmin || list.createdBy === actor.uid || actor.isParent)
      && !actor.isChild && !actor.isActingAsChild;
  }
  return canManageWishlist(list, actor);
}

export function wishlistOwnerLabel(list) {
  if (!list) return '';
  if (isFamilySharedWishlist(list)) return 'Hele familien';
  if (list.forChildName) return list.forChildName;
  if (list.forMemberName) return list.forMemberName;
  return list.createdByName || 'Familie';
}

/**
 * private | family | shared
 * Eldre lister uten felt behandles som synlige for familien.
 */
export function wishlistVisibilityMode(list) {
  if (!list) return 'family';
  if (isFamilySharedWishlist(list)) return 'family';
  if (list.published === false) return 'private';
  const vis = list.visibility || 'family';
  if (vis === 'private' || vis === 'shared' || vis === 'family') return vis;
  return 'family';
}

export function isWishlistDraft(list) {
  if (!list || isFamilySharedWishlist(list)) return false;
  return list.published === false || wishlistVisibilityMode(list) === 'private';
}

function actorIdSet(actor = {}) {
  return new Set(uniqueIds([
    actor.uid,
    actor.childId,
    ...(actor.ids || []),
  ]));
}

function listTouchesActor(list, ids) {
  if (!list || !ids?.size) return false;
  const keys = uniqueIds([
    list.subjectUid,
    list.ownerUid,
    list.createdBy,
    list.forMemberUid,
    list.forChildId,
    ...(list.viewerUids || []),
  ]);
  return keys.some((id) => ids.has(id));
}

/**
 * Kan denne brukeren se listen (hub-filter)?
 * Kryss-familie: uid i viewerUids, eller aktiv familie i sharedFamilyIds.
 */
export function canViewWishlist(list, actor = {}) {
  if (!list || list.deleted) return false;
  const uid = actor.uid;
  if (!uid) return false;
  const ids = actorIdSet(actor);
  const hostFamilyId = list.familyId || actor.familyId || null;
  const inHostFamily = !hostFamilyId || !actor.familyId || hostFamilyId === actor.familyId;
  const sharedFamilies = Array.isArray(list.sharedFamilyIds) ? list.sharedFamilyIds : [];
  const inSharedFamily = !!(actor.familyId && sharedFamilies.includes(actor.familyId));
  const viewers = Array.isArray(list.viewerUids) ? list.viewerUids : [];
  const listedViewer = viewers.some((id) => ids.has(id));

  if (isWishlistSubject(list, actor) || list.createdBy === uid || list.ownerUid === uid) {
    return true;
  }
  if (listedViewer) return true;

  // Besteforeldre ser kun lister de er eksplisitt invitert til (viewerUids / eierskap).
  if (actor.isGrandparent) return false;

  const mode = wishlistVisibilityMode(list);
  if (mode === 'private') {
    return listTouchesActor(list, ids);
  }

  if (inSharedFamily) return true;

  if (!inHostFamily) {
    return false;
  }

  if (mode === 'family' || isFamilySharedWishlist(list)) {
    return true;
  }

  if (mode === 'shared') {
    if (!viewers.length) return true;
    return listedViewer;
  }
  return false;
}

/** Uid-er som faktisk skal kunne se listen. */
export function resolveWishlistViewerIds(list, {
  members = [],
  familyId = null,
  families = [],
} = {}) {
  if (!list) return [];
  const mode = wishlistVisibilityMode(list);
  const hostId = list.familyId || familyId;
  const ownerIds = uniqueIds([
    list.subjectUid,
    list.ownerUid,
    list.createdBy,
    list.forMemberUid,
  ]);

  if (mode === 'private') {
    return uniqueIds([...(list.viewerUids || []), ...ownerIds]);
  }

  const fromDoc = uniqueIds(list.viewerUids);
  const familyMembers = memberUids(members);
  const extraFamilyUids = [];
  for (const fid of (list.sharedFamilyIds || [])) {
    const fam = (families || []).find((f) => f.id === fid);
    if (!fam) continue;
    extraFamilyUids.push(...(fam.members || fam.memberIds || []));
  }

  if (mode === 'family' || isFamilySharedWishlist(list)) {
    return uniqueIds([
      ...familyMembers,
      ...fromDoc,
      ...extraFamilyUids,
      ...ownerIds,
    ]);
  }

  return uniqueIds([
    ...fromDoc,
    ...ownerIds,
    ...extraFamilyUids,
  ]);
}

function findMember(members, id) {
  if (!id) return null;
  return (members || []).find((m) => memberAliases(m).includes(id)) || null;
}

/**
 * Personer som skal vises som «hvem ser listen».
 * Returnerer { mode, people, label, extraFamilyNames, draft }.
 */
export function resolveWishlistViewers(list, {
  members = [],
  familyId = null,
  families = [],
} = {}) {
  const mode = wishlistVisibilityMode(list);
  const draft = isWishlistDraft(list);
  const extraFamilyNames = (list?.sharedFamilyIds || [])
    .map((fid) => (families || []).find((f) => f.id === fid))
    .filter((f) => f && f.id !== (list.familyId || familyId))
    .map((f) => f.name || 'Annen familie');

  if (draft && mode === 'private' && !(list?.sharedFamilyIds || []).length) {
    const ownerId = list?.subjectUid || list?.ownerUid || list?.createdBy;
    const owner = findMember(members, ownerId);
    const people = owner ? [owner] : [];
    return {
      mode: 'private',
      draft: true,
      people,
      extraFamilyNames: [],
      label: 'Kun du',
    };
  }

  const ids = resolveWishlistViewerIds(list, { members, familyId, families });
  const people = [];
  const seen = new Set();
  for (const id of ids) {
    const m = findMember(members, id);
    if (!m) continue;
    const key = m.uid || m.id || m.childId;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    people.push(m);
  }

  if (mode === 'family' || isFamilySharedWishlist(list)) {
    const familyLabel = extraFamilyNames.length
      ? `Familien + ${extraFamilyNames.join(', ')}`
      : 'Hele familien';
    return {
      mode: 'family',
      draft: false,
      people,
      extraFamilyNames,
      label: familyLabel,
    };
  }

  const names = people
    .map((m) => (m.name || '').split(' ')[0] || 'Ukjent')
    .slice(0, 3);
  let label = names.join(', ') || 'Utvalgte';
  if (people.length > 3) label = `${names.join(', ')} +${people.length - 3}`;
  if (extraFamilyNames.length) {
    label = label === 'Utvalgte'
      ? extraFamilyNames.join(', ')
      : `${label} · ${extraFamilyNames.join(', ')}`;
  }

  return {
    mode: 'shared',
    draft: false,
    people,
    extraFamilyNames,
    label,
  };
}

export function wishlistShareHint(viewers) {
  if (!viewers) return '';
  if (viewers.draft) return 'Kun du ser listen. Del den når du er ferdig.';
  if (viewers.mode === 'family') {
    return viewers.extraFamilyNames?.length
      ? `Synlig for egen familie og ${viewers.extraFamilyNames.join(', ')}.`
      : 'Synlig for hele familien.';
  }
  return `Synlig for ${viewers.label}.`;
}

export function shareStateFromList(list, { uid, members = [] } = {}) {
  const mode = wishlistVisibilityMode(list);
  const ownerIds = uniqueIds([
    list?.subjectUid,
    list?.ownerUid,
    list?.createdBy,
    uid,
  ]);
  if (mode === 'private') {
    return {
      mode: 'private',
      viewerUids: uniqueIds([...(list?.viewerUids || []), ...ownerIds]),
      sharedFamilyIds: [...(list?.sharedFamilyIds || [])],
      published: false,
    };
  }
  if (mode === 'shared') {
    return {
      mode: 'shared',
      viewerUids: uniqueIds([...(list?.viewerUids || []), ...ownerIds]),
      sharedFamilyIds: [...(list?.sharedFamilyIds || [])],
      published: true,
    };
  }
  return {
    mode: 'family',
    viewerUids: uniqueIds([
      ...memberUids(members),
      ...(list?.viewerUids || []),
      ...ownerIds,
    ]),
    sharedFamilyIds: [...(list?.sharedFamilyIds || [])],
    published: true,
  };
}

/**
 * Patch som lagres når eieren velger hvem som ser listen.
 * otherFamilyMemberUids: uid-er fra familier som deles på tvers.
 */
export function buildWishlistSharePatch({
  mode,
  viewerUids = [],
  sharedFamilyIds = [],
  uid,
  ownerIds = [],
  familyMemberUids = [],
  otherFamilyMemberUids = [],
} = {}) {
  const owners = uniqueIds([...ownerIds, uid]);
  const extras = uniqueIds(otherFamilyMemberUids);
  const families = uniqueIds(sharedFamilyIds);

  if (mode === 'private' && !families.length) {
    return {
      visibility: 'private',
      published: false,
      viewerUids: owners,
      sharedFamilyIds: [],
    };
  }

  if (mode === 'family') {
    return {
      visibility: 'family',
      published: true,
      viewerUids: uniqueIds([...familyMemberUids, ...owners, ...extras]),
      sharedFamilyIds: families,
    };
  }

  return {
    visibility: 'shared',
    published: true,
    viewerUids: uniqueIds([...viewerUids, ...owners, ...extras]),
    sharedFamilyIds: families,
  };
}

export function defaultCreateVisibility({
  scope = null,
  forChildId = null,
  uid,
  members = [],
} = {}) {
  if (scope === 'family') {
    return {
      visibility: 'family',
      published: true,
      viewerUids: memberUids(members),
      sharedFamilyIds: [],
    };
  }
  if (forChildId) {
    const parents = (members || []).filter((m) => m.role !== 'child').map((m) => m.uid);
    const child = (members || []).find((m) => (
      m.childId === forChildId || m.id === forChildId || m.docId === forChildId
    ));
    return {
      visibility: 'family',
      published: true,
      viewerUids: uniqueIds([...parents, child?.uid, uid]),
      sharedFamilyIds: [],
    };
  }
  return {
    visibility: 'private',
    published: false,
    viewerUids: uniqueIds([uid]),
    sharedFamilyIds: [],
  };
}

export function splitWishlists(lists, { uid, profileChildId, familyId } = {}) {
  const mine = [];
  const family = [];
  const familyShared = [];
  const fromOthers = [];
  for (const list of lists || []) {
    const hostId = list.familyId || familyId;
    const fromOtherFamily = !!(familyId && hostId && hostId !== familyId);
    if (fromOtherFamily) {
      fromOthers.push(list);
      continue;
    }
    if (isFamilySharedWishlist(list)) {
      familyShared.push(list);
      continue;
    }
    if (profileChildId) {
      if (list.forChildId === profileChildId) mine.push(list);
      continue;
    }
    const aboutMe = !list.forChildId && (
      list.forMemberUid === uid
      || list.subjectUid === uid
      || (list.ownerUid === uid && !list.forMemberUid)
    );
    if (aboutMe) mine.push(list);
    else family.push(list);
  }
  return { mine, family, familyShared, fromOthers };
}

/**
 * Bygg «Delt med meg»-rader: peilere fra venner (pålitelig tittel) + kryss-familie docs.
 * Pekere er primærkilde slik at listen alltid får eget navn hos mottakeren.
 */
export function mergeSharedWishlistsForHub(sharedPointers = [], fromOthers = []) {
  const byId = new Map();
  for (const sw of sharedPointers || []) {
    const listId = sw.listId || sw.id;
    if (!listId) continue;
    const who = (sw.sharedByName || '').trim();
    byId.set(listId, {
      id: listId,
      name: sw.title || 'Ønskeliste',
      familyId: sw.familyId || null,
      itemCount: sw.itemCount != null ? sw.itemCount : null,
      sourceFamilyName: who ? `Delt av ${who}` : 'Delt av venn',
      sharedBy: sw.sharedBy || null,
      sharedByName: who || null,
      crossFamily: true,
      sharedByFriend: true,
    });
  }
  for (const list of fromOthers || []) {
    if (!list?.id) continue;
    const prev = byId.get(list.id);
    const who = prev?.sharedByName || null;
    byId.set(list.id, {
      ...list,
      name: list.name || prev?.name || 'Ønskeliste',
      familyId: list.familyId || prev?.familyId || null,
      sourceFamilyName: who
        ? `Delt av ${who}`
        : (prev?.sourceFamilyName || list.sourceFamilyName || 'Delt med deg'),
      sharedBy: prev?.sharedBy || list.sharedBy || null,
      sharedByName: who,
      crossFamily: true,
      sharedByFriend: prev?.sharedByFriend !== false,
    });
  }
  return [...byId.values()];
}

export function stripReservationFields(item) {
  if (!item) return item;
  const next = { ...item };
  for (const key of RESERVATION_KEYS) {
    delete next[key];
  }
  return next;
}

export function pickReservationFields(source) {
  if (!source) return {};
  const out = {};
  for (const key of RESERVATION_KEYS) {
    if (source[key] != null) out[key] = source[key];
  }
  return out;
}

export function wishReservationStatus(item) {
  if (!item) return null;
  if (item.purchasedByUid || item.status === 'purchased') return 'purchased';
  if (item.reservedByUid || item.status === 'reserved') return 'reserved';
  return null;
}

export function mergeWishSecrets(items, secrets, { hideReservations = false } = {}) {
  const byId = new Map((secrets || []).map((s) => [s.id, s]));
  return (items || []).map((item) => {
    const secret = byId.get(item.id);
    const merged = secret
      ? { ...item, ...pickReservationFields(secret) }
      : item;
    if (hideReservations) return stripReservationFields(merged);
    return merged;
  });
}

export function hasLegacyReservationFields(item) {
  if (!item) return false;
  return !!(item.reservedByUid || item.purchasedByUid);
}

export function reservationWhoLabel(item, uid) {
  const status = wishReservationStatus(item);
  if (!status) return '';
  if (status === 'purchased') {
    if (item.purchasedByUid === uid) return 'Du har kjøpt';
    return item.purchasedByName ? `Kjøpt av ${item.purchasedByName}` : 'Kjøpt';
  }
  if (item.reservedByUid === uid) return 'Du har reservert';
  return item.reservedByName ? `Reservert av ${item.reservedByName}` : 'Reservert';
}
