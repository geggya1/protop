/**
 * Handlelister — personlige følger profilen på tvers av familier/plattformer.
 * Delte lister ligger under families/{id}, men synlige overalt der du er medlem.
 */
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDocs, writeBatch, getDoc,
  onSnapshot, serverTimestamp, query, where, orderBy, arrayUnion, arrayRemove,
  collectionGroup,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isFirestorePermissionError,
  listenAfterAccess,
  waitForFirestoreAccess,
  warnPermissionOnce,
} from './firestoreAccess';

/** Family-scoped (shared) lists */
export function listsCol(familyId) {
  return collection(db, 'families', familyId, 'shoppingLists');
}

export function listDoc(familyId, listId) {
  return doc(db, 'families', familyId, 'shoppingLists', listId);
}

export function itemsCol(familyId, listId) {
  return collection(db, 'families', familyId, 'shoppingLists', listId, 'items');
}

export function itemDoc(familyId, listId, itemId) {
  return doc(db, 'families', familyId, 'shoppingLists', listId, 'items', itemId);
}

/** Person-scoped (private) lists — follow uid across families */
export function personalListsCol(uid) {
  return collection(db, 'users', uid, 'shoppingLists');
}

export function personalListDoc(uid, listId) {
  return doc(db, 'users', uid, 'shoppingLists', listId);
}

export function personalItemsCol(uid, listId) {
  return collection(db, 'users', uid, 'shoppingLists', listId, 'items');
}

export function personalItemDoc(uid, listId, itemId) {
  return doc(db, 'users', uid, 'shoppingLists', listId, 'items', itemId);
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function listUpdatedMs(list) {
  const t = list?.updatedAt;
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}

export function isPersonalList(list) {
  return !!list && (list.storage === 'personal' || list.personal === true);
}

/** Tomt speil under users/ — metadata uten varer; varene ligger fortsatt i familien. */
export function isPersonalMirror(list) {
  return isPersonalList(list) && !!list.mirroredFromFamilyId && !list.demotedFromFamilyId;
}

export function isPrivateList(list) {
  if (!list) return true;
  if (isPersonalList(list) && !isPersonalMirror(list)) return true;
  return list.visibility === 'private' || (list.memberIds || []).length <= 1;
}

/**
 * Resolve Firestore paths for a list.
 * @param {{ personal?: boolean, ownerUid?: string, familyId?: string, listId: string }} scope
 */
export function resolveListPaths(scope) {
  if (!scope?.listId) return null;
  if (scope.personal) {
    const ownerUid = scope.ownerUid;
    if (!ownerUid) return null;
    return {
      personal: true,
      ownerUid,
      listId: scope.listId,
      listRef: personalListDoc(ownerUid, scope.listId),
      itemsRef: personalItemsCol(ownerUid, scope.listId),
      itemRef: (itemId) => personalItemDoc(ownerUid, scope.listId, itemId),
    };
  }
  if (!scope.familyId) return null;
  return {
    personal: false,
    familyId: scope.familyId,
    listId: scope.listId,
    listRef: listDoc(scope.familyId, scope.listId),
    itemsRef: itemsCol(scope.familyId, scope.listId),
    itemRef: (itemId) => itemDoc(scope.familyId, scope.listId, itemId),
  };
}

export function scopeFromList(list, { familyId, uid } = {}) {
  if (!list?.id) return null;

  // Speil uten varer → les/skriv i familiens kopi
  if (isPersonalMirror(list)) {
    return {
      personal: false,
      familyId: list.mirroredFromFamilyId || list.familyId || familyId,
      listId: list.id,
    };
  }

  if (isPersonalList(list)) {
    return {
      personal: true,
      ownerUid: list.ownerUid || list.createdBy || uid,
      listId: list.id,
    };
  }
  return {
    personal: false,
    familyId: list.familyId || familyId,
    listId: list.id,
  };
}

function sortLists(lists) {
  return [...lists].sort((a, b) => listUpdatedMs(b) - listUpdatedMs(a));
}

function mapPersonalSnap(snap, uid) {
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    storage: 'personal',
    personal: true,
    ownerUid: uid,
    visibility: d.data()?.visibility || 'private',
  }));
}

function mapFamilySnap(snap, familyId, platformName = null) {
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    storage: 'family',
    personal: false,
    familyId,
    sourcePlatformName: platformName || null,
  }));
}

function normalizeFamilyIds(familyIdOrIds) {
  if (Array.isArray(familyIdOrIds)) {
    return [...new Set(familyIdOrIds.filter(Boolean))];
  }
  if (familyIdOrIds) return [familyIdOrIds];
  return [];
}

export { activeShopFamilyIds, shopFamilyIdsKey } from './shopFamilyIds';

/**
 * Merg: personlige (ekte) + familielister fra alle plattformer.
 * Speil under users/ som bare er metadata viker for familiens kopi med varer.
 */
function isPermanentlyDeleted(list) {
  return !!list?.permanentlyDeleted;
}

function mergeAccessibleLists(personal, familyLists) {
  const byKey = new Map();

  const put = (list, prefer = false) => {
    if (!list?.id || isPermanentlyDeleted(list)) return;
    const key = list.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, list);
      return;
    }
    if (prefer) {
      byKey.set(key, list);
      return;
    }
    // Ekte personlig > speil > familie-privat > delt
    const score = (l) => {
      if (isPersonalList(l) && !isPersonalMirror(l)) return 4;
      if (!isPersonalList(l) && !isPrivateList(l)) return 3;
      if (!isPersonalList(l)) return 2;
      if (isPersonalMirror(l)) return 1;
      return 0;
    };
    if (score(list) > score(existing)) byKey.set(key, list);
  };

  personal.forEach((l) => {
    if (l.deleted || isPermanentlyDeleted(l)) return;
    put(l);
  });

  familyLists.forEach((l) => {
    if (isPermanentlyDeleted(l)) return;
    if (!l.deleted) {
      put(l);
      return;
    }
    // Feilslått migrering: soft-slettet familie, ingen personlig kopi → vis likevel
    if (l.migratedToPersonal) {
      const personalCopy = personal.find((p) => p.id === l.id && !p.deleted && !isPermanentlyDeleted(p));
      if (!personalCopy) {
        put({
          ...l,
          deleted: false,
          archived: false,
          needsRestore: true,
        }, true);
      }
    }
  });

  return [...byKey.values()];
}

/**
 * Alle lister synlige for brukeren på tvers av familier/plattformer:
 * - personlige (følger profilen)
 * - familielister der uid er i memberIds (fra alle familyIds)
 *
 * @param {string|string[]|null} familyIdOrIds - aktiv familie eller alle plattform-ider
 * @param {string} uid
 * @param {{ includeArchived?: boolean, platforms?: Array<{id:string,name?:string}> }} opts
 * @param {(lists: object[]) => void} cb
 */
export function listenAccessibleLists(familyIdOrIds, uid, opts = {}, cb) {
  if (!uid) return () => {};
  const includeArchived = !!opts.includeArchived;
  const skipPersonal = !!opts.skipPersonal;
  const platforms = opts.platforms || [];
  const familyIds = normalizeFamilyIds(familyIdOrIds);

  let personal = [];
  const familyByPlatform = new Map(); // familyId -> lists[]
  let cancelled = false;
  let unsubPersonal = () => {};
  let familyUnsubs = [];
  let unsubCg = () => {};

  const emit = () => {
    if (cancelled) return;
    const familyLists = [];
    familyByPlatform.forEach((lists) => familyLists.push(...lists));
    const merged = mergeAccessibleLists(personal, familyLists);
    cb(sortLists(
      merged.filter((l) => includeArchived || !l.archived),
    ));
  };

  const start = (onPersonalErr) => {
    unsubPersonal = skipPersonal
      ? () => {}
      : onSnapshot(personalListsCol(uid), (snap) => {
        personal = mapPersonalSnap(snap, uid);
        emit();
      }, (err) => {
        try { unsubPersonal(); } catch { /* ignore */ }
        unsubPersonal = () => {};
        onPersonalErr(err);
      });

    familyUnsubs = familyIds.map((fid) => {
      familyByPlatform.set(fid, []);
      const platformName = platforms.find((p) => p.id === fid)?.name || null;
      const qy = query(listsCol(fid), where('memberIds', 'array-contains', uid));
      const stop = onSnapshot(qy, (snap) => {
        familyByPlatform.set(fid, mapFamilySnap(snap, fid, platformName));
        emit();
      }, (err) => {
        try { stop(); } catch { /* ignore */ }
        if (cancelled) return;
        warnPermissionOnce(
          `shop-family:${uid}:${fid}`,
          '[shoppingLists] family listen failed',
          fid,
          err?.message || err,
        );
        familyByPlatform.set(fid, []);
        emit();
      });
      return stop;
    });

    // Collection group catches lists shared with friends (other families) and
    // fills gaps when family-scoped listens fail. Deduped in mergeAccessibleLists.
    try {
      const stopCg = onSnapshot(
        query(collectionGroup(db, 'shoppingLists'), where('memberIds', 'array-contains', uid)),
        (snap) => {
          const fromCg = [];
          snap.docs.forEach((d) => {
            const parts = d.ref.path.split('/');
            if (parts[0] !== 'families' || parts[2] !== 'shoppingLists') return;
            const fid = parts[1];
            if (familyIds.includes(fid)) return; // already covered by family listen
            fromCg.push({
              id: d.id,
              ...d.data(),
              storage: 'family',
              personal: false,
              familyId: fid,
              sharedFromFriend: true,
            });
          });
          familyByPlatform.set('__cg__', fromCg);
          emit();
        },
        (err) => {
          try { stopCg(); } catch { /* ignore */ }
          if (cancelled) return;
          warnPermissionOnce(
            `shop-cg:${uid}`,
            '[shoppingLists] collectionGroup listen failed',
            err?.message || err,
          );
        },
      );
      unsubCg = stopCg;
    } catch (err) {
      warnPermissionOnce(
        `shop-cg:${uid}`,
        '[shoppingLists] collectionGroup unavailable',
        err?.message || err,
      );
    }

    return () => {
      unsubPersonal();
      familyUnsubs.forEach((u) => u && u());
      unsubCg();
    };
  };

  const stop = listenAfterAccess(uid, start, (err) => {
    if (cancelled) return;
    if (err) {
      warnPermissionOnce(
        `shop-personal:${uid}`,
        '[shoppingLists] personal listen failed',
        err?.message || err,
      );
    }
    personal = [];
    emit();
  }, { unsubOnDenied: false });
  return () => {
    cancelled = true;
    stop();
  };
}

export function listenList(scopeOrFamilyId, listIdOrCb, maybeCb) {
  // Back-compat: listenList(familyId, listId, cb) OR listenList(scope, cb)
  let scope;
  let cb;
  if (typeof listIdOrCb === 'function') {
    scope = scopeOrFamilyId;
    cb = listIdOrCb;
  } else {
    scope = { personal: false, familyId: scopeOrFamilyId, listId: listIdOrCb };
    cb = maybeCb;
  }
  const paths = resolveListPaths(scope);
  if (!paths) return () => {};
  return onSnapshot(paths.listRef, (snap) => {
    if (!snap.exists()) {
      cb(null);
      return;
    }
    const data = { id: snap.id, ...snap.data() };
    if (paths.personal) {
      cb({
        ...data,
        storage: 'personal',
        personal: true,
        ownerUid: paths.ownerUid,
        visibility: data.visibility || 'private',
      });
    } else {
      cb({
        ...data,
        storage: 'family',
        personal: false,
        familyId: paths.familyId,
      });
    }
  }, () => cb(null));
}

export function listenListItems(scopeOrFamilyId, listIdOrCb, maybeCb) {
  let scope;
  let cb;
  if (typeof listIdOrCb === 'function') {
    scope = scopeOrFamilyId;
    cb = listIdOrCb;
  } else {
    scope = { personal: false, familyId: scopeOrFamilyId, listId: listIdOrCb };
    cb = maybeCb;
  }
  const paths = resolveListPaths(scope);
  if (!paths) return () => {};
  const q = query(paths.itemsRef, orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

/** Engangs-hent for merge ved import fra måltid. */
export async function fetchListItems(scopeOrFamilyId, maybeListId) {
  const scope = typeof scopeOrFamilyId === 'object' && scopeOrFamilyId?.listId
    ? scopeOrFamilyId
    : { personal: false, familyId: scopeOrFamilyId, listId: maybeListId };
  const paths = resolveListPaths(scope);
  if (!paths) return [];
  const snap = await getDocs(query(paths.itemsRef, orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Opprett privat handleliste.
 * Prøver users/{uid} først (følger profilen). Live Firestore-regler kan fortsatt
 * mangle den stien — da skrives listen til families/{id} som før.
 */
export async function createList(familyId, uid, name, creatorName, scopeChildId = null) {
  if (!uid) throw new Error('Mangler bruker');
  const title = String(name || '').trim();
  if (!title) throw new Error('Navn kreves');

  const base = {
    name: title,
    createdBy: uid,
    createdByName: creatorName || '',
    memberIds: [uid],
    visibility: 'private',
    scopeChildId: scopeChildId || null,
    archived: false,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const personalPayload = {
    ...base,
    ownerUid: uid,
    storage: 'personal',
    personal: true,
    ...(familyId ? { homeFamilyId: familyId } : {}),
  };

  try {
    const ref = await addDoc(personalListsCol(uid), personalPayload);
    return Object.assign(ref, { storage: 'personal', personal: true, ownerUid: uid });
  } catch (err) {
    if (!familyId) throw err;
    console.warn('[shoppingLists] personal create failed, using family', err?.message || err);
  }

  const familyRef = await addDoc(listsCol(familyId), {
    ...base,
    storage: 'family',
    personal: false,
    familyId,
  });

  try {
    await setDoc(personalListDoc(uid, familyRef.id), {
      ...personalPayload,
      mirroredFromFamilyId: familyId,
    }, { merge: true });
  } catch (err) {
    console.warn('[shoppingLists] personal mirror skipped', err?.message || err);
  }

  return Object.assign(familyRef, { storage: 'family', personal: false, familyId });
}

export async function updateList(scopeOrFamilyId, listIdOrPatch, maybePatch) {
  let paths;
  let patch;
  if (typeof scopeOrFamilyId === 'object' && scopeOrFamilyId?.listId) {
    paths = resolveListPaths(scopeOrFamilyId);
    patch = listIdOrPatch;
  } else {
    paths = resolveListPaths({
      personal: false,
      familyId: scopeOrFamilyId,
      listId: listIdOrPatch,
    });
    patch = maybePatch;
  }
  if (!paths) throw new Error('Ugyldig liste');
  await updateDoc(paths.listRef, {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function archiveList(scopeOrFamilyId, listIdOrArchived, maybeArchived = true) {
  if (typeof scopeOrFamilyId === 'object') {
    const archived = typeof listIdOrArchived === 'boolean' ? listIdOrArchived : true;
    await updateList(scopeOrFamilyId, { archived });
    return;
  }
  await updateList(scopeOrFamilyId, listIdOrArchived, { archived: maybeArchived });
}

const PERMANENT_DELETE_PATCH = {
  deleted: true,
  archived: true,
  permanentlyDeleted: true,
  migratedToPersonal: false,
  updatedAt: serverTimestamp(),
};

async function wipeShoppingList(listRef, itemsRef, { required = false } = {}) {
  let exists = false;
  try {
    const snap = await getDoc(listRef);
    exists = snap.exists();
  } catch (err) {
    if (required) throw err;
    return;
  }
  if (!exists) return;

  let itemDocs = [];
  try {
    const itemsSnap = await getDocs(itemsRef);
    itemDocs = itemsSnap.docs;
  } catch (err) {
    console.warn('[shoppingLists] delete items skipped', err?.message || err);
  }

  const batch = writeBatch(db);
  itemDocs.forEach((d) => batch.delete(d.ref));
  batch.update(listRef, PERMANENT_DELETE_PATCH);
  await batch.commit();
}

export async function deleteList(scopeOrFamilyId, maybeListId) {
  const scope = typeof scopeOrFamilyId === 'object'
    ? scopeOrFamilyId
    : { personal: false, familyId: scopeOrFamilyId, listId: maybeListId };
  const paths = resolveListPaths(scope);
  if (!paths) throw new Error('Ugyldig liste');

  let data = {};
  try {
    const snap = await getDoc(paths.listRef);
    if (snap.exists()) data = snap.data() || {};
  } catch (err) {
    console.warn('[shoppingLists] delete read skipped', err?.message || err);
  }

  await wipeShoppingList(paths.listRef, paths.itemsRef, { required: true });

  const listId = paths.listId;
  const ownerUid = paths.ownerUid || data.ownerUid || data.createdBy || scope.ownerUid || null;
  const familyIds = [...new Set([
    paths.familyId,
    scope.familyId,
    data.familyId,
    data.homeFamilyId,
    data.mirroredFromFamilyId,
  ].filter(Boolean))];

  if (ownerUid) {
    await wipeShoppingList(personalListDoc(ownerUid, listId), personalItemsCol(ownerUid, listId));
  }
  for (const familyId of familyIds) {
    await wipeShoppingList(listDoc(familyId, listId), itemsCol(familyId, listId));
  }
}

async function copyItems(fromCol, toCol) {
  const snap = await getDocs(fromCol);
  if (snap.empty) return;
  let batch = writeBatch(db);
  let n = 0;
  for (const d of snap.docs) {
    batch.set(doc(toCol, d.id), d.data());
    n += 1;
    if (n >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      n = 0;
    }
  }
  if (n) await batch.commit();
}

/** Flytt personlig liste → familie når den deles. */
export async function promotePersonalListToFamily(list, familyId, memberIds) {
  if (!list?.id || !familyId) throw new Error('Mangler liste/familie');
  const ownerUid = list.ownerUid || list.createdBy;
  const ids = [...new Set((memberIds || [ownerUid]).filter(Boolean))];
  const fromItems = personalItemsCol(ownerUid, list.id);
  const toList = listDoc(familyId, list.id);
  const toItems = itemsCol(familyId, list.id);

  const existing = await getDoc(toList);
  const payload = {
    name: list.name || 'Handleliste',
    createdBy: list.createdBy || ownerUid,
    createdByName: list.createdByName || '',
    memberIds: ids,
    visibility: ids.length <= 1 ? 'private' : 'shared',
    storage: 'family',
    personal: false,
    familyId,
    scopeChildId: list.scopeChildId || null,
    archived: !!list.archived,
    deleted: false,
    createdAt: list.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    promotedFromPersonal: true,
  };
  if (existing.exists()) {
    await updateDoc(toList, payload);
  } else {
    await setDoc(toList, payload);
  }
  await copyItems(fromItems, toItems);

  // Soft-delete personal copy
  await updateDoc(personalListDoc(ownerUid, list.id), {
    deleted: true,
    archived: true,
    migratedToFamilyId: familyId,
    updatedAt: serverTimestamp(),
  });

  return { id: list.id, ...payload };
}

/** Flytt familielliste → personlig når den blir privat igjen. */
export async function demoteFamilyListToPersonal(list, familyId, ownerUid) {
  if (!list?.id || !familyId || !ownerUid) throw new Error('Mangler liste');
  const fromItems = itemsCol(familyId, list.id);
  const toList = personalListDoc(ownerUid, list.id);
  const toItems = personalItemsCol(ownerUid, list.id);

  const payload = {
    name: list.name || 'Handleliste',
    createdBy: list.createdBy || ownerUid,
    createdByName: list.createdByName || '',
    ownerUid,
    memberIds: [ownerUid],
    visibility: 'private',
    storage: 'personal',
    personal: true,
    scopeChildId: list.scopeChildId || null,
    archived: !!list.archived,
    deleted: false,
    createdAt: list.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    demotedFromFamilyId: familyId,
    homeFamilyId: familyId,
  };
  // Fjern speil-flagg hvis det fantes
  await setDoc(toList, {
    ...payload,
    mirroredFromFamilyId: null,
  }, { merge: true });
  await copyItems(fromItems, toItems);

  await updateDoc(listDoc(familyId, list.id), {
    deleted: true,
    archived: true,
    migratedToPersonal: true,
    updatedAt: serverTimestamp(),
  });

  return { id: list.id, ...payload };
}

export async function setListMembers(scopeOrFamilyId, listIdOrMembers, memberIdsOrVisibility, maybeVisibility) {
  let familyId;
  let memberIds;
  let visibility;

  if (typeof scopeOrFamilyId === 'object' && scopeOrFamilyId.listId) {
    throw new Error('Bruk setListMembersForList(list, familyId, memberIds)');
  }

  familyId = scopeOrFamilyId;
  const listId = listIdOrMembers;
  memberIds = memberIdsOrVisibility;
  visibility = maybeVisibility;
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  await updateList(familyId, listId, {
    memberIds: ids,
    visibility: ids.length <= 1 ? 'private' : (visibility || 'shared'),
  });
}

/**
 * Oppdater medlemmer og flytt mellom personal/family ved behov.
 * @returns {{ list: object, scope: object }} ny liste + scope etter eventuell flytting
 */
export async function setListMembersForList(list, familyId, memberIds, visibility) {
  const ids = [...new Set((memberIds || []).filter(Boolean))];
  const wantPrivate = ids.length <= 1;
  const vis = wantPrivate ? 'private' : (visibility || 'shared');

  // Speil → behandle som familielliste
  if (isPersonalMirror(list)) {
    const fid = list.mirroredFromFamilyId || familyId;
    if (wantPrivate) {
      const ownerUid = list.createdBy || list.ownerUid || ids[0];
      const next = await demoteFamilyListToPersonal(
        { ...list, personal: false, storage: 'family', familyId: fid },
        fid,
        ownerUid,
      );
      return {
        list: next,
        scope: { personal: true, ownerUid, listId: next.id },
      };
    }
    await updateList(fid, list.id, { memberIds: ids, visibility: vis });
    return {
      list: {
        ...list, personal: false, storage: 'family', familyId: fid, memberIds: ids, visibility: vis,
      },
      scope: { personal: false, familyId: fid, listId: list.id },
    };
  }

  if (isPersonalList(list) && !wantPrivate) {
    if (!familyId) throw new Error('Velg en familie for å dele listen');
    const next = await promotePersonalListToFamily(list, familyId, ids);
    return {
      list: next,
      scope: { personal: false, familyId, listId: next.id },
    };
  }

  if (!isPersonalList(list) && wantPrivate) {
    const ownerUid = list.createdBy || ids[0];
    const next = await demoteFamilyListToPersonal(list, familyId || list.familyId, ownerUid);
    return {
      list: next,
      scope: { personal: true, ownerUid, listId: next.id },
    };
  }

  if (isPersonalList(list)) {
    const scope = scopeFromList(list, { uid: list.ownerUid });
    await updateList(scope, {
      memberIds: ids,
      visibility: 'private',
    });
    return { list: { ...list, memberIds: ids, visibility: 'private' }, scope };
  }

  await updateList(familyId, list.id, {
    memberIds: ids,
    visibility: vis,
  });
  return {
    list: { ...list, memberIds: ids, visibility: vis },
    scope: { personal: false, familyId, listId: list.id },
  };
}

export async function addListMember(familyId, listId, memberUid) {
  await updateDoc(listDoc(familyId, listId), {
    memberIds: arrayUnion(memberUid),
    visibility: 'shared',
    updatedAt: serverTimestamp(),
  });
}

export async function removeListMember(familyId, listId, memberUid) {
  await updateDoc(listDoc(familyId, listId), {
    memberIds: arrayRemove(memberUid),
    updatedAt: serverTimestamp(),
  });
}

export async function addListItem(scopeOrFamilyId, listIdOrData, maybeData) {
  let paths;
  let data;
  if (typeof scopeOrFamilyId === 'object' && scopeOrFamilyId.listId && maybeData === undefined) {
    paths = resolveListPaths(scopeOrFamilyId);
    data = listIdOrData;
  } else {
    paths = resolveListPaths({ personal: false, familyId: scopeOrFamilyId, listId: listIdOrData });
    data = maybeData;
  }
  if (!paths) throw new Error('Ugyldig liste');
  const ref = await addDoc(paths.itemsRef, compact({
    deleted: false,
    ...data,
    createdAt: serverTimestamp(),
  }));
  await updateDoc(paths.listRef, { updatedAt: serverTimestamp() }).catch(() => {});
  return ref;
}

export async function addListItems(scopeOrFamilyId, listIdOrItems, maybeItems) {
  let paths;
  let items;
  if (typeof scopeOrFamilyId === 'object' && scopeOrFamilyId.listId && maybeItems === undefined) {
    paths = resolveListPaths(scopeOrFamilyId);
    items = listIdOrItems || [];
  } else {
    paths = resolveListPaths({ personal: false, familyId: scopeOrFamilyId, listId: listIdOrItems });
    items = maybeItems || [];
  }
  if (!paths || !items.length) return;
  const batch = writeBatch(db);
  for (const data of items) {
    batch.set(doc(paths.itemsRef), compact({
      deleted: false,
      ...data,
      createdAt: serverTimestamp(),
    }));
  }
  batch.update(paths.listRef, { updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function updateListItem(scopeOrFamilyId, listIdOrItemId, itemIdOrPatch, maybePatch) {
  let paths;
  let itemId;
  let patch;
  if (typeof scopeOrFamilyId === 'object' && scopeOrFamilyId.listId) {
    paths = resolveListPaths(scopeOrFamilyId);
    itemId = listIdOrItemId;
    patch = itemIdOrPatch;
  } else {
    paths = resolveListPaths({ personal: false, familyId: scopeOrFamilyId, listId: listIdOrItemId });
    itemId = itemIdOrPatch;
    patch = maybePatch;
  }
  if (!paths) return;
  await updateDoc(paths.itemRef(itemId), patch);
}

function resolveItemArgs(scopeOrFamilyId, listIdOrItemId, maybeItemId) {
  if (typeof scopeOrFamilyId === 'object' && scopeOrFamilyId.listId) {
    return {
      paths: resolveListPaths(scopeOrFamilyId),
      itemId: listIdOrItemId,
    };
  }
  return {
    paths: resolveListPaths({ personal: false, familyId: scopeOrFamilyId, listId: listIdOrItemId }),
    itemId: maybeItemId,
  };
}

/** Soft-slett vare → papirkurv (kan gjenopprettes). */
export async function deleteListItem(scopeOrFamilyId, listIdOrItemId, maybeItemId, meta = {}) {
  const { paths, itemId } = resolveItemArgs(scopeOrFamilyId, listIdOrItemId, maybeItemId);
  if (!paths || !itemId) return;
  await updateDoc(paths.itemRef(itemId), compact({
    deleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: meta.deletedBy || null,
    updatedAt: serverTimestamp(),
  }));
  await updateDoc(paths.listRef, { updatedAt: serverTimestamp() }).catch(() => {});
}

/** Gjenopprett vare fra papirkurv. */
export async function restoreListItem(scopeOrFamilyId, listIdOrItemId, maybeItemId) {
  const { paths, itemId } = resolveItemArgs(scopeOrFamilyId, listIdOrItemId, maybeItemId);
  if (!paths || !itemId) return;
  await updateDoc(paths.itemRef(itemId), {
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    updatedAt: serverTimestamp(),
  });
  await updateDoc(paths.listRef, { updatedAt: serverTimestamp() }).catch(() => {});
}

/** Slett vare permanent fra papirkurv. */
export async function purgeListItem(scopeOrFamilyId, listIdOrItemId, maybeItemId) {
  const { paths, itemId } = resolveItemArgs(scopeOrFamilyId, listIdOrItemId, maybeItemId);
  if (!paths || !itemId) return;
  await deleteDoc(paths.itemRef(itemId));
  await updateDoc(paths.listRef, { updatedAt: serverTimestamp() }).catch(() => {});
}

/** Tøm papirkurv (permanent slett alle soft-slettede). */
export async function emptyListTrash(scope, deletedItems = []) {
  const paths = resolveListPaths(scope);
  if (!paths || !deletedItems.length) return;
  const batch = writeBatch(db);
  for (const item of deletedItems) {
    if (!item?.id) continue;
    batch.delete(paths.itemRef(item.id));
  }
  batch.update(paths.listRef, { updatedAt: serverTimestamp() });
  await batch.commit();
}

/**
 * Sikre at private lister følger profilen:
 * - Private familiellister (kun eier) kopieres til users/{uid} med varer
 * - Soft-slettede migreringer gjenopprettes hvis personlig kopi mangler
 *
 * @param {string|string[]} familyIdOrIds
 * @param {string} uid
 */
const migrateUidDenied = new Set();
const migrateListTried = new Set();

export async function migratePrivateListsToPersonal(familyIdOrIds, uid) {
  if (!uid) return 0;
  if (migrateUidDenied.has(uid)) return 0;
  const familyIds = normalizeFamilyIds(familyIdOrIds);
  if (!familyIds.length) return 0;

  const ready = await waitForFirestoreAccess(uid);
  if (!ready) return 0;

  let moved = 0;

  for (const familyId of familyIds) {
    let snap;
    try {
      snap = await getDocs(query(listsCol(familyId), where('memberIds', 'array-contains', uid)));
    } catch (err) {
      warnPermissionOnce(
        `shop-repair:${uid}:${familyId}`,
        '[shoppingLists] repair query failed',
        familyId,
        err?.message || err,
      );
      if (isFirestorePermissionError(err)) {
        migrateUidDenied.add(uid);
        return moved;
      }
      continue;
    }

    for (const d of snap.docs) {
      const list = { id: d.id, ...d.data(), familyId };
      const tryKey = `${uid}:${list.id}`;
      if (migrateListTried.has(tryKey)) continue;
      const isPrivate = list.visibility === 'private'
        || (Array.isArray(list.memberIds) && list.memberIds.length <= 1);
      const owned = !list.createdBy || list.createdBy === uid;
      if (!isPrivate || !owned) continue;
      if (isPermanentlyDeleted(list)) continue;

      // Soft-slettet uten personlig kopi → gjenopprett familie midlertidig, deretter flytt
      if (list.deleted) {
        // Bruker-slettede lister har ikke migratedToPersonal — ikke gjenopprett dem
        if (!list.migratedToPersonal) continue;
        let personalOk = false;
        try {
          const destSnap = await getDoc(personalListDoc(uid, list.id));
          const dest = destSnap.exists() ? destSnap.data() : null;
          if (isPermanentlyDeleted(dest)) continue;
          personalOk = dest && !dest.deleted;
        } catch (err) {
          if (isFirestorePermissionError(err)) {
            warnPermissionOnce(
              `shop-migrate:${tryKey}`,
              '[shoppingLists] migrate to personal failed',
              list.id,
              err?.message || err,
            );
            migrateUidDenied.add(uid);
            return moved;
          }
          personalOk = false;
        }
        if (personalOk) continue;
        try {
          await updateDoc(listDoc(familyId, list.id), {
            deleted: false,
            archived: false,
            migratedToPersonal: false,
            storage: 'family',
            personal: false,
            updatedAt: serverTimestamp(),
          });
          list.deleted = false;
        } catch (err) {
          warnPermissionOnce(
            `shop-restore:${uid}:${list.id}`,
            '[shoppingLists] restore failed',
            list.id,
            err?.message || err,
          );
          continue;
        }
      }

      // Allerede aktiv privat familielliste → flytt til profil med varer
      try {
        const destSnap = await getDoc(personalListDoc(uid, list.id));
        const dest = destSnap.exists() ? destSnap.data() : null;
        if (isPermanentlyDeleted(dest)) {
          await wipeShoppingList(listDoc(familyId, list.id), itemsCol(familyId, list.id));
          continue;
        }
        const hasRealPersonal = dest && !dest.deleted && !dest.mirroredFromFamilyId;

        if (hasRealPersonal) {
          // Personlig kopi finnes — soft-slett familie-duplikat hvis privat
          if (!list.deleted) {
            await updateDoc(listDoc(familyId, list.id), {
              deleted: true,
              archived: true,
              migratedToPersonal: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
          continue;
        }

        // Speil eller mangler → demote med varer
        migrateListTried.add(tryKey);
        await demoteFamilyListToPersonal(list, familyId, uid);
        moved += 1;
      } catch (err) {
        migrateListTried.add(tryKey);
        warnPermissionOnce(
          `shop-migrate:${tryKey}`,
          '[shoppingLists] migrate to personal failed',
          list.id,
          err?.message || err,
        );
        if (isFirestorePermissionError(err)) {
          migrateUidDenied.add(uid);
          return moved;
        }
      }
    }
  }

  return moved;
}

/** Alias — tydeligere navn for hub. */
export const repairShoppingLists = migratePrivateListsToPersonal;

/** Flytt gammel flat shoppingList til første navngitte liste (kun ved faktisk gammel data). */
export async function migrateLegacyShoppingList(familyId, uid, creatorName) {
  if (!familyId || !uid) return null;
  const legacyCol = collection(db, 'families', familyId, 'shoppingList');
  let legacySnap;
  try {
    legacySnap = await getDocs(legacyCol);
  } catch {
    return null;
  }
  if (legacySnap.empty) return null;

  let targetListId = null;
  let targetPersonal = true;

  try {
    const personalSnap = await getDocs(personalListsCol(uid));
    const activePersonal = personalSnap.docs.filter((d) => {
      const data = d.data() || {};
      return !data.deleted && !data.mirroredFromFamilyId;
    });
    targetListId = activePersonal[0]?.id || null;
  } catch {
    targetPersonal = false;
  }

  if (!targetListId) {
    try {
      const listsSnap = await getDocs(
        query(listsCol(familyId), where('memberIds', 'array-contains', uid)),
      );
      const activeLists = listsSnap.docs.filter((d) => !d.data()?.deleted);
      if (activeLists.length > 0) {
        targetListId = activeLists[0].id;
        targetPersonal = false;
      }
    } catch { /* ignore */ }
  }

  if (!targetListId) {
    const ref = await createList(familyId, uid, 'Handleliste', creatorName);
    targetListId = ref.id;
    targetPersonal = true;
  }

  const batch = writeBatch(db);
  const destItems = targetPersonal
    ? personalItemsCol(uid, targetListId)
    : itemsCol(familyId, targetListId);
  legacySnap.docs.forEach((d) => {
    batch.set(doc(destItems, d.id), d.data());
    batch.delete(d.ref);
  });
  const destList = targetPersonal
    ? personalListDoc(uid, targetListId)
    : listDoc(familyId, targetListId);
  batch.update(destList, { updatedAt: serverTimestamp() });
  await batch.commit();
  return targetListId;
}

export function canManageList(list, uid, isAdmin) {
  if (!list || !uid) return false;
  if (isPersonalList(list) && !isPersonalMirror(list)) {
    return list.ownerUid === uid || list.createdBy === uid;
  }
  return list.createdBy === uid || isAdmin;
}

/** Kan legge til / redigere / krysse av varer (eier, admin eller delt medlem). */
export function canEditListItems(list, uid, isAdmin) {
  if (!list || !uid) return false;
  if (canManageList(list, uid, isAdmin)) return true;
  if (isPersonalList(list) && !isPersonalMirror(list)) return false;
  return Array.isArray(list.memberIds) && list.memberIds.includes(uid);
}

/** Liste synlig på barnprofil: familieliste (uten scope) hvis delt, ellers kun riktig barns scope. */
export function listVisibleOnProfile(list, profileChildId) {
  if (!profileChildId) return true;
  const scope = list.scopeChildId || null;
  if (scope) return scope === profileChildId;
  if (!isPrivateList(list)) return true;
  return false;
}

export function filterListsForProfile(lists, profileChildId) {
  if (!profileChildId) return lists;
  return lists.filter((l) => listVisibleOnProfile(l, profileChildId));
}

export function memberSummary(list, members, friendPeople = []) {
  if (isPersonalList(list) && !isPersonalMirror(list)) return 'Privat · følger deg';
  const ids = list?.memberIds || [];
  if (ids.length <= 1) return 'Privat · følger deg';
  const roster = members || [];
  const friends = friendPeople || [];
  const names = ids
    .map((id) => {
      const familyName = roster.find((m) => m.uid === id)?.name;
      if (familyName) return familyName;
      const friend = friends.find((f) => f.uid === id || f.friendUid === id);
      return friend?.name ? `${(friend.name || '').split(' ')[0]} (venn)` : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  if (!names.length) {
    if (list?.sharedFromFriend || list?.sharedBy) return 'Delt av venn';
    return `${ids.length} medlemmer`;
  }
  return names.length < ids.length
    ? `${names.join(', ')} +${ids.length - names.length}`
    : names.join(', ');
}
