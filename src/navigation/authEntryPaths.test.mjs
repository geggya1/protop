import assert from 'node:assert/strict';
import {
  isAuthEntryPath,
  resolveAuthEntryLinkState,
  AUTH_ENTRY_PATHS,
} from './authEntryPaths.js';

assert.equal(isAuthEntryPath('/signup'), true);
assert.equal(isAuthEntryPath('signup'), true);
assert.equal(isAuthEntryPath('/login'), true);
assert.equal(isAuthEntryPath('/register?email=a@b.c'), true);
assert.equal(isAuthEntryPath('/start'), true);
assert.equal(isAuthEntryPath('/hjem'), false);
assert.equal(isAuthEntryPath('/settings/profile'), false);
assert.ok(AUTH_ENTRY_PATHS.has('signup'));

assert.deepEqual(
  resolveAuthEntryLinkState('/signup', { signedIn: true }),
  { routes: [{ name: 'Home' }] },
);
assert.deepEqual(
  resolveAuthEntryLinkState('/login', { signedIn: true }),
  { routes: [{ name: 'Home' }] },
);
assert.equal(resolveAuthEntryLinkState('/signup', { signedIn: false }), null);
assert.equal(resolveAuthEntryLinkState('/hjem', { signedIn: true }), null);

console.log('authEntryPaths.test.mjs ok');
