import assert from 'node:assert/strict';
import {
  albumVisibilityMode,
  canViewAlbum,
  filterVisibleAlbums,
  resolveAlbumViewerIds,
  albumViewerSummary,
  buildAlbumSharePatch,
  friendUidsFromViewerList,
} from './albumVisibility.js';

assert.equal(albumVisibilityMode({}), 'family');
assert.equal(albumVisibilityMode({ visibility: 'private' }), 'private');

{
  const legacy = { id: 'a1', createdBy: 'p1' };
  assert.equal(canViewAlbum(legacy, { uid: 'kid1', isParent: false }), true);
  assert.equal(canViewAlbum(legacy, { uid: 'p1', isParent: true }), true);
}

{
  const privateAlbum = { visibility: 'private', createdBy: 'p1', viewerUids: ['p1'] };
  assert.equal(canViewAlbum(privateAlbum, { uid: 'kid1' }), false);
  assert.equal(canViewAlbum(privateAlbum, { uid: 'p1' }), true);
  assert.equal(canViewAlbum(privateAlbum, { uid: 'kid1', isParent: true }), true);
}

{
  const familyAlbum = { visibility: 'family', createdBy: 'p1' };
  assert.equal(canViewAlbum(familyAlbum, { uid: 'gp1', isGrandparent: true }), false);
  assert.equal(canViewAlbum(familyAlbum, {
    uid: 'gp1', isParent: true, isGrandparent: true,
  }), false);
  assert.equal(canViewAlbum({
    ...familyAlbum, viewerUids: ['gp1'],
  }, { uid: 'gp1', isGrandparent: true }), true);
}

{
  const shared = { visibility: 'shared', createdBy: 'p1', viewerUids: ['p1', 'kid1'] };
  assert.equal(canViewAlbum(shared, { uid: 'kid1' }), true);
  assert.equal(canViewAlbum(shared, { uid: 'kid2' }), false);
}

{
  const albums = [
    { id: '1', visibility: 'family', createdBy: 'p1' },
    { id: '2', visibility: 'shared', createdBy: 'p1', viewerUids: ['p1', 'kid1'] },
    { id: '3', visibility: 'private', createdBy: 'p1', viewerUids: ['p1'] },
  ];
  assert.deepEqual(
    filterVisibleAlbums(albums, { uid: 'kid1' }).map((a) => a.id),
    ['1', '2'],
  );
}

{
  const members = [
    { uid: 'p1', name: 'Mor' },
    { uid: 'kid1', name: 'Kari' },
  ];
  const shared = { visibility: 'shared', createdBy: 'p1', viewerUids: ['p1', 'kid1'] };
  assert.deepEqual(resolveAlbumViewerIds(shared, { members }).sort(), ['kid1', 'p1']);
  assert.equal(albumViewerSummary(shared, { members }), 'Mor, Kari');
  assert.equal(albumViewerSummary({ visibility: 'family' }, { members }), 'Hele familien');
}

{
  const patch = buildAlbumSharePatch({
    mode: 'shared',
    viewerUids: ['kid1'],
    uid: 'p1',
    familyMemberUids: ['p1', 'kid1', 'kid2'],
  });
  assert.equal(patch.visibility, 'shared');
  assert.ok(patch.viewerUids.includes('kid1'));
  assert.ok(patch.viewerUids.includes('p1'));
}

{
  const members = [
    { uid: 'p1', name: 'Mor' },
    { uid: 'kid1', name: 'Kari' },
  ];
  assert.deepEqual(
    friendUidsFromViewerList(['p1', 'kid1', 'friend-9'], { members, uid: 'p1' }),
    ['friend-9'],
  );
  assert.deepEqual(
    friendUidsFromViewerList(['p1', 'kid1'], { members, uid: 'p1' }),
    [],
  );
}

console.log('albumVisibility.test.mjs ok');
