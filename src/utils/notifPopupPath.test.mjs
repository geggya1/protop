import assert from 'node:assert/strict';
import {
  appendToast,
  buildToastFromNotification,
  shouldShowInAppToast,
  OVERLAY_EVENT_TYPES,
} from './inAppNotifications.js';

// Large popup path: chat + attest show toast; invites stay on overlay.
assert.equal(shouldShowInAppToast({ id: 'a', eventType: 'messageReceived' }), true);
assert.equal(shouldShowInAppToast({ id: 'b', eventType: 'attestPending' }), true);
assert.equal(shouldShowInAppToast({ id: 'c', eventType: 'gameInvite' }), false);
assert.equal(shouldShowInAppToast({ id: 'd', eventType: 'familyInvite' }), false);
assert.ok(OVERLAY_EVENT_TYPES.has('gameInvite'));

const toast = buildToastFromNotification({
  id: 'attest_1',
  eventType: 'attestPending',
  title: 'Til attestering',
  body: 'Emma: Rydd rommet',
  childId: 'c1',
  todoId: 't1',
});
assert.equal(toast.title, 'Til attestering');
assert.equal(toast.icon, 'shield-checkmark');
assert.equal(toast.data.childId, 'c1');

let q = appendToast([], toast, 3);
q = appendToast(q, { id: 'chat_1', title: 'Ny melding', body: 'Hei' }, 3);
assert.equal(q.length, 2);
assert.equal(q[q.length - 1].id, 'chat_1');

console.log('notifPopupPath.test.mjs: ok');
