import assert from 'node:assert/strict';
import {
  nestMailFolders,
  favoriteMailFolders,
  visibleMailFolderRows,
  expandAncestorIds,
  mailFolderIcon,
} from './mailFolderTree.js';

const flat = [
  { id: 'in', name: 'Innboks', wellKnownName: 'inbox', depth: 0, unread: 31, childFolderCount: 2 },
  { id: 'ost', name: 'Consult1 Øst AS', depth: 1, parentFolderId: 'in', childFolderCount: 1 },
  { id: 'ans', name: 'Ansatte', depth: 2, parentFolderId: 'ost', childFolderCount: 2 },
  { id: 'bj', name: 'Bjarne', depth: 3, parentFolderId: 'ans' },
  { id: 'da', name: 'Daniel', depth: 3, parentFolderId: 'ans' },
  { id: 'sent', name: 'Sendte elementer', wellKnownName: 'sentitems', depth: 0 },
  { id: 'ark', name: 'Arkiv', wellKnownName: 'archive', depth: 0 },
];

const tree = nestMailFolders(flat);
assert.equal(tree[0].wellKnownName, 'inbox');
assert.equal(tree[1].wellKnownName, 'sentitems');
assert.equal(tree[2].wellKnownName, 'archive');
assert.equal(tree[0].children[0].name, 'Consult1 Øst AS');

const fav = favoriteMailFolders(tree);
assert.equal(fav.map((f) => f.wellKnownName).join(','), 'inbox,sentitems');

const collapsed = visibleMailFolderRows(tree, new Set());
assert.deepEqual(collapsed.map((r) => r.name), ['Innboks', 'Sendte elementer', 'Arkiv']);
assert.equal(collapsed[0].hasKids, true);
assert.equal(collapsed[0].expanded, false);

const openedOst = visibleMailFolderRows(tree, new Set(['in', 'ost']));
assert.ok(openedOst.some((r) => r.name === 'Consult1 Øst AS'));
assert.ok(openedOst.some((r) => r.name === 'Ansatte'));
assert.ok(!openedOst.some((r) => r.name === 'Bjarne'));

const ancestors = expandAncestorIds(tree, 'bj');
assert.ok(ancestors.has('in'));
assert.ok(ancestors.has('ost'));
assert.ok(ancestors.has('ans'));
assert.ok(!ancestors.has('bj'));

assert.equal(mailFolderIcon('inbox'), 'file-tray-outline');
assert.equal(mailFolderIcon(null), 'folder-outline');

console.log('mailFolderTree ok');
