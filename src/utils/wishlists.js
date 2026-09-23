import {
  collection, collectionGroup, doc, addDoc, updateDoc, deleteDoc, getDocs, setDoc, writeBatch,
  onSnapshot, serverTimestamp, query, orderBy, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isFamilySharedWishlist,
  defaultCreateVisibility,
  pickReservationFields,
  hasLegacyReservationFields,
  uniqueIds,
} from './wishlistVisibility';

export {
  isFamilySharedWishlist,
  isWishlistSubject,
  wishlistSecretUids,
  shouldHideReservations,
  canEditWishContent,
  canReserveWish,
  canPurchaseWish,
  canManageWishlist,
  canShareWishlist,
  splitWishlists,
  mergeSharedWishlistsForHub,
  wishlistOwnerLabel,
  wishlistVisibilityMode,
  isWishlistDraft,
  canViewWishlist,
  resolveWishlistViewerIds,
  resolveWishlistViewers,
  wishlistShareHint,
  shareStateFromList,
  buildWishlistSharePatch,
  defaultCreateVisibility,
  stripReservationFields,
  mergeWishSecrets,
  wishReservationStatus,
  reservationWhoLabel,
  hasLegacyReservationFields,
  uniqueIds,
  memberUids,
} from './wishlistVisibility';

const MAX_WISHLIST_FAMILY_LISTENERS = 6;

export function wishlistsCol(familyId) {
  return collection(db, 'families', familyId, 'wishlists');
}

export function wishlistDoc(familyId, listId) {
  return doc(db, 'families', familyId, 'wishlists', listId);
}

export function wishItemsCol(familyId, listId) {
  return collection(db, 'families', familyId, 'wishlists', listId, 'items');
}

export function wishItemDoc(familyId, listId, itemId) {
  return doc(db, 'families', familyId, 'wishlists', listId, 'items', itemId);
}

export function wishSecretsCol(familyId, listId) {
  return collection(db, 'families', familyId, 'wishlists', listId, 'secrets');
}

export function wishSecretDoc(familyId, listId, itemId) {
  return doc(db, 'families', familyId, 'wishlists', listId, 'secrets', itemId);
}

/** Alle aktive ønskelister i familien (realtid). */
export function listenWishlists(familyId, cb) {
  if (!familyId) return () => {};
  const q = query(wishlistsCol(familyId), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    const lists = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((l) => !l.deleted);
    cb(lists);
  }, () => cb([]));
}

export function listenWishlist(familyId, listId, cb) {
  if (!familyId || !listId) return () => {};
  return onSnapshot(wishlistDoc(familyId, listId), (snap) => {
    cb(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  }, () => cb(null));
}

export function listenWishItems(familyId, listId, cb) {
  if (!familyId || !listId) return () => {};
  const q = query(wishItemsCol(familyId, listId), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

/** Hemmelige reservasjoner/kjøp — eieren får permission-denied og tom liste. */
export function listenWishSecrets(familyId, listId, cb) {
  if (!familyId || !listId) return () => {};
  return onSnapshot(wishSecretsCol(familyId, listId), (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, () => cb([]));
}

function mapFamilyWishlists(snap, familyId, {
  activeFamilyId = null,
  platformName = null,
} = {}) {
  return snap.docs
    .map((d) => {
      const data = d.data() || {};
      const crossFamily = !!(activeFamilyId && familyId !== activeFamilyId);
      return {
        id: d.id,
        ...data,
        familyId,
        sourceFamilyName: crossFamily ? (platformName || data.sourceFamilyName || null) : null,
        crossFamily,
      };
    })
    .filter((l) => !l.deleted);
}

/**
 * Ønskelister i aktive familier + lister delt eksplisitt med uid (collection group).
 */
export function listenAccessibleWishlists({
  familyIds = [],
  activeFamilyId = null,
  uid = null,
  platforms = [],
  onChange,
} = {}) {
  const ids = [...new Set((familyIds || []).filter(Boolean))].slice(0, MAX_WISHLIST_FAMILY_LISTENERS);
  if (!ids.length && !uid) {
    onChange?.([]);
    return () => {};
  }

  const byFamily = new Map();
  let shared = [];
  const emit = () => {
    const merged = [];
    const seen = new Set();
    const put = (list) => {
      if (!list?.id) return;
      const key = `${list.familyId || ''}:${list.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(list);
    };
    ids.forEach((fid) => (byFamily.get(fid) || []).forEach(put));
    shared.forEach(put);
    onChange?.(merged);
  };

  const unsubs = ids.map((fid) => {
    byFamily.set(fid, []);
    const platformName = (platforms || []).find((p) => p.id === fid)?.name || null;
    const qy = query(wishlistsCol(fid), orderBy('updatedAt', 'desc'));
    return onSnapshot(qy, (snap) => {
      byFamily.set(fid, mapFamilyWishlists(snap, fid, { activeFamilyId, platformName }));
      emit();
    }, () => {
      byFamily.set(fid, []);
      emit();
    });
  });

  let unsubCg = () => {};
  if (uid) {
    try {
      unsubCg = onSnapshot(
        query(collectionGroup(db, 'wishlists'), where('viewerUids', 'array-contains', uid)),
        (snap) => {
          shared = [];
          snap.docs.forEach((d) => {
            const parts = d.ref.path.split('/');
            if (parts[0] !== 'families' || parts[2] !== 'wishlists') return;
            const fid = parts[1];
            const data = d.data() || {};
            if (data.deleted) return;
            const platformName = (platforms || []).find((p) => p.id === fid)?.name || null;
            const crossFamily = !!(activeFamilyId && fid !== activeFamilyId);
            shared.push({
              id: d.id,
              ...data,
              familyId: fid,
              sourceFamilyName: crossFamily ? (platformName || 'Annen familie') : null,
              crossFamily,
            });
          });
          emit();
        },
        () => {
          shared = [];
          emit();
        },
      );
    } catch {
      unsubCg = () => {};
    }
  }

  return () => {
    unsubs.forEach((u) => u && u());
    unsubCg();
  };
}

/**
 * Opprett ønskeliste.
 * Barnelister: forChildId + subjectUid (barnets uid når kjent).
 * Felles famili liste: scope: 'family' (alle foresatte/admin kan redigere).
 */
export async function createWishlist(familyId, {
  uid,
  creatorName,
  name,
  forChildId = null,
  forChildName = null,
  forMemberUid = null,
  forMemberName = null,
  subjectUid = null,
  coverImageUrl = null,
  occasionDate = null,
  scope = null,
  members = [],
}) {
  const isShared = scope === 'family';
  const ownerUid = isShared ? null : (subjectUid || forMemberUid || uid);
  const share = defaultCreateVisibility({
    scope: isShared ? 'family' : null,
    forChildId: isShared ? null : forChildId,
    uid: ownerUid || uid,
    members,
  });
  return addDoc(wishlistsCol(familyId), {
    name: String(name || '').trim() || (isShared ? 'Familiens ønskeliste' : 'Ønskeliste'),
    ownerUid,
    subjectUid: isShared ? null : (subjectUid || forMemberUid || (forChildId ? null : uid)),
    createdBy: uid,
    createdByName: creatorName || '',
    forChildId: isShared ? null : (forChildId || null),
    forChildName: isShared ? null : (forChildName || null),
    forMemberUid: isShared ? null : (forMemberUid || null),
    forMemberName: isShared ? null : (forMemberName || null),
    coverImageUrl: coverImageUrl || null,
    occasionDate: occasionDate || null,
    notifyOnReserve: true,
    visibility: share.visibility,
    published: share.published,
    viewerUids: uniqueIds([...(share.viewerUids || []), uid]),
    sharedFamilyIds: share.sharedFamilyIds,
    scope: isShared ? 'family' : (scope || 'personal'),
    kind: isShared ? 'family_shared' : null,
    itemCount: 0,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Sørg for én felles familiønskeliste (foresatte/admin). */
export async function ensureFamilyWishlist(familyId, { uid, creatorName, members = [] } = {}) {
  if (!familyId || !uid) return null;
  const snap = await getDocs(wishlistsCol(familyId));
  const existing = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((l) => !l.deleted && isFamilySharedWishlist(l));
  if (existing) return existing.id;
  const ref = await createWishlist(familyId, {
    uid,
    creatorName,
    name: 'Familiens ønskeliste',
    scope: 'family',
    members,
  });
  return ref.id;
}

/** Sørg for at barnet har minst én ønskeliste. */
export async function ensureChildWishlist(familyId, {
  uid,
  creatorName,
  childId,
  childName,
  subjectUid = null,
  members = [],
}) {
  if (!familyId || !childId) return null;
  const snap = await getDocs(wishlistsCol(familyId));
  const existing = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .find((l) => !l.deleted && l.forChildId === childId);
  if (existing) return existing.id;
  const ref = await createWishlist(familyId, {
    uid,
    creatorName,
    name: `${(childName || 'Min').split(' ')[0]} ønskeliste`,
    forChildId: childId,
    forChildName: childName || null,
    subjectUid: subjectUid || null,
    members,
  });
  return ref.id;
}

export async function updateWishlist(familyId, listId, patch) {
  await updateDoc(wishlistDoc(familyId, listId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWishlist(familyId, listId) {
  if (!familyId || !listId) throw new Error('Mangler liste.');
  const batch = writeBatch(db);
  try {
    const itemsSnap = await getDocs(wishItemsCol(familyId, listId));
    itemsSnap.docs.forEach((d) => batch.delete(d.ref));
  } catch {
    // Fortsett med soft-delete av listen selv om items-sletting feiler
  }
  try {
    const secretsSnap = await getDocs(wishSecretsCol(familyId, listId));
    secretsSnap.docs.forEach((d) => batch.delete(d.ref));
  } catch {
    // Eier kan mangle lesetilgang til secrets
  }
  batch.update(wishlistDoc(familyId, listId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function addWishItem(familyId, listId, data) {
  const ref = await addDoc(wishItemsCol(familyId, listId), {
    title: String(data.title || '').trim(),
    imageUrl: data.imageUrl || null,
    brand: data.brand || null,
    barcode: data.barcode || null,
    price: data.price != null && data.price !== '' ? Number(data.price) : null,
    currency: data.currency || 'NOK',
    url: data.url || null,
    note: data.note || null,
    createdByUid: data.createdByUid || null,
    createdByName: data.createdByName || '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  try {
    const snap = await getDocs(wishItemsCol(familyId, listId));
    await updateWishlist(familyId, listId, { itemCount: snap.size });
  } catch { /* ignore count sync */ }
  return ref;
}

export async function updateWishItem(familyId, listId, itemId, patch) {
  await updateDoc(wishItemDoc(familyId, listId, itemId), {
    ...patch,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteWishItem(familyId, listId, itemId) {
  await deleteDoc(wishItemDoc(familyId, listId, itemId));
  try {
    await deleteDoc(wishSecretDoc(familyId, listId, itemId));
  } catch { /* eier eller manglende secret */ }
  try {
    const snap = await getDocs(wishItemsCol(familyId, listId));
    await updateWishlist(familyId, listId, { itemCount: snap.size });
  } catch { /* ignore */ }
}

const CLEARED_ITEM_RESERVATION = {
  reservedByUid: null,
  reservedByName: null,
  reservedAt: null,
  purchasedByUid: null,
  purchasedByName: null,
  purchasedAt: null,
};

async function clearItemReservationFields(familyId, listId, itemId) {
  try {
    await updateWishItem(familyId, listId, itemId, CLEARED_ITEM_RESERVATION);
  } catch { /* ignore */ }
}

export async function setWishReservation(familyId, listId, itemId, payload) {
  const ref = wishSecretDoc(familyId, listId, itemId);
  const fields = pickReservationFields(payload);
  const empty = !fields.reservedByUid && !fields.purchasedByUid;
  if (empty) {
    try { await deleteDoc(ref); } catch { /* ignore */ }
  } else {
    await setDoc(ref, {
      ...fields,
      status: fields.purchasedByUid ? 'purchased' : 'reserved',
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  await clearItemReservationFields(familyId, listId, itemId);
}

export async function reserveWishItem(familyId, listId, itemId, { uid, name }) {
  await setWishReservation(familyId, listId, itemId, {
    reservedByUid: uid,
    reservedByName: name || '',
    reservedAt: serverTimestamp(),
  });
}

export async function unreserveWishItem(familyId, listId, itemId) {
  await setWishReservation(familyId, listId, itemId, null);
}

export async function purchaseWishItem(familyId, listId, itemId, { uid, name, item } = {}) {
  const reservedByUid = item?.reservedByUid || uid;
  const reservedByName = item?.reservedByName || name || '';
  await setWishReservation(familyId, listId, itemId, {
    reservedByUid,
    reservedByName,
    reservedAt: item?.reservedAt || serverTimestamp(),
    purchasedByUid: uid,
    purchasedByName: name || '',
    purchasedAt: serverTimestamp(),
  });
}

export async function unpurchaseWishItem(familyId, listId, itemId, { item } = {}) {
  if (item?.reservedByUid) {
    await setWishReservation(familyId, listId, itemId, {
      reservedByUid: item.reservedByUid,
      reservedByName: item.reservedByName || '',
      reservedAt: item.reservedAt || serverTimestamp(),
    });
    return;
  }
  await setWishReservation(familyId, listId, itemId, null);
}

/** Flytt eldre reservedBy* på item over i secrets, så eieren ikke kan lese dem. */
export async function migrateLegacyReservations(familyId, listId, items) {
  const legacy = (items || []).filter(hasLegacyReservationFields);
  if (!legacy.length) return 0;
  await Promise.all(legacy.map((item) => setWishReservation(familyId, listId, item.id, {
    reservedByUid: item.reservedByUid || null,
    reservedByName: item.reservedByName || '',
    reservedAt: item.reservedAt || null,
    purchasedByUid: item.purchasedByUid || null,
    purchasedByName: item.purchasedByName || '',
    purchasedAt: item.purchasedAt || null,
  })));
  return legacy.length;
}

export async function setWishlistSharing(familyId, listId, patch) {
  await updateWishlist(familyId, listId, {
    visibility: patch.visibility,
    published: patch.published,
    viewerUids: patch.viewerUids || [],
    sharedFamilyIds: patch.sharedFamilyIds || [],
  });
}

export function formatWishPrice(price, currency = 'NOK') {
  if (price == null || Number.isNaN(Number(price))) return null;
  const n = Number(price);
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: currency || 'NOK',
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${currency || 'kr'}`;
  }
}

export function formatOccasionDate(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return null;
  }
}

