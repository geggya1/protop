import assert from 'node:assert/strict';

/**
 * Pure helpers mirroring groups.js pending-invite activation rules.
 * Firestore-backed activateExistingMember is covered by integration usage.
 */

function isPendingMemberInvite(person) {
  if (!person) return false;
  if (person.inviteStatus === 'pending') return true;
  if (person.placeholder === true && person.inviteStatus !== 'accepted' && person.inviteStatus !== 'declined') {
    return person.active === false;
  }
  return false;
}

function shouldCompleteMembershipOnActivate(parent) {
  return isPendingMemberInvite(parent);
}

assert.equal(isPendingMemberInvite(null), false);
assert.equal(isPendingMemberInvite({ inviteStatus: 'pending', active: false }), true);
assert.equal(isPendingMemberInvite({
  inviteKind: 'existing',
  inviteStatus: 'pending',
  placeholder: true,
  active: false,
  uid: 'uidVigdis',
}), true);
assert.equal(isPendingMemberInvite({ inviteStatus: 'accepted', active: true }), false);
assert.equal(isPendingMemberInvite({ placeholder: true, active: false }), true);
assert.equal(isPendingMemberInvite({ placeholder: true, inviteStatus: 'declined', active: false }), false);
assert.equal(isPendingMemberInvite({ active: false, archived: true, inviteStatus: 'accepted' }), false);

assert.equal(
  shouldCompleteMembershipOnActivate({
    inviteKind: 'existing',
    inviteStatus: 'pending',
    active: false,
    uid: 'abc',
  }),
  true,
);
assert.equal(
  shouldCompleteMembershipOnActivate({ active: false, archived: true, inviteStatus: 'accepted' }),
  false,
);

console.log('groups.memberActivate.test.mjs: ok');
