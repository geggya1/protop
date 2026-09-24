import assert from 'node:assert/strict';
import {
  isFamilySharedWishlist,
  isWishlistSubject,
  shouldHideReservations,
  canReserveWish,
  canPurchaseWish,
  canViewWishlist,
  canShareWishlist,
  wishlistVisibilityMode,
  isWishlistDraft,
  resolveWishlistViewerIds,
  resolveWishlistViewers,
  shareStateFromList,
  buildWishlistSharePatch,
  defaultCreateVisibility,
  splitWishlists,
  stripReservationFields,
  mergeWishSecrets,
  wishReservationStatus,
  reservationWhoLabel,
  hasLegacyReservationFields,
  wishlistSecretUids,
  mergeSharedWishlistsForHub,
} from './wishlistVisibility.js';

const geir = { uid: 'geir', id: 'geir', name: 'Geir Ove Andersen', role: 'parent', photoURL: 'g.jpg' };
const partner = { uid: 'partner', id: 'partner', name: 'Kari', role: 'parent' };
const child = {
  uid: 'child-uid', id: 'adelen', docId: 'adelen', childId: 'adelen',
  name: 'Adelen', role: 'child', photoURL: 'a.jpg',
};
const members = [geir, partner, child];

const ownList = {
  id: 'jul',
  name: 'Ønskeliste Jul - Geir Ove',
  subjectUid: 'geir',
  ownerUid: 'geir',
  createdBy: 'geir',
  visibility: 'private',
  published: false,
  viewerUids: ['geir'],
  familyId: 'fam-a',
};

const familyList = {
  id: 'shared',
  name: 'Familiens ønskeliste',
  scope: 'family',
  kind: 'family_shared',
  visibility: 'family',
  published: true,
  familyId: 'fam-a',
};

const childList = {
  id: 'kid',
  name: 'Adelen ønskeliste',
  forChildId: 'adelen',
  forChildName: 'Adelen',
  subjectUid: 'child-uid',
  ownerUid: 'child-uid',
  createdBy: 'geir',
  visibility: 'family',
  published: true,
  familyId: 'fam-a',
};

const sharedList = {
  id: 'emt',
  name: 'Ønskeliste EMT',
  subjectUid: 'geir',
  ownerUid: 'geir',
  createdBy: 'geir',
  visibility: 'shared',
  published: true,
  viewerUids: ['geir', 'partner'],
  sharedFamilyIds: ['fam-b'],
  familyId: 'fam-a',
};

assert.equal(isFamilySharedWishlist(familyList), true);
assert.equal(isFamilySharedWishlist(ownList), false);
assert.equal(isWishlistDraft(ownList), true);
assert.equal(isWishlistDraft(familyList), false);
assert.equal(wishlistVisibilityMode(ownList), 'private');
assert.equal(wishlistVisibilityMode({}), 'family');

assert.equal(isWishlistSubject(ownList, { uid: 'geir' }), true);
assert.equal(isWishlistSubject(ownList, { uid: 'partner' }), false);
assert.equal(isWishlistSubject(childList, { uid: 'child-uid', childId: 'adelen' }), true);
assert.equal(isWishlistSubject(childList, { uid: 'geir' }), false);
assert.equal(isWishlistSubject(familyList, { uid: 'geir' }), false);

assert.equal(shouldHideReservations(ownList, { uid: 'geir' }), true);
assert.equal(shouldHideReservations(ownList, { uid: 'partner' }), false);
assert.equal(shouldHideReservations(childList, { uid: 'child-uid', childId: 'adelen' }), true);
assert.equal(shouldHideReservations(childList, { uid: 'geir' }), false);
assert.equal(shouldHideReservations(familyList, { uid: 'geir' }), false);
assert.ok(wishlistSecretUids(ownList).includes('geir'));
assert.ok(!wishlistSecretUids(childList).includes('geir'));

assert.equal(hasLegacyReservationFields({ reservedByUid: 'partner' }), true);
assert.equal(hasLegacyReservationFields({ purchasedByUid: 'partner' }), true);
assert.equal(hasLegacyReservationFields({ id: 'i1', title: 'Lego' }), false);
assert.equal(hasLegacyReservationFields(null), false);

const reservedItem = { id: 'i1', title: 'Lego', reservedByUid: 'partner', reservedByName: 'Kari' };
assert.equal(canReserveWish(ownList, reservedItem, { uid: 'geir' }), false);
assert.equal(canReserveWish(ownList, { id: 'i2' }, { uid: 'partner' }), true);
assert.equal(canReserveWish(ownList, reservedItem, { uid: 'other' }), false);
assert.equal(canPurchaseWish(ownList, reservedItem, { uid: 'partner' }), true);
assert.equal(canPurchaseWish(ownList, reservedItem, { uid: 'geir' }), false);
assert.equal(canPurchaseWish(ownList, reservedItem, { uid: 'other' }), false);

assert.equal(canViewWishlist(ownList, { uid: 'geir', familyId: 'fam-a' }), true);
assert.equal(canViewWishlist(ownList, { uid: 'partner', familyId: 'fam-a' }), false);
assert.equal(canViewWishlist(familyList, { uid: 'partner', familyId: 'fam-a' }), true);
assert.equal(canViewWishlist(childList, { uid: 'geir', familyId: 'fam-a' }), true);
assert.equal(canViewWishlist(sharedList, { uid: 'partner', familyId: 'fam-a' }), true);
assert.equal(canViewWishlist(sharedList, { uid: 'child-uid', familyId: 'fam-a' }), false);
assert.equal(canViewWishlist(sharedList, { uid: 'bestemor', familyId: 'fam-b' }), true);
assert.equal(canViewWishlist(sharedList, { uid: 'bestemor', familyId: 'fam-c' }), false);
assert.equal(canViewWishlist(ownList, { uid: 'stranger', familyId: 'fam-c' }), false);

// Venner: valgfritt via viewerUids — ikke standard ved opprettelse
{
  const friendShared = {
    ...ownList,
    id: 'jul-friends',
    visibility: 'shared',
    published: true,
    viewerUids: ['geir', 'friend-1'],
  };
  assert.equal(canViewWishlist(friendShared, { uid: 'friend-1', familyId: 'fam-x' }), true);
  assert.equal(canViewWishlist(friendShared, { uid: 'stranger', familyId: 'fam-x' }), false);
  assert.equal(canShareWishlist(childList, { uid: 'geir', isParent: true, isAdmin: true }), true);
  const friendPatch = buildWishlistSharePatch({
    mode: 'shared',
    uid: 'geir',
    ownerIds: ['geir'],
    viewerUids: ['geir', 'friend-1'],
  });
  assert.equal(friendPatch.visibility, 'shared');
  assert.ok(friendPatch.viewerUids.includes('friend-1'));
}

const otherAdultList = {
  ...ownList,
  id: 'kari',
  subjectUid: 'partner',
  ownerUid: 'partner',
  createdBy: 'partner',
  visibility: 'family',
  published: true,
  viewerUids: ['partner', 'geir'],
};
assert.equal(canViewWishlist(otherAdultList, { uid: 'geir', familyId: 'fam-a' }), true);

assert.equal(canShareWishlist(ownList, { uid: 'geir' }), true);
assert.equal(canShareWishlist(ownList, { uid: 'partner' }), false);
assert.equal(canShareWishlist(familyList, { uid: 'geir', isParent: true }), true);

const viewerIds = resolveWishlistViewerIds(sharedList, {
  members,
  familyId: 'fam-a',
  families: [{ id: 'fam-b', name: 'Hansen', members: ['bestemor'] }],
});
assert.ok(viewerIds.includes('geir'));
assert.ok(viewerIds.includes('partner'));
assert.ok(viewerIds.includes('bestemor'));

const viewers = resolveWishlistViewers(ownList, { members, familyId: 'fam-a' });
assert.equal(viewers.draft, true);
assert.equal(viewers.label, 'Kun du');
assert.equal(viewers.people[0].uid, 'geir');

const familyViewers = resolveWishlistViewers(familyList, { members, familyId: 'fam-a' });
assert.equal(familyViewers.mode, 'family');
assert.equal(familyViewers.people.length, 3);

const crossViewers = resolveWishlistViewers(sharedList, {
  members,
  familyId: 'fam-a',
  families: [{ id: 'fam-b', name: 'Hansen', members: ['bestemor'] }],
});
assert.match(crossViewers.label, /Hansen/);

const createOwn = defaultCreateVisibility({ uid: 'geir', members });
assert.equal(createOwn.visibility, 'private');
assert.equal(createOwn.published, false);
assert.deepEqual(createOwn.viewerUids, ['geir']);
assert.ok(!createOwn.viewerUids.includes('friend-1'), 'friends are never default viewers');

const createChild = defaultCreateVisibility({ uid: 'geir', forChildId: 'adelen', members });
assert.equal(createChild.visibility, 'family');
assert.ok(createChild.viewerUids.includes('geir'));
assert.ok(createChild.viewerUids.includes('child-uid'));
assert.ok(!createChild.viewerUids.includes('friend-1'), 'child lists do not auto-share with friends');

const createFamily = defaultCreateVisibility({ uid: 'geir', scope: 'family', members });
assert.equal(createFamily.visibility, 'family');
assert.equal(createFamily.published, true);

const privatePatch = buildWishlistSharePatch({
  mode: 'private',
  uid: 'geir',
  ownerIds: ['geir'],
});
assert.equal(privatePatch.published, false);
assert.deepEqual(privatePatch.viewerUids, ['geir']);

const familyPatch = buildWishlistSharePatch({
  mode: 'family',
  uid: 'geir',
  ownerIds: ['geir'],
  familyMemberUids: ['geir', 'partner', 'child-uid'],
  sharedFamilyIds: ['fam-b'],
  otherFamilyMemberUids: ['bestemor'],
});
assert.equal(familyPatch.visibility, 'family');
assert.ok(familyPatch.viewerUids.includes('bestemor'));
assert.deepEqual(familyPatch.sharedFamilyIds, ['fam-b']);

const customPatch = buildWishlistSharePatch({
  mode: 'shared',
  uid: 'geir',
  ownerIds: ['geir'],
  viewerUids: ['partner'],
  sharedFamilyIds: ['fam-b'],
  otherFamilyMemberUids: ['bestemor'],
});
assert.equal(customPatch.visibility, 'shared');
assert.ok(customPatch.viewerUids.includes('partner'));
assert.ok(customPatch.viewerUids.includes('bestemor'));
assert.ok(customPatch.viewerUids.includes('geir'));

const fromList = shareStateFromList(ownList, { uid: 'geir', members });
assert.equal(fromList.mode, 'private');

const split = splitWishlists(
  [ownList, familyList, childList, { ...sharedList, familyId: 'fam-b', name: 'Jul hos Hansen' }],
  { uid: 'geir', familyId: 'fam-a' },
);
assert.equal(split.mine.length, 1);
assert.equal(split.familyShared.length, 1);
assert.equal(split.family.length, 1);
assert.equal(split.fromOthers.length, 1);

const childSplit = splitWishlists([ownList, childList, familyList], {
  uid: 'child-uid',
  profileChildId: 'adelen',
  familyId: 'fam-a',
});
assert.equal(childSplit.mine.length, 1);
assert.equal(childSplit.mine[0].id, 'kid');

const stripped = stripReservationFields({
  id: 'i1', title: 'Lego', reservedByUid: 'partner', reservedByName: 'Kari', purchasedByUid: 'x',
});
assert.equal(stripped.title, 'Lego');
assert.equal(stripped.reservedByUid, undefined);
assert.equal(stripped.purchasedByUid, undefined);

const hidden = mergeWishSecrets(
  [{ id: 'i1', title: 'Lego', reservedByUid: 'legacy' }],
  [{ id: 'i1', reservedByUid: 'partner', reservedByName: 'Kari', status: 'reserved' }],
  { hideReservations: true },
);
assert.equal(hidden[0].reservedByUid, undefined);
assert.equal(hidden[0].title, 'Lego');

const shown = mergeWishSecrets(
  [{ id: 'i1', title: 'Lego' }],
  [{ id: 'i1', reservedByUid: 'partner', purchasedByUid: 'partner', status: 'purchased' }],
  { hideReservations: false },
);
assert.equal(wishReservationStatus(shown[0]), 'purchased');
assert.equal(reservationWhoLabel(shown[0], 'partner'), 'Du har kjøpt');
assert.equal(reservationWhoLabel({
  purchasedByUid: 'partner', purchasedByName: 'Kari', status: 'purchased',
}, 'geir'), 'Kjøpt av Kari');
assert.equal(reservationWhoLabel({
  reservedByUid: 'partner', reservedByName: 'Kari',
}, 'geir'), 'Reservert av Kari');

{
  const rows = mergeSharedWishlistsForHub(
    [{
      listId: 'celine-list',
      title: 'Celine ønskeliste',
      familyId: 'fam-sharer',
      sharedBy: 'geir',
      sharedByName: 'Geir',
    }],
    [],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Celine ønskeliste');
  assert.equal(rows[0].familyId, 'fam-sharer');
  assert.equal(rows[0].sourceFamilyName, 'Delt av Geir');
  assert.equal(rows[0].sharedByFriend, true);
}

{
  const rows = mergeSharedWishlistsForHub(
    [{ listId: 'celine-list', title: 'Celine ønskeliste', familyId: 'fam-sharer', sharedByName: 'Geir' }],
    [{
      id: 'celine-list',
      name: 'Celine ønskeliste',
      familyId: 'fam-sharer',
      itemCount: 3,
      sourceFamilyName: 'Annen familie',
      crossFamily: true,
    }],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Celine ønskeliste');
  assert.equal(rows[0].itemCount, 3);
  assert.equal(rows[0].sourceFamilyName, 'Delt av Geir');
}

console.log('wishlistVisibility.test.mjs: ok');
