import assert from 'node:assert/strict';
import { isDeleteConfirmed, planFamilyExit, withoutUid } from './deleteAccountLogic.js';

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
