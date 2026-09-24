import assert from 'node:assert/strict';
import {
  friendshipPairId,
  friendChatId,
  friendInviteAcceptUrl,
} from './friendsLogic.js';

assert.equal(friendshipPairId('b', 'a'), 'a_b');
assert.equal(friendshipPairId('a', 'a'), 'a_a');
assert.equal(friendChatId('z', 'm'), 'dm_m_z');
assert.equal(friendChatId('', ''), '');

const url = friendInviteAcceptUrl({ requestId: 'req1', token: 'tok' });
assert.ok(url.includes('/friend-invite/req1'));
assert.ok(url.includes('token=tok'));

const urlNoTok = friendInviteAcceptUrl({ requestId: 'r2' });
assert.equal(urlNoTok, 'https://www.protop.no/friend-invite/r2');

console.log('friends.test.mjs: ok');
