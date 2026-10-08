import assert from 'assert';
import {
  claimBuildReload,
  isLocalWebHost,
  shouldReloadForRemoteBuild,
  shouldSkipWebBuildRefresh,
} from './webBuildRefresh.js';

assert.strictEqual(isLocalWebHost('localhost'), true);
assert.strictEqual(isLocalWebHost('127.0.0.1'), true);
assert.strictEqual(isLocalWebHost('protop.no'), false);

assert.strictEqual(shouldSkipWebBuildRefresh({ hostname: 'localhost' }), true);
assert.strictEqual(shouldSkipWebBuildRefresh({ hostname: 'protop.no', oauthReturn: true }), true);
assert.strictEqual(shouldSkipWebBuildRefresh({ hostname: 'protop.no' }), false);

assert.strictEqual(shouldReloadForRemoteBuild('a', 'b'), true);
assert.strictEqual(shouldReloadForRemoteBuild('a', 'a'), false);
assert.strictEqual(shouldReloadForRemoteBuild('a', ''), false);

const memory = () => {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
  };
};
const first = memory();
assert.strictEqual(claimBuildReload(first), true);
assert.strictEqual(claimBuildReload(first), false);
assert.strictEqual(claimBuildReload(null), false);

console.log('webBuildRefresh: ok');
