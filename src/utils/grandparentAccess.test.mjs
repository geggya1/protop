import assert from 'node:assert/strict';
import {
  GRANDPARENT_LOCKED_APP_IDS,
  GRANDPARENT_INVITE_APPS,
  isGrandparentMember,
  mergeGrandparentModules,
  isGrandparentAppAllowed,
  applyGrandparentAppRestrictions,
  isFullParentActor,
  canGrandparentViewCalendarEvent,
  filterCalendarEventsForGrandparent,
  familyShareMemberUids,
} from './grandparentAccess.js';

assert.ok(GRANDPARENT_LOCKED_APP_IDS.has('familyTree'));
assert.ok(GRANDPARENT_LOCKED_APP_IDS.has('rememberDates'));
assert.ok(GRANDPARENT_LOCKED_APP_IDS.has('wall'));
assert.ok(GRANDPARENT_INVITE_APPS.some((a) => a.id === 'wishes'));
assert.ok(GRANDPARENT_INVITE_APPS.some((a) => a.id === 'albums'));
assert.ok(GRANDPARENT_INVITE_APPS.some((a) => a.id === 'games'));
assert.ok(GRANDPARENT_INVITE_APPS.some((a) => a.id === 'plan'));

assert.equal(isGrandparentMember({ adultRole: 'grandparent' }), true);
assert.equal(isGrandparentMember({ isGrandparent: true }), true);
assert.equal(isGrandparentMember({ adultRole: 'parent' }), false);
assert.equal(isGrandparentMember(null), false);

{
  const mods = mergeGrandparentModules(null);
  assert.equal(mods.wishes, false);
  assert.equal(mods.albums, false);
  assert.equal(mods.games, false);
}

{
  const mods = mergeGrandparentModules({ wishes: true, reiseplanlegger: true });
  assert.equal(mods.wishes, true);
  assert.equal(mods.reiseplanlegger, true);
  assert.equal(mods.scratchMap, true, 'reiseplanlegger mirrors scratchMap when unset');
  assert.equal(mods.albums, false);
}

assert.equal(isGrandparentAppAllowed({}, 'familyTree'), true);
assert.equal(isGrandparentAppAllowed({}, 'home'), true);
assert.equal(isGrandparentAppAllowed({}, 'wishes'), false);
assert.equal(isGrandparentAppAllowed({ wishes: true }, 'wishes'), true);
assert.equal(isGrandparentAppAllowed({ wishes: true }, 'shop'), false);

{
  const sections = [
    {
      id: 'main',
      items: [
        { id: 'home' },
        { id: 'chat' },
        { id: 'plan' },
      ],
    },
    {
      id: 'tools',
      items: [
        { id: 'familyTree' },
        { id: 'wishes' },
        { id: 'wall' },
      ],
    },
  ];
  const filtered = applyGrandparentAppRestrictions(sections, { plan: true });
  assert.deepEqual(filtered[0].items.map((i) => i.id), ['home', 'plan']);
  assert.deepEqual(filtered[1].items.map((i) => i.id), ['familyTree', 'wall']);
}

assert.equal(isFullParentActor({ isParent: true, isGrandparent: false }), true);
assert.equal(isFullParentActor({ isParent: true, isGrandparent: true }), false);
assert.equal(isFullParentActor({ isParent: false }), false);

{
  const evFamily = { audience: 'family', memberIds: [] };
  const evInvite = { memberIds: ['gp1', 'p1'] };
  const evMine = { createdBy: 'gp1' };
  assert.equal(canGrandparentViewCalendarEvent(evFamily, 'gp1'), false);
  assert.equal(canGrandparentViewCalendarEvent(evInvite, 'gp1'), true);
  assert.equal(canGrandparentViewCalendarEvent(evMine, 'gp1'), true);
  assert.deepEqual(
    filterCalendarEventsForGrandparent([evFamily, evInvite, evMine], 'gp1').map((e) => e.memberIds || e.createdBy),
    [['gp1', 'p1'], 'gp1'],
  );
}

{
  const members = [
    { uid: 'p1', role: 'parent' },
    { uid: 'gp1', role: 'parent', adultRole: 'grandparent' },
    { uid: 'k1', role: 'child' },
  ];
  assert.deepEqual(familyShareMemberUids(members).sort(), ['k1', 'p1']);
}

console.log('grandparentAccess.test.mjs ok');
