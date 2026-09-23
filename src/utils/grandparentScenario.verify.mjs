/**
 * End-to-end logic verification for grandparent access — run twice.
 * Pure functions only (no Firebase).
 */
import assert from 'node:assert/strict';
import {
  isGrandparentMember,
  mergeGrandparentModules,
  isGrandparentAppAllowed,
  applyGrandparentAppRestrictions,
  canGrandparentViewCalendarEvent,
  familyShareMemberUids,
} from './grandparentAccess.js';
import { canViewAlbum } from './albumVisibility.js';
import { canViewWishlist } from './wishlistVisibility.js';
import { canViewTrip } from './reiseplanleggerLogic.js';
import { eventVisibleToUser } from './events.js';

function normalizeRole(value, asGrandparent) {
  if (value === 'grandparent' || asGrandparent === true) return 'grandparent';
  return 'parent';
}

function simulateInvite({ asGrandparent }) {
  const adultRole = normalizeRole(null, asGrandparent);
  const modules = mergeGrandparentModules(null);
  return {
    adultRole,
    isGrandparent: adultRole === 'grandparent',
    admin: false,
    grandparentModules: modules,
  };
}

function simulateAdminOverride(member, { asGrandparent, enableModules = [] }) {
  const adultRole = normalizeRole(null, asGrandparent);
  const mods = mergeGrandparentModules(member.grandparentModules);
  for (const id of enableModules) mods[id] = true;
  if (mods.reiseplanlegger) mods.scratchMap = true;
  if (mods.scratchMap) mods.reiseplanlegger = true;
  return {
    ...member,
    adultRole,
    isGrandparent: adultRole === 'grandparent',
    admin: adultRole === 'grandparent' ? false : member.admin,
    grandparentModules: mods,
  };
}

function runScenario(label) {
  // 1) Invite as grandparent
  const gp = simulateInvite({ asGrandparent: true });
  assert.equal(gp.adultRole, 'grandparent');
  assert.equal(isGrandparentMember(gp), true);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'familyTree'), true);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'rememberDates'), true);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'wall'), true);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'wishes'), false);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'albums'), false);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'games'), false);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'plan'), false);
  assert.equal(isGrandparentAppAllowed(gp.grandparentModules, 'chat'), false);

  // 2) Shell filter
  const sections = applyGrandparentAppRestrictions([
    { id: 'main', items: [{ id: 'home' }, { id: 'chat' }, { id: 'plan' }, { id: 'stars' }] },
    { id: 'tools', items: [
      { id: 'familyTree' }, { id: 'rememberDates' }, { id: 'wall' },
      { id: 'wishes' }, { id: 'albums' }, { id: 'games' }, { id: 'shop' },
    ] },
  ], gp.grandparentModules);
  assert.deepEqual(sections.find((s) => s.id === 'main').items.map((i) => i.id), ['home']);
  assert.deepEqual(
    sections.find((s) => s.id === 'tools').items.map((i) => i.id),
    ['familyTree', 'rememberDates', 'wall'],
  );

  // 3) Admin invites into albums + wishes
  const invited = simulateAdminOverride(gp, {
    asGrandparent: true,
    enableModules: ['albums', 'wishes', 'plan', 'games', 'reiseplanlegger', 'activities'],
  });
  assert.equal(isGrandparentAppAllowed(invited.grandparentModules, 'albums'), true);
  assert.equal(isGrandparentAppAllowed(invited.grandparentModules, 'wishes'), true);
  assert.equal(isGrandparentAppAllowed(invited.grandparentModules, 'scratchMap'), true);

  // 4) Content: family album hidden unless explicitly shared
  const familyAlbum = { visibility: 'family', createdBy: 'p1' };
  assert.equal(canViewAlbum(familyAlbum, { uid: 'gp1', isGrandparent: true, isParent: true }), false);
  assert.equal(canViewAlbum({
    ...familyAlbum, viewerUids: ['gp1'],
  }, { uid: 'gp1', isGrandparent: true }), true);

  // 5) Wishlist family shared hidden for gp
  const familyWish = { visibility: 'family', scope: 'family', createdBy: 'p1', ownerUid: 'p1' };
  assert.equal(canViewWishlist(familyWish, { uid: 'gp1', isGrandparent: true }), false);
  assert.equal(canViewWishlist({
    ...familyWish, viewerUids: ['gp1'],
  }, { uid: 'gp1', isGrandparent: true }), true);

  // 6) Trip / calendar invite-only
  assert.equal(canViewTrip({
    visibility: 'family', memberIds: [], createdBy: 'p1',
  }, 'gp1', { isFamilyMember: true, isGrandparent: true }), false);
  assert.equal(canViewTrip({
    memberIds: ['gp1'], createdBy: 'p1',
  }, 'gp1', { isFamilyMember: true, isGrandparent: true }), true);

  assert.equal(canGrandparentViewCalendarEvent({ audience: 'family', memberIds: [] }, 'gp1'), false);
  assert.equal(canGrandparentViewCalendarEvent({ memberIds: ['gp1'] }, 'gp1'), true);
  assert.equal(eventVisibleToUser(
    { audience: 'family', memberIds: [] },
    ['gp1'],
    { isGrandparent: true, members: [{ uid: 'gp1' }] },
  ), false);
  assert.equal(eventVisibleToUser(
    { audience: 'selected', memberIds: ['gp1'] },
    ['gp1'],
    { isGrandparent: true, members: [{ uid: 'gp1', role: 'parent', adultRole: 'grandparent' }] },
  ), true);

  // 7) Family share excludes grandparents
  assert.deepEqual(
    familyShareMemberUids([
      { uid: 'p1', role: 'parent' },
      { uid: 'gp1', role: 'parent', adultRole: 'grandparent' },
      { uid: 'k1', role: 'child' },
    ]).sort(),
    ['k1', 'p1'],
  );

  // 8) Admin override parent → grandparent clears admin
  const parent = { adultRole: 'parent', admin: true, grandparentModules: null };
  const overridden = simulateAdminOverride(parent, { asGrandparent: true });
  assert.equal(overridden.isGrandparent, true);
  assert.equal(overridden.admin, false);

  console.log(`OK ${label}`);
}

runScenario('pass-1');
runScenario('pass-2');
console.log('grandparentScenario.verify.mjs: both passes ok');
