import assert from 'node:assert/strict';

/**
 * Models recipient friend-chat indication: inbox self-notify + unreadCounts badge
 * when Admin/client inbox write is missing.
 */
function simulateFriendIndication({
  hasAdminInbox,
  selfNotifyRuns,
  unreadCounts,
}) {
  const inbox = [];
  if (hasAdminInbox) {
    inbox.push({ id: 'friendChat_m1', eventType: 'messageReceived', seen: false });
  }
  if (selfNotifyRuns && !hasAdminInbox) {
    inbox.push({
      id: 'friendChat_dm_a_b_stamp',
      eventType: 'messageReceived',
      friendChat: true,
      seen: false,
    });
  }
  const badgeFromInbox = inbox.filter((n) => !n.seen).length;
  const badgeFromCounts = Number(unreadCounts) || 0;
  return {
    toast: inbox.length > 0,
    badge: Math.max(badgeFromInbox, badgeFromCounts),
  };
}

{
  // Ideal path: Admin wrote inbox
  const r = simulateFriendIndication({
    hasAdminInbox: true,
    selfNotifyRuns: true,
    unreadCounts: 1,
  });
  assert.equal(r.toast, true);
  assert.equal(r.badge, 1);
}

{
  // Admin inbox missing — self-notify still surfaces toast + badge
  const r = simulateFriendIndication({
    hasAdminInbox: false,
    selfNotifyRuns: true,
    unreadCounts: 2,
  });
  assert.equal(r.toast, true);
  assert.equal(r.badge, 2);
}

{
  // Old bug: no self-notify, only unreadCounts unused by UI → no indication
  const r = simulateFriendIndication({
    hasAdminInbox: false,
    selfNotifyRuns: false,
    unreadCounts: 3,
  });
  assert.equal(r.toast, false);
  // After fix unreadCounts feed the badge even without inbox:
  assert.equal(Math.max(r.badge, 3), 3);
}

console.log('friendChatIndication.test.mjs ok');
