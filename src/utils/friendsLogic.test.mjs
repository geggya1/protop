import assert from 'node:assert/strict';
import {
  friendAddByUsernameUrl,
  parseFriendAddUsername,
  normalizeFriendUsername,
  isFriendChatNavPayload,
  friendUidFromNavPayload,
  friendChatId,
  friendProfileOwnerUid,
  canMutatePersonalFriends,
  showPersonalFriends,
} from './friendsLogic.js';
import {
  persistPendingAddFriend,
  peekPendingAddFriend,
  consumePendingAddFriend,
  capturePendingAddFriendFromLocation,
} from './pendingAddFriend.js';

assert.equal(
  friendAddByUsernameUrl('Geir'),
  'https://www.protop.no/add-friend/geir',
);
assert.equal(
  friendAddByUsernameUrl('@Ada_1'),
  'https://www.protop.no/add-friend/ada_1',
);
assert.equal(
  parseFriendAddUsername('https://www.protop.no/add-friend/geir'),
  'geir',
);
assert.equal(
  parseFriendAddUsername('/add-friend/@Ada'),
  'ada',
);
assert.equal(parseFriendAddUsername('/my-friends'), '');
assert.equal(
  parseFriendAddUsername('https://www.protop.no/add-friend.html?u=goa'),
  'goa',
);
assert.equal(
  parseFriendAddUsername('/signup?addFriend=Goa'),
  'goa',
);
assert.equal(
  parseFriendAddUsername('/hjem?addFriend=@Ada_1'),
  'ada_1',
);
assert.equal(parseFriendAddUsername('/hjem?u=goa'), '');
assert.equal(parseFriendAddUsername('/add-friend.html?u=goa'), 'goa');
assert.equal(normalizeFriendUsername('@GOA!'), 'goa');

consumePendingAddFriend();
assert.equal(peekPendingAddFriend(), '');
assert.equal(
  capturePendingAddFriendFromLocation('https://www.protop.no/add-friend/goa'),
  'goa',
);
assert.equal(peekPendingAddFriend(), 'goa');
assert.equal(persistPendingAddFriend('@Ada_1'), 'ada_1');
assert.equal(consumePendingAddFriend(), 'ada_1');
assert.equal(peekPendingAddFriend(), '');

// Friend-chat notification routing — avoid listening under families/...
assert.equal(isFriendChatNavPayload({ friendChat: true, chatId: 'dm_a_b' }), true);
assert.equal(isFriendChatNavPayload({ friendUid: 'a', chatId: 'dm_a_b' }), true);
assert.equal(isFriendChatNavPayload({ notificationId: 'friendChat_msg1', chatId: 'dm_a_b' }), true);
assert.equal(isFriendChatNavPayload({ chatId: 'dm_a_b' }), true); // no familyId
assert.equal(isFriendChatNavPayload({ chatId: 'dm_a_b', familyId: 'fam1' }), false);
assert.equal(isFriendChatNavPayload({ chatId: 'family', familyId: 'fam1' }), false);
assert.equal(
  friendUidFromNavPayload({ chatId: friendChatId('u1', 'u2'), createdBy: 'u1' }, 'u2'),
  'u1',
);
assert.equal(
  friendUidFromNavPayload({ chatId: friendChatId('u1', 'u2') }, 'u2'),
  'u1',
);

// Profile-scoped friends: parent vs child must not leak across
assert.equal(
  friendProfileOwnerUid({ authUid: 'parent1', isActingAsChild: false }),
  'parent1',
);
assert.equal(
  friendProfileOwnerUid({ authUid: 'parent1', isActingAsChild: true, childUid: 'celineUid' }),
  'celineUid',
);
assert.equal(
  friendProfileOwnerUid({ authUid: 'parent1', isActingAsChild: true, childUid: null }),
  null,
);
assert.equal(
  friendProfileOwnerUid({ authUid: 'childLogin', isActingAsChild: false }),
  'childLogin',
);
assert.equal(canMutatePersonalFriends({ authUid: 'parent1', friendOwnerUid: 'parent1' }), true);
assert.equal(canMutatePersonalFriends({ authUid: 'parent1', friendOwnerUid: 'celineUid' }), false);
assert.equal(
  canMutatePersonalFriends({
    authUid: 'parent1',
    friendOwnerUid: 'celineUid',
    isActingAsChild: true,
  }),
  true,
);
assert.equal(
  canMutatePersonalFriends({
    authUid: 'parent1',
    friendOwnerUid: null,
    isActingAsChild: true,
  }),
  false,
);
assert.equal(showPersonalFriends({ isActingAsChild: true }), false);
assert.equal(showPersonalFriends({ isActingAsChild: false }), true);
assert.equal(showPersonalFriends({}), true);
assert.equal(showPersonalFriends(), true);

console.log('friendsLogic add-friend URL tests ok');
