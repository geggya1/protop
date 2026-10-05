import assert from 'assert';
import {
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

console.log('webBuildRefresh: ok');
