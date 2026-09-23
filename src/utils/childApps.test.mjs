import assert from 'node:assert/strict';
import {
  CHILD_APP_DEFAULT_OFF,
  CHILD_RESTRICTABLE_APPS,
  defaultChildAppAllowed,
  groupedChildRestrictableApps,
  mergeAllowedApps,
  isChildAppAllowed,
  applyChildAppRestrictions,
} from './childApps.js';

assert.ok(CHILD_APP_DEFAULT_OFF.has('holdings'), 'Kjøretøy er av som standard');
assert.ok(CHILD_APP_DEFAULT_OFF.has('boligmappa'));
assert.ok(CHILD_APP_DEFAULT_OFF.has('documents'));
assert.equal(CHILD_APP_DEFAULT_OFF.has('chores'), false);
assert.equal(CHILD_APP_DEFAULT_OFF.has('books'), false);
assert.equal(CHILD_APP_DEFAULT_OFF.has('wishes'), false);
assert.equal(CHILD_APP_DEFAULT_OFF.has('games'), false);

assert.ok(CHILD_RESTRICTABLE_APPS.some((a) => a.id === 'holdings'));
assert.ok(CHILD_RESTRICTABLE_APPS.some((a) => a.id === 'albums'));
assert.ok(CHILD_RESTRICTABLE_APPS.some((a) => a.id === 'wall'));
assert.ok(CHILD_RESTRICTABLE_APPS.some((a) => a.id === 'boligmappa'));

assert.equal(defaultChildAppAllowed('holdings'), false);
assert.equal(defaultChildAppAllowed('chores'), true);
assert.equal(defaultChildAppAllowed('ai', { aiEnabled: true }), true);
assert.equal(defaultChildAppAllowed('ai', { aiEnabled: false }), false);

{
  const fresh = mergeAllowedApps(null);
  assert.equal(fresh.holdings, false);
  assert.equal(fresh.boligmappa, false);
  assert.equal(fresh.documents, false);
  assert.equal(fresh.location, false);
  assert.equal(fresh.albums, true);
  assert.equal(fresh.wall, true);
  assert.equal(fresh.scratchMap, true);
  assert.equal(fresh.reiseplanlegger, true);
  assert.equal(fresh.rememberDates, true);
  assert.equal(fresh.chores, true);
  assert.equal(fresh.books, true);
  assert.equal(fresh.wishes, true);
  assert.equal(fresh.games, true);
  assert.equal(fresh.chat, true);
  assert.equal(fresh.ai, true);
}

{
  const saved = mergeAllowedApps({ holdings: true, chores: false, quiz: false });
  assert.equal(saved.holdings, true, 'explicit on is kept');
  assert.equal(saved.chores, false, 'explicit off is kept');
  assert.equal(saved.games, false, 'legacy quiz maps to games');
  assert.equal(saved.documents, false, 'unset adult apps stay default-off');
}

{
  const aiOff = mergeAllowedApps(null, { aiEnabled: false });
  assert.equal(aiOff.ai, false);
}

{
  const groups = groupedChildRestrictableApps();
  assert.deepEqual(
    groups.map((g) => g.id),
    ['daily', 'school', 'memories', 'family', 'vehicles', 'house'],
  );
  const vehicles = groups.find((g) => g.id === 'vehicles');
  assert.deepEqual(vehicles.apps.map((a) => a.id), ['holdings']);
  const daily = groups.find((g) => g.id === 'daily');
  assert.ok(daily.apps.some((a) => a.id === 'ai'), 'Chat med AI sits with Chat under Hverdag');
  assert.ok(daily.apps.some((a) => a.id === 'chat'));
  const family = groups.find((g) => g.id === 'family');
  assert.equal(family.apps.some((a) => a.id === 'ai'), false);
  const allIds = groups.flatMap((g) => g.apps.map((a) => a.id));
  assert.equal(allIds.length, CHILD_RESTRICTABLE_APPS.length);
  assert.equal(new Set(allIds).size, CHILD_RESTRICTABLE_APPS.length);
}

{
  const allowed = mergeAllowedApps(null);
  assert.equal(isChildAppAllowed(allowed, 'holdings'), false);
  assert.equal(isChildAppAllowed(allowed, 'chores'), true);
  assert.equal(isChildAppAllowed(allowed, 'home'), true);

  const sections = applyChildAppRestrictions(
    [
      { id: 'vehicles', title: 'Kjøretøy', items: [{ id: 'holdings' }] },
      { id: 'family', title: 'Familien', items: [{ id: 'chores' }, { id: 'books' }] },
    ],
    allowed,
  );
  assert.equal(sections.find((s) => s.id === 'vehicles'), undefined);
  assert.deepEqual(
    sections.find((s) => s.id === 'family').items.map((i) => i.id),
    ['chores', 'books'],
  );
}

console.log('childApps.test.mjs ok');
