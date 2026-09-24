import assert from 'node:assert/strict';
import {
  buildFriendInviteMessage,
  buildFriendInviteSms,
} from './friendInviteCopy.js';

const existing = buildFriendInviteMessage({
  to: 'a@b.c',
  name: 'Ada',
  fromName: 'Geir',
  registerUrl: 'https://www.protop.no/friend-invite/x',
  existingUser: true,
});
assert.ok(existing.subject.includes('Geir'));
assert.ok(existing.text.includes('venneforespørsel'));

const neu = buildFriendInviteMessage({
  to: 'a@b.c',
  name: 'Ada',
  fromName: 'Geir',
  registerUrl: 'https://www.protop.no/register?friendInvite=tok',
  existingUser: false,
});
assert.ok(neu.text.includes('Registrer deg'));

const sms = buildFriendInviteSms({
  name: 'Ada',
  fromName: 'Geir',
  registerUrl: 'https://www.protop.no/x',
  existingUser: false,
});
assert.ok(sms.includes('Geir'));
assert.ok(sms.includes('Weekplan'));

console.log('friendInvite.copy.test.mjs: ok');
