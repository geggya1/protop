import assert from 'node:assert/strict';
import { isListedOnFamilyData } from './familyMembershipLogic.js';

function needsListMembershipHeal(family, uid) {
  return !!family && !!uid && !isListedOnFamilyData(family, uid);
}

assert.equal(needsListMembershipHeal(null, 'c1'), false);
assert.equal(needsListMembershipHeal({ members: ['c1'] }, 'c1'), false);
assert.equal(needsListMembershipHeal({ activeUsers: ['c1'] }, 'c1'), false);
assert.equal(needsListMembershipHeal({ memberIds: ['c1'] }, 'c1'), false);
assert.equal(needsListMembershipHeal({ members: ['p1'], activeUsers: [] }, 'c1'), true);
// Child doc alone is not enough for LIST — classic notif-yes / messages-no bug
assert.equal(needsListMembershipHeal({ members: ['parent1'] }, 'childUid'), true);

/**
 * Message listener retry: first permission-denied heals + retries; second succeeds.
 * Models listenChatMessages attach loop without Firestore.
 */
function simulateListenChatMessages({ failCount, heal }) {
  let attempts = 0;
  let healed = false;
  let data = null;
  let denied = false;

  const attach = () => {
    attempts += 1;
    if (attempts <= failCount) {
      if (attempts <= 2) {
        if (!healed) {
          heal();
          healed = true;
        }
        attach();
        return;
      }
      denied = true;
      return;
    }
    data = [{ id: 'm1', text: 'hei' }];
  };
  attach();
  return { attempts, data, denied, healed };
}

{
  const r = simulateListenChatMessages({ failCount: 1, heal: () => {} });
  assert.equal(r.healed, true);
  assert.equal(r.data?.[0]?.text, 'hei');
  assert.equal(r.denied, false);
  assert.ok(r.attempts >= 2);
}

{
  const r = simulateListenChatMessages({ failCount: 0, heal: () => {} });
  assert.equal(r.data?.[0]?.text, 'hei');
  assert.equal(r.denied, false);
}

console.log('chatMessagesVisibility.test.mjs ok');
