import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accountingBlockMessage,
  googleTokensToRevoke,
  isCompanyGroup,
  isDeleteConfirmed,
  isServerMember,
  planFamilyExit,
  withoutUid,
} from './deleteAccountLogic.js';

assert.equal(isDeleteConfirmed('DELETE'), true);
assert.equal(isDeleteConfirmed(' delete '), true);
assert.equal(isDeleteConfirmed('slett'), false);
assert.equal(isDeleteConfirmed(''), false);

assert.deepEqual(withoutUid(['a', 'b'], 'a'), ['b']);
assert.deepEqual(withoutUid({ a: true, b: true }, 'a'), { b: true });
assert.deepEqual(withoutUid(null, 'a'), []);

const archived = planFamilyExit('me', {
  id: 'fam1',
  data: { ownerUid: 'me', adminUids: ['me'], members: ['me'] },
  otherLiveParentUids: [],
});
assert.equal(archived.action, 'archive');
assert.equal(archived.nextOwner, null);

const transferred = planFamilyExit('me', {
  id: 'fam2',
  data: { ownerUid: 'me', adminUids: ['me'], members: ['me', 'other'] },
  otherLiveParentUids: ['other'],
});
assert.equal(transferred.action, 'leave');
assert.equal(transferred.nextOwner, 'other');

const keepAdmin = planFamilyExit('me', {
  id: 'fam3',
  data: { ownerUid: 'me', adminUids: ['me', 'admin2'], members: ['me', 'admin2', 'p3'] },
  otherLiveParentUids: ['admin2', 'p3'],
});
assert.equal(keepAdmin.nextOwner, 'admin2');

const memberOnly = planFamilyExit('me', {
  id: 'fam4',
  data: { ownerUid: 'boss', adminUids: ['boss'], members: ['boss', 'me'] },
  otherLiveParentUids: ['boss'],
});
assert.equal(memberOnly.action, 'leave');
assert.equal(memberOnly.nextOwner, null);

// SEC-16: et selskap brukeren bare har skrevet inn i egne familyIds, røres ikke.
assert.equal(isServerMember({ members: ['me'] }, 'me'), true);
assert.equal(isServerMember({ members: { me: true } }, 'me'), true);
assert.equal(isServerMember({ adminUids: ['me'] }, 'me'), true);
assert.equal(isServerMember({ ownerId: 'me' }, 'me'), true);
assert.equal(isServerMember({ createdBy: 'me', adminUid: 'me', members: ['boss'] }, 'me'), false);

const foreign = planFamilyExit('attacker', {
  id: 'victim',
  data: { ownerUid: 'boss', adminUids: ['boss'], members: ['boss'] },
  otherLiveParentUids: [],
});
assert.equal(foreign.action, 'skip', 'fremmed selskap arkiveres ikke');
assert.equal(foreign.nextOwner, null);

// createdBy/adminUid (som medlemmer kan skrive) gir ikke eierskap å overføre.
const selfWritten = planFamilyExit('me', {
  id: 'fam5',
  data: { ownerUid: 'boss', adminUids: ['boss'], members: ['boss', 'me', 'p3'], createdBy: 'me', adminUid: 'me' },
  otherLiveParentUids: ['boss', 'p3'],
});
assert.equal(selfWritten.action, 'leave');
assert.equal(selfWritten.nextOwner, null);

const deleteSrc = readFileSync(new URL('./deleteAccount.js', import.meta.url), 'utf8');
const leaveSrc = deleteSrc.slice(deleteSrc.indexOf('async function leaveFamily'), deleteSrc.indexOf('async function clearFriendships'));
assert.ok(leaveSrc.indexOf("plan.action === 'skip'") < leaveSrc.indexOf('famRef.set('), 'skip før selskapet endres');

// Siste person i en bedrift med utstedte fakturaer: kontoen slettes ikke (bokføringsloven § 13).
const company = { ownerUid: 'me', adminUids: ['me'], members: ['me'], type: 'organization', company: { navn: 'Bygg AS' } };
const blocked = planFamilyExit('me', { id: 'c1', data: company, otherLiveParentUids: [], hasAccounting: true });
assert.equal(blocked.action, 'blocked');
assert.equal(blocked.reason, 'accounting');
// Uten fakturaer, eller med andre igjen i bedriften, går det som før.
assert.equal(planFamilyExit('me', { id: 'c1', data: company, otherLiveParentUids: [], hasAccounting: false }).action, 'archive');
const handover = planFamilyExit('me', { id: 'c1', data: company, otherLiveParentUids: ['emp'], hasAccounting: true });
assert.equal(handover.action, 'leave');
assert.equal(handover.nextOwner, 'emp');
// Familier har ikke regnskap i ProTop.
assert.equal(planFamilyExit('me', { id: 'f1', data: { ownerUid: 'me' }, otherLiveParentUids: [], hasAccounting: true }).action, 'archive');
assert.equal(isCompanyGroup({ company: { navn: 'X AS' } }), true);
assert.equal(isCompanyGroup({ type: 'family' }), false);
assert.match(accountingBlockMessage(['Bygg AS', 'Bygg AS']), /«Bygg AS», som har utstedte fakturaer/);
assert.match(accountingBlockMessage([]), /bedriften/);
assert.match(accountingBlockMessage(['A']), /support@protop\.no/);

assert.deepEqual(googleTokensToRevoke([
  { type: 'google', refreshToken: 'r1', accessToken: 'a1' },
  { type: 'google', accessToken: 'a2' },
  { type: 'microsoft', refreshToken: 'm1' },
  { type: 'google', refreshToken: 'r1' },
  null,
]), ['r1', 'a2']);

console.log('deleteAccount.test.mjs: ok');
