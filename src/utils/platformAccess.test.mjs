import assert from 'node:assert/strict';
import {
  canAccessAllPlatforms,
  canUsePlatformType,
  assertCanCreatePlatformType,
  visibleGroupsForUser,
  PLATFORM_DEV_EMAILS,
} from './platformAccess.js';

const DEV = PLATFORM_DEV_EMAILS[0];
const OTHER = 'ola@example.com';

assert.equal(canAccessAllPlatforms(DEV), true);
assert.equal(canAccessAllPlatforms({ email: 'GOA@invest-as.no' }), true);
assert.equal(canAccessAllPlatforms(OTHER), false);
assert.equal(canAccessAllPlatforms(null), false);
assert.equal(canAccessAllPlatforms({ email: '' }), false);

assert.equal(canUsePlatformType('family', OTHER), true);
assert.equal(canUsePlatformType('organization', OTHER), true);
assert.equal(canUsePlatformType('company', OTHER), true);
assert.equal(canUsePlatformType('team', OTHER), false);
assert.equal(canUsePlatformType('classroom', OTHER), false);
assert.equal(canUsePlatformType('friends', OTHER), false);
assert.equal(canUsePlatformType('team', DEV), true);

assert.doesNotThrow(() => assertCanCreatePlatformType('organization', OTHER));
assert.throws(() => assertCanCreatePlatformType('team', OTHER), { code: 'platform-restricted' });
assert.doesNotThrow(() => assertCanCreatePlatformType('team', DEV));

const groups = [
  { id: '1', type: 'family', isPersonal: true },
  { id: '2', type: 'team' },
  { id: '3', type: 'classroom' },
  { id: '4', type: 'organization' },
  { id: '5', type: 'family' },
];
assert.deepEqual(visibleGroupsForUser(groups, OTHER).map((g) => g.id), ['1', '4']);
assert.deepEqual(visibleGroupsForUser(groups, DEV).map((g) => g.id), ['1', '4']);

console.log('platformAccess.test.mjs ok');
