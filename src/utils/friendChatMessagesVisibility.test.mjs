import assert from 'node:assert/strict';

/**
 * Models listenFriendChatMessages: permission-denied heals + retries, then
 * Admin poll when client LIST stays denied (blank web friend chat).
 */
function simulateListenFriendChatMessages({
  /** How many client attaches fail with permission-denied before success. */
  clientFailCount,
  /** Whether heal (ensureFriendChatDoc) runs on retry. */
  healOnFail,
  adminHasMessages,
}) {
  let attempts = 0;
  let healed = false;
  let data = null;
  let usedAdminPoll = false;
  const maxClientAttempts = 3; // initial + 2 retries (matches attempt < 2)

  const attach = () => {
    attempts += 1;
    const failThis = attempts <= clientFailCount;
    if (!failThis) {
      data = [{ id: 'm1', text: healed ? 'hei etter heal' : 'hei fra live' }];
      return;
    }
    if (attempts < maxClientAttempts) {
      if (healOnFail) healed = true;
      attach();
      return;
    }
    usedAdminPoll = true;
    data = adminHasMessages
      ? [{ id: 'm2', text: 'hei via admin' }]
      : [];
  };

  attach();
  return { attempts, data, healed, usedAdminPoll };
}

{
  // Classic race: first listen before chat doc exists → heal → success
  const r = simulateListenFriendChatMessages({
    clientFailCount: 1,
    healOnFail: true,
    adminHasMessages: true,
  });
  assert.equal(r.healed, true);
  assert.equal(r.usedAdminPoll, false);
  assert.equal(r.data?.[0]?.text, 'hei etter heal');
  assert.ok(r.attempts >= 2);
}

{
  // Live path works immediately
  const r = simulateListenFriendChatMessages({
    clientFailCount: 0,
    healOnFail: false,
    adminHasMessages: false,
  });
  assert.equal(r.usedAdminPoll, false);
  assert.equal(r.healed, false);
  assert.equal(r.data?.[0]?.text, 'hei fra live');
}

{
  // Rules deny forever (BUG-F004) — Admin poll must still surface messages
  const r = simulateListenFriendChatMessages({
    clientFailCount: 99,
    healOnFail: false,
    adminHasMessages: true,
  });
  assert.equal(r.usedAdminPoll, true);
  assert.equal(r.data?.[0]?.text, 'hei via admin');
  assert.equal(r.attempts, 3);
}

/**
 * Old buggy listener: one-shot error → [] and dead. Models the blank dock.
 */
function simulateBuggyFriendListen({ failOnce }) {
  if (failOnce) return { data: [], dead: true };
  return { data: [{ id: 'm1', text: 'ok' }], dead: false };
}

{
  const buggy = simulateBuggyFriendListen({ failOnce: true });
  assert.deepEqual(buggy.data, []);
  assert.equal(buggy.dead, true);
}

console.log('friendChatMessagesVisibility.test.mjs ok');
