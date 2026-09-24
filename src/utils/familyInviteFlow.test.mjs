import assert from 'node:assert/strict';
import {
  inviteableFamilyMembers,
  inviteableFriends,
  memberInviteAuthUid,
  preferAuthUid,
} from './inviteAuthUid.js';
import { gameInviteNavParams } from './gameInviteNav.js';

// Reproduce screenshot scenario: host + co-parent with stale invite key + friend Monica
const hostUid = 'HostAuthUidABCDEFGHIJKLMNOPQ1';
const monicaAuth = 'MonicaAuthUidABCDEFGHIJKLMN12';
const coParentAuth = 'CoParentAuthUidABCDEFGHIJKL99';

const members = [
  {
    role: 'parent',
    name: 'Geir',
    uid: hostUid,
    id: hostUid,
    docId: hostUid,
  },
  // Bug case: uid field still short invite key, docId is Auth UID
  {
    role: 'parent',
    name: 'Partner',
    uid: 'invite-partner-key',
    id: 'invite-partner-key',
    docId: coParentAuth,
  },
  {
    role: 'child',
    name: 'Barn uten login',
    uid: 'childDocABC1234567890',
    id: 'childDocABC1234567890',
    docId: 'childDocABC1234567890',
    childId: 'childDocABC1234567890',
  },
];

const friends = [
  { name: 'Monica', friendUid: monicaAuth, role: 'friend', isFriend: true },
];

const family = inviteableFamilyMembers(members, hostUid);
const friendList = inviteableFriends(friends, hostUid);

assert.deepEqual(family.map((m) => m.name), ['Partner']);
assert.equal(memberInviteAuthUid(family[0]), coParentAuth);
assert.deepEqual(friendList.map((m) => m.name), ['Monica']);

// Notification open must land on online hub with inviteGameId — not gameId
const nav = gameInviteNavParams({
  familyId: 'andersen',
  gameId: 'tttGame123',
  gameType: 'ttt',
});
assert.equal(nav.mode, 'online');
assert.equal(nav.inviteGameId, 'tttGame123');
assert.equal(nav.gameId, undefined);
assert.equal(nav.familyId, 'andersen');

assert.equal(preferAuthUid('invite-key', coParentAuth), coParentAuth);

console.log('family-invite-flow: ok');
console.log(JSON.stringify({ family: family.map(m => m.name), friends: friendList.map(m => m.name), nav }, null, 2));
