/**
 * Synlighet for familiealbum — speiler ønskeliste-modellen (forenklet).
 * private | family | shared
 * Eldre album uten felt behandles som family (alle i familien).
 */

export function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

export function memberUids(members = []) {
  return uniqueIds((members || []).map((m) => m?.uid || m?.id));
}

export function albumVisibilityMode(album) {
  if (!album) return 'family';
  const vis = album.visibility;
  if (vis === 'private' || vis === 'shared' || vis === 'family') return vis;
  return 'family';
}

export function albumOwnerIds(album) {
  return uniqueIds([album?.createdBy, album?.ownerUid]);
}

/** Kan denne personen se albumet? */
export function canViewAlbum(album, {
  uid, isParent = false, manageAll = false, isGrandparent = false,
} = {}) {
  if (!album || album.deleted === true) return false;
  if (!uid) return false;
  // Besteforeldre er voksne medlemmer, men ser kun album de er invitert inn i.
  if ((manageAll || isParent) && !isGrandparent) return true;
  const owners = albumOwnerIds(album);
  if (owners.includes(uid)) return true;
  const viewers = Array.isArray(album.viewerUids) ? album.viewerUids : [];
  if (viewers.includes(uid)) return true;
  const mode = albumVisibilityMode(album);
  if (mode === 'family') {
    if (isGrandparent) return false;
    return true;
  }
  return false;
}

export function filterVisibleAlbums(albums, actor = {}) {
  return (albums || []).filter((a) => canViewAlbum(a, actor));
}

export function resolveAlbumViewerIds(album, { members = [] } = {}) {
  if (!album) return [];
  const owners = albumOwnerIds(album);
  const mode = albumVisibilityMode(album);
  if (mode === 'private') {
    return uniqueIds([...(album.viewerUids || []), ...owners]);
  }
  if (mode === 'family') {
    return uniqueIds([...memberUids(members), ...(album.viewerUids || []), ...owners]);
  }
  return uniqueIds([...(album.viewerUids || []), ...owners]);
}

export function albumViewerSummary(album, { members = [], friends = [] } = {}) {
  const mode = albumVisibilityMode(album);
  if (mode === 'family') return 'Hele familien';
  if (mode === 'private') return 'Bare eier';
  const ids = resolveAlbumViewerIds(album, { members });
  const people = [...(members || []), ...(friends || [])];
  const names = ids
    .map((id) => people.find((m) => m.uid === id || m.id === id || m.friendUid === id)?.name)
    .filter(Boolean);
  if (!names.length) return 'Utvalgte';
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/** UIDs among viewers that are peer-friends (not family members). */
export function friendUidsFromViewerList(viewerUids = [], { members = [], uid } = {}) {
  const familyUids = new Set(
    (members || []).map((m) => m.uid || m.id).filter(Boolean),
  );
  if (uid) familyUids.add(uid);
  return [...new Set(
    (viewerUids || []).filter((id) => id && !familyUids.has(id)),
  )];
}

export function buildAlbumSharePatch({
  mode,
  viewerUids = [],
  uid,
  ownerIds = [],
  familyMemberUids = [],
} = {}) {
  const owners = uniqueIds([...ownerIds, uid]);
  if (mode === 'private') {
    return { visibility: 'private', viewerUids: owners };
  }
  if (mode === 'family') {
    return {
      visibility: 'family',
      viewerUids: uniqueIds([...familyMemberUids, ...owners]),
    };
  }
  return {
    visibility: 'shared',
    viewerUids: uniqueIds([...viewerUids, ...owners]),
  };
}

export function albumShareStateFromDoc(album) {
  const mode = albumVisibilityMode(album);
  return {
    mode,
    viewerUids: uniqueIds(album?.viewerUids || []),
  };
}

/* Kompatibilitetsaliaser for skjermer som bruker litt andre navn */
export const filterVisibleAlbumsCompat = filterVisibleAlbums;
export const albumViewerSummaryCompat = albumViewerSummary;
export const albumShareStateFromDocCompat = albumShareStateFromDoc;
export const buildAlbumSharePatchCompat = buildAlbumSharePatch;
