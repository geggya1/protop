import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeleteConfirmed, isServerMember, planFamilyExit, withoutUid } from './deleteAccountLogic.js';

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
console.log('deleteAccount.test.mjs: ok');
