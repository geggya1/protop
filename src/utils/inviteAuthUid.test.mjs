import assert from 'node:assert/strict';
import {
  filterInvitableMembers,
  inviteableFamilyMembers,
  inviteableFriends,
  looksLikeAuthUid,
  memberInviteAuthUid,
  normalizeInviteAuthUids,
  preferAuthUid,
} from './inviteAuthUid.js';

assert.equal(looksLikeAuthUid(''), false);
assert.equal(looksLikeAuthUid('short'), false);
assert.equal(looksLikeAuthUid('abcdefghijklmnopqrst'), false); // 20 = Firestore auto-id
assert.equal(looksLikeAuthUid('AbCdEfGhIjKlMnOpQrStUvWxYz12'), true); // 28

const parent = {
  role: 'parent',
  uid: 'AbCdEfGhIjKlMnOpQrStUvWxYz12',
  id: 'parentDoc1',
  docId: 'parentDoc1',
  name: 'Geir',
};
assert.equal(memberInviteAuthUid(parent), 'AbCdEfGhIjKlMnOpQrStUvWxYz12');

// Stale invite-key on uid, real Auth UID on docId (common after family invite claim)
const parentStaleUid = {
  role: 'parent',
  uid: 'invite-key-short',
  id: 'invite-key-short',
  docId: 'AbCdEfGhIjKlMnOpQrStUvWxYz99',
  name: 'Monica',
};
assert.equal(memberInviteAuthUid(parentStaleUid), 'AbCdEfGhIjKlMnOpQrStUvWxYz99');

assert.equal(preferAuthUid('short', 'AbCdEfGhIjKlMnOpQrStUvWxYz12'), 'AbCdEfGhIjKlMnOpQrStUvWxYz12');
assert.equal(preferAuthUid('abcdefghijklmnopqrst', 'nope'), 'abcdefghijklmnopqrst');

const childNoAuth = {
  role: 'child',
  uid: 'childDocABC1234567890', // same as doc — AppContext fallback
  id: 'childDocABC1234567890',
  docId: 'childDocABC1234567890',
  childId: 'childDocABC1234567890',
  name: 'Emma',
};
assert.equal(memberInviteAuthUid(childNoAuth), null);

const childWithAuth = {
  role: 'child',
  uid: 'ChildAuthUid123456789012345',
  id: 'childDocXYZ',
  docId: 'childDocXYZ',
  childId: 'childDocXYZ',
  name: 'Lars',
};
assert.equal(memberInviteAuthUid(childWithAuth), 'ChildAuthUid123456789012345');

const friend = {
  role: 'friend',
  isFriend: true,
  friendUid: 'FriendAuthUid12345678901234567',
  name: 'Per',
};
assert.equal(memberInviteAuthUid(friend), 'FriendAuthUid12345678901234567');

const invitable = filterInvitableMembers([parent, childNoAuth, childWithAuth, friend]);
assert.deepEqual(
  invitable.map((m) => m.name).sort(),
  ['Geir', 'Lars', 'Per'],
);

assert.deepEqual(
  normalizeInviteAuthUids(
    ['AbCdEfGhIjKlMnOpQrStUvWxYz12', 'abcdefghijklmnopqrst', 'nope', 'ChildAuthUid123456789012345'],
    'AbCdEfGhIjKlMnOpQrStUvWxYz12',
  ),
  ['ChildAuthUid123456789012345'],
);

assert.deepEqual(
  inviteableFamilyMembers([parent, childNoAuth, childWithAuth, parentStaleUid], parent.uid).map((m) => m.name),
  ['Lars', 'Monica'],
);
assert.deepEqual(
  inviteableFriends([friend, { ...friend, friendUid: parent.uid }], parent.uid).map((m) => m.name),
  ['Per'],
);

console.log('inviteAuthUid.test.mjs: ok');
