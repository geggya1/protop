import assert from 'node:assert/strict';
import {
  resolveActiveParentBottomId,
  resolveParentBottomNavAction,
  shouldShowParentBottomNav,
  setParentBottomNavChromeHeight,
  getParentBottomNavChromeHeight,
  subscribeParentBottomNavChrome,
} from './parentBottomNav.js';

const ids = ['home', 'plan', 'stars', 'more'];

assert.equal(resolveActiveParentBottomId('home', null, ids), 'home');
assert.equal(resolveActiveParentBottomId('plan', null, ids), 'plan');
assert.equal(resolveActiveParentBottomId('stars', null, ids), 'stars');
assert.equal(resolveActiveParentBottomId('more', null, ids), 'more');
assert.equal(resolveActiveParentBottomId('more', 'shop', ids), 'more');
assert.equal(resolveActiveParentBottomId('more', 'shop', ['home', 'shop', 'more']), 'shop');
assert.equal(resolveActiveParentBottomId('more', 'members', ['home', 'family', 'more']), 'family');
assert.equal(resolveActiveParentBottomId('notes', null, ids), 'more');
assert.equal(resolveActiveParentBottomId('notes', null, ['home', 'plan']), null);
assert.equal(resolveActiveParentBottomId('home', null, []), null);

assert.deepEqual(
  resolveParentBottomNavAction({ id: 'home' }),
  { type: 'tab', tab: 'home' },
);
assert.deepEqual(
  resolveParentBottomNavAction({ id: 'family' }),
  { type: 'tab', tab: 'more', subView: 'members' },
);
assert.deepEqual(
  resolveParentBottomNavAction({ id: 'stars' }),
  { type: 'tab', tab: 'stars' },
);
assert.deepEqual(
  resolveParentBottomNavAction({
    id: 'games',
    action: { type: 'tab', tab: 'more', subView: 'games' },
  }),
  { type: 'tab', tab: 'more', subView: 'games' },
);
assert.deepEqual(
  resolveParentBottomNavAction({ id: 'books' }, {
    books: { action: { type: 'tab', tab: 'more', subView: 'books' } },
  }),
  { type: 'tab', tab: 'more', subView: 'books' },
);
assert.equal(resolveParentBottomNavAction(null), null);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: ['home', 'plan'],
  isParent: true,
  asChildView: false,
  hasRail: false,
  kitchenMode: false,
}), true);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: ['home', 'plan'],
  isParent: true,
}), true);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: ['home', 'plan', 'stars', 'more'],
  asChildView: true,
}), true);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: ['home'],
  isParent: true,
  hasRail: true,
}), false);

assert.equal(shouldShowParentBottomNav({
  ready: false,
  bottomShortcutIds: ['home'],
  isParent: true,
}), false);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: [],
  isParent: true,
}), false);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: ['home', 'plan'],
  isParent: true,
  bottomNavEnabled: false,
}), false);

assert.equal(shouldShowParentBottomNav({
  ready: true,
  bottomShortcutIds: ['home', 'plan'],
  isParent: true,
  bottomNavEnabled: true,
}), true);

setParentBottomNavChromeHeight(0);
assert.equal(getParentBottomNavChromeHeight(), 0);
let notified = null;
const unsub = subscribeParentBottomNavChrome((h) => { notified = h; });
setParentBottomNavChromeHeight(64);
assert.equal(getParentBottomNavChromeHeight(), 64);
assert.equal(notified, 64);
setParentBottomNavChromeHeight(64);
unsub();
setParentBottomNavChromeHeight(0);
assert.equal(getParentBottomNavChromeHeight(), 0);

console.log('parentBottomNav.test.mjs: ok');
