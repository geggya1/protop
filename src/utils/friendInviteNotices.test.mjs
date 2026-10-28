import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { friendInviteNoticeRequestId, staleFriendInviteNoticeIds } from './friendsLogic.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const NOW = 1_800_000_000_000;
const at = (msAgo) => ({ toMillis: () => NOW - msAgo });

test('varsel om en forespørsel som ikke lenger venter, lukkes (SOS-19)', () => {
  const items = [
    // Avslått eller trukket tilbake: venter ikke lenger.
    { id: 'friendInvite_r1', eventType: 'friendInvite', requestId: 'r1', seen: false, createdAt: at(10 * 60000) },
    // Venter fortsatt.
    { id: 'friendInvite_r2', eventType: 'friendInvite', requestId: 'r2', seen: false, createdAt: at(10 * 60000) },
    // Helt nytt: forespørselen er kanskje ikke kommet med i listen ennå.
    { id: 'friendInvite_r3', eventType: 'friendInvite', requestId: 'r3', seen: false, createdAt: at(5000) },
    // Allerede lest.
    { id: 'friendInvite_r4', eventType: 'friendInvite', requestId: 'r4', seen: true, createdAt: at(10 * 60000) },
    // Andre varsler røres ikke.
    { id: 'msg_1', eventType: 'messageReceived', seen: false, createdAt: at(10 * 60000) },
    // Gammelt varsel uten requestId, men med id friendInvite_<id>.
    { id: 'friendInvite_r5', eventType: 'friendInvite', seen: false, createdAt: at(10 * 60000) },
    // Ukjent forespørsel: røres ikke.
    { id: 'abc', eventType: 'friendInvite', seen: false, createdAt: at(10 * 60000) },
  ];
  assert.deepEqual(staleFriendInviteNoticeIds(items, ['r2', 'r3'], { nowMs: NOW }), ['friendInvite_r1', 'friendInvite_r5']);
  assert.deepEqual(staleFriendInviteNoticeIds([], ['r1'], { nowMs: NOW }), []);
  assert.equal(friendInviteNoticeRequestId({ inviteId: 'x' }), 'x');
  assert.equal(friendInviteNoticeRequestId({ id: 'friendInvite_y' }), 'y');
  assert.equal(friendInviteNoticeRequestId({ id: 'z' }), '');
});

test('serveren lukker varselet ved svar, og trykk på varselet åpner Venner', () => {
  const server = read('functions/friendCallables.js');
  const respond = server.slice(server.indexOf('export const respondFriendRequestAdmin'), server.indexOf('export const sendFriendChatAdmin'));
  assert.equal((respond.match(/await closeFriendInviteNotice\(uid, requestId\)/g) || []).length, 2);
  const withdraw = server.slice(server.indexOf('export const withdrawFriendRequestAdmin'), server.indexOf('export const dismissOutgoingFriendRequestAdmin'));
  assert.match(withdraw, /batch\.delete\(db\.doc\(`users\/\$\{toUid\}\/notifications\/friendInvite_\$\{requestId\}`\)\)/);

  const nav = read('src/navigation/navRef.js');
  assert.match(nav, /eventType === 'friendInvite' \|\| eventType === 'friendInviteAccepted'\) \{\s*return \{ tab: 'more', subView: 'friends' \};/);
  const screen = read('screens/v2/NotificationsScreen.jsx');
  assert.match(screen, /friends: \{ label: 'Venner'/);
  const overlay = read('components/InviteRespondOverlay.jsx');
  assert.match(overlay, /staleFriendInviteNoticeIds\(/);
  assert.match(overlay, /if \(stale\.length\) markSeen\(stale\)/);
});
