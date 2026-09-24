import assert from 'node:assert/strict';
import { memberDocGrantsAccess } from './memberAccess.js';

assert.equal(memberDocGrantsAccess(null), false);
assert.equal(memberDocGrantsAccess({}), true);
assert.equal(memberDocGrantsAccess({ active: true }), true);
assert.equal(memberDocGrantsAccess({ active: false }), false);
assert.equal(memberDocGrantsAccess({ active: false, inviteStatus: 'pending' }), true);
assert.equal(memberDocGrantsAccess({ active: false, inviteStatus: 'accepted' }), false);
assert.equal(memberDocGrantsAccess({ deleted: true, active: true }), false);
assert.equal(memberDocGrantsAccess({ deleted: true, active: false }), false);
assert.equal(memberDocGrantsAccess({ leftAt: new Date(), active: true }), false);
assert.equal(memberDocGrantsAccess({ leftAt: null, active: true }), true);
assert.equal(memberDocGrantsAccess({ deleted: false, active: true, leftAt: null }), true);

console.log('memberAccess.test.mjs: ok');
