import assert from 'node:assert/strict';
import {
  isImmersivePhotoShell,
  isImmersivePhotoChromeOnly,
} from './immersivePhotoShell.js';

const parentPhone = {
  isPhone: true,
  isParent: true,
  asChildView: false,
  kitchenMode: false,
};

assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'home' }), true);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'more', moreSubView: null }), true);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'more', moreSubView: 'shop' }), false);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'plan' }), false);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'more', isPhone: false }), false);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'home', kitchenMode: true }), false);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'home', simpleChildUi: true }), false);

const childPhone = {
  isPhone: true,
  isParent: false,
  asChildView: true,
  kitchenMode: false,
};

assert.equal(isImmersivePhotoShell({ ...childPhone, tab: 'home' }), true);
assert.equal(isImmersivePhotoShell({ ...childPhone, tab: 'more', moreSubView: null }), true);
assert.equal(isImmersivePhotoShell({ ...childPhone, tab: 'more', moreSubView: 'games' }), false);
assert.equal(isImmersivePhotoShell({ ...childPhone, tab: 'home', simpleChildUi: true }), false);
assert.equal(isImmersivePhotoShell({ ...parentPhone, tab: 'more', asChildView: true }), true);
assert.equal(isImmersivePhotoShell({
  ...parentPhone, tab: 'more', asChildView: true, simpleChildUi: true,
}), false);

assert.equal(isImmersivePhotoChromeOnly({ ...parentPhone, tab: 'home' }), true);
assert.equal(isImmersivePhotoChromeOnly({ ...parentPhone, tab: 'more' }), true);
assert.equal(isImmersivePhotoChromeOnly({ ...parentPhone, tab: 'more', moreSubView: 'games' }), false);
assert.equal(isImmersivePhotoChromeOnly({ ...parentPhone, tab: 'home', simpleChildUi: true }), false);
assert.equal(isImmersivePhotoChromeOnly({ ...childPhone, tab: 'home' }), true);
assert.equal(isImmersivePhotoChromeOnly({ ...childPhone, tab: 'more' }), true);
assert.equal(isImmersivePhotoChromeOnly({
  ...childPhone, tab: 'more', moreSubView: 'books',
}), false);
assert.equal(isImmersivePhotoChromeOnly({
  ...parentPhone, tab: 'more', asChildView: true, simpleChildUi: true,
}), false);

console.log('immersivePhotoShell.test.mjs: ok');
