import assert from 'node:assert/strict';
import {
  PREFER_APP_KEY,
  hasPreferApp,
  markPreferApp,
  clearPreferApp,
  isStandaloneDisplay,
  shouldOpenAppFromMarketing,
} from './preferApp.js';

const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  },
  navigator: { standalone: false },
  matchMedia: () => ({ matches: false }),
};

clearPreferApp();
assert.equal(hasPreferApp(), false);
assert.equal(isStandaloneDisplay(), false);
assert.equal(shouldOpenAppFromMarketing(), false, 'browser without prefer stays on marketing');

markPreferApp();
assert.equal(hasPreferApp(), true);
assert.equal(window.localStorage.getItem(PREFER_APP_KEY), '1');
assert.equal(shouldOpenAppFromMarketing(), false, 'prefer alone is not enough without standalone');

window.navigator.standalone = true;
assert.equal(isStandaloneDisplay(), true);
assert.equal(shouldOpenAppFromMarketing(), true, 'signed-in PWA may enter the app');

clearPreferApp();
assert.equal(shouldOpenAppFromMarketing(), false, 'logged-out PWA must keep marketing homepage');

window.navigator.standalone = false;
window.matchMedia = (q) => ({
  matches: q.includes('display-mode: standalone'),
});
markPreferApp();
assert.equal(isStandaloneDisplay(), true);
assert.equal(shouldOpenAppFromMarketing(), true);

console.log('preferApp.test.mjs: ok');
