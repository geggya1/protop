import assert from 'node:assert/strict';
import {
  uniqueMemberIds,
  resolveChatRecipients,
  unreadCountForUser,
  chatIsUnread,
  otherDmMemberIds,
  chatVisibleToUser,
  canManageChatMessage,
  chatMessagePreview,
} from './chatsLogic.js';

assert.deepEqual(uniqueMemberIds(['a', '', 'a', null, 'b']), ['a', 'b']);

assert.deepEqual(
  otherDmMemberIds('dm_alice_bob', 'alice'),
  ['bob'],
);

assert.deepEqual(
  resolveChatRecipients({
    chatId: 'dm_alice_bob',
    senderUid: 'alice',
    memberIds: [],
    familyMemberIds: ['alice', 'bob', 'carol'],
  }),
  ['bob'],
  'DM must not notify the whole family when memberIds is empty',
);

assert.deepEqual(
  resolveChatRecipients({
    chatId: 'family',
    senderUid: 'alice',
    memberIds: [],
    familyMemberIds: ['alice', 'bob'],
    contextMemberIds: ['carol'],
  }).sort(),
  ['bob', 'carol'],
  'family chat falls back to family + context members',
);

assert.equal(
  unreadCountForUser({
    unreadCounts: { bob: 0 },
    lastSenderId: 'alice',
    lastAt: { seconds: 200 },
    reads: { bob: { seconds: 100 } },
  }, 'bob'),
  1,
  'stored 0 must still show unread when lastAt is newer',
);
assert.equal(
  unreadCountForUser({
    unreadCounts: { bob: 0 },
    lastSenderId: 'bob',
    lastAt: { seconds: 200 },
    reads: { bob: { seconds: 200 } },
  }, 'bob'),
  0,
);
assert.equal(
  chatIsUnread({ lastSenderId: 'bob', lastAt: { seconds: 100 } }, 'bob'),
  false,
);
assert.equal(chatVisibleToUser('family', {}, 'x'), true);
assert.equal(chatVisibleToUser('dm_alice_bob', {}, 'alice'), true);
assert.equal(chatVisibleToUser('dm_alice_bob', {}, 'carol'), false);

assert.equal(canManageChatMessage({ senderId: 'a' }, 'a', false), true);
assert.equal(canManageChatMessage({ senderId: 'a' }, 'b', false), false);
assert.equal(canManageChatMessage({ senderId: 'a' }, 'b', true), true);
assert.equal(canManageChatMessage({ senderId: 'a', deleted: true }, 'a', true), false);
assert.equal(chatMessagePreview({ type: 'text', text: ' Hei ' }), 'Hei');
assert.equal(chatMessagePreview({ type: 'image', text: '' }, 'IMG'), 'IMG');
assert.equal(chatMessagePreview({ deleted: true, text: 'x' }), '');

console.log('chatsLogic.test.mjs: ok');
