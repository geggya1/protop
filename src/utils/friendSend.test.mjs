import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FRIEND_POLL_MAX_MS,
  FRIEND_POLL_MS,
  friendCallableResult,
  friendPollDelayMs,
  friendSendErrorText,
} from './friendsLogic.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

test('sendefeil får en tekst som vises i tråden', () => {
  assert.match(friendSendErrorText(new Error('not-friends')), /ikke venner lenger/);
  assert.match(friendSendErrorText('not-friends'), /ikke venner lenger/);
  assert.match(friendSendErrorText({ code: 'functions/unavailable' }), /kontakt med serveren/);
  assert.match(friendSendErrorText(new Error('noe annet')), /ble ikke sendt/);
});

test('callable-svar uten ok kaster feilen serveren meldte', () => {
  assert.deepEqual(friendCallableResult({ ok: true, friendUid: 'b' }), { ok: true, friendUid: 'b' });
  assert.throws(() => friendCallableResult({ ok: false, error: 'already-handled' }), /already-handled/);
  assert.throws(() => friendCallableResult(null, 'accept-failed'), /accept-failed/);
});

test('pollingen bruker backoff og stopper aldri helt', () => {
  assert.equal(friendPollDelayMs(0), FRIEND_POLL_MS);
  assert.equal(friendPollDelayMs(1), FRIEND_POLL_MS * 2);
  assert.equal(friendPollDelayMs(2), FRIEND_POLL_MS * 4);
  assert.equal(friendPollDelayMs(50), FRIEND_POLL_MAX_MS);
  assert.ok(friendPollDelayMs(1000) > 0);
});

test('ingen klientreserve som skriver vennskap eller meldinger direkte', () => {
  const friends = read('./friends.js');
  const accept = friends.slice(friends.indexOf('export async function acceptFriendRequest'), friends.indexOf('export async function declineFriendRequest'));
  assert.equal(/writeBatch|batch\.set/.test(accept), false, 'godta skriver ikke friendships fra klienten');
  const claim = friends.slice(friends.indexOf('export async function claimPendingFriendInvite'), friends.indexOf('export async function removeFriend'));
  assert.equal(/writeBatch|doc\(db, 'friendInviteTokens'/.test(claim), false, 'claim skriver ikke token fra klienten');
  const remove = friends.slice(friends.indexOf('export async function removeFriend'), friends.indexOf('export function listenFriends'));
  assert.equal(/writeBatch/.test(remove), false);
  const incoming = friends.slice(friends.indexOf('export function listenIncomingFriendRequests'));
  assert.match(incoming, /friendPollDelayMs\(requestMisses\)/);
  assert.equal(/requestMisses >= 1\) return/.test(incoming), false);

  const dock = read('../../components/ChatDock.jsx');
  const send = dock.slice(dock.indexOf('const sendMessage = async'), dock.indexOf('const refreshFriendMsgs'));
  const textPath = send.slice(send.indexOf("await sendFriendViaAdmin(String(body || '').trim());"));
  assert.ok(textPath.length > 0);
  assert.equal(/type: 'text',\s*\}\);/.test(send), false, 'tekst skrives ikke direkte som reserve');
  assert.match(send, /err\?\.message === 'not-friends'/);
  assert.match(dock, /setSendError\(isFriend \? friendSendErrorText\(err\)/);
  assert.equal(/\bAlert\.alert\(/.test(dock), false);

  const chats = read('./friendChats.js');
  assert.match(chats, /throw new Error\('not-friends'\)/);

  const thread = read('../../screens/v2/FriendChatThreadScreen.jsx');
  assert.match(thread, /setSendError\(friendSendErrorText\(res\?\.data\?\.error/);
});
