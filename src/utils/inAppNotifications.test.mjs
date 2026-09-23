import assert from 'node:assert/strict';
import {
  appendToast,
  buildToastFromNotification,
  notificationNavPayload,
  removeToast,
  shouldShowInAppToast,
} from './inAppNotifications.js';

assert.equal(shouldShowInAppToast(null), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'messageReceived' }), true);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'messageReceived', seen: true }), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'messageReceived' }, { prefsChannelOn: false }), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'messageReceived' }, { suppress: true }), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'familyInvite' }), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'gameInvite' }), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'birthdayReminder' }), false);
assert.equal(shouldShowInAppToast({ id: '1', eventType: 'attestPending' }), true);

const toast = buildToastFromNotification({
  id: 'n1',
  eventType: 'choreReceived',
  title: 'Nytt gjøremål',
  body: 'Rydd rommet',
  familyId: 'f1',
  choreId: 'c1',
});
assert.equal(toast.id, 'n1');
assert.equal(toast.title, 'Nytt gjøremål');
assert.equal(toast.body, 'Rydd rommet');
assert.equal(toast.icon, 'checkbox');
assert.equal(toast.data.choreId, 'c1');
assert.equal(toast.data.notificationId, 'n1');

const payload = notificationNavPayload({
  id: 'x',
  eventType: 'gameInvite',
  inviteId: 'inv1',
  gameId: 'g1',
  gameType: 'ttt',
  familyId: 'f1',
});
assert.equal(payload.inviteId, 'inv1');
assert.equal(payload.gameId, 'g1');
assert.equal(payload.gameType, 'ttt');

const friendPayload = notificationNavPayload({
  id: 'friendChat_abc',
  eventType: 'messageReceived',
  chatId: 'dm_u1_u2',
  friendChat: true,
  friendUid: 'u1',
  createdBy: 'u1',
  title: 'Geir',
  body: 'test',
});
assert.equal(friendPayload.friendChat, true);
assert.equal(friendPayload.friendUid, 'u1');
assert.equal(friendPayload.createdBy, 'u1');
assert.equal(friendPayload.chatId, 'dm_u1_u2');
assert.equal(friendPayload.notificationId, 'friendChat_abc');
assert.equal(friendPayload.title, 'Geir');

let q = [];
q = appendToast(q, { id: 'a', title: 'A' }, 2);
q = appendToast(q, { id: 'b', title: 'B' }, 2);
q = appendToast(q, { id: 'c', title: 'C' }, 2);
assert.deepEqual(q.map((t) => t.id), ['b', 'c']);
q = appendToast(q, { id: 'b', title: 'B2' }, 2);
assert.deepEqual(q.map((t) => t.id), ['c', 'b']);
assert.equal(q.find((t) => t.id === 'b').title, 'B2');
q = removeToast(q, 'c');
assert.deepEqual(q.map((t) => t.id), ['b']);

console.log('inAppNotifications.test.mjs: ok');
