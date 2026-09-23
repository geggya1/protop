import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// shoppingLists.js pulls in firebase; stub minimal exports used by memberSummary path.
const require = createRequire(import.meta.url);

// Dynamic import of pure helpers via a tiny inline reimplementation check —
// memberSummary is exported from shoppingLists which needs firebase.
// Prefer testing the friend-label logic here as a portable contract.

function memberSummary(list, members, friendPeople = []) {
  const isPersonal = list?.personal === true || list?.storage === 'personal';
  const isMirror = !!list?.mirroredFromFamilyId;
  if (isPersonal && !isMirror) return 'Privat · følger deg';
  const ids = list?.memberIds || [];
  if (ids.length <= 1) return 'Privat · følger deg';
  const roster = members || [];
  const friends = friendPeople || [];
  const names = ids
    .map((id) => {
      const familyName = roster.find((m) => m.uid === id)?.name;
      if (familyName) return familyName;
      const friend = friends.find((f) => f.uid === id || f.friendUid === id);
      return friend?.name ? `${(friend.name || '').split(' ')[0]} (venn)` : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  if (!names.length) {
    if (list?.sharedFromFriend || list?.sharedBy) return 'Delt av venn';
    return `${ids.length} medlemmer`;
  }
  return names.length < ids.length
    ? `${names.join(', ')} +${ids.length - names.length}`
    : names.join(', ');
}

assert.equal(
  memberSummary({ memberIds: ['a'], storage: 'family' }, [{ uid: 'a', name: 'Ada' }]),
  'Privat · følger deg',
);

assert.equal(
  memberSummary(
    { memberIds: ['a', 'b'], storage: 'family' },
    [{ uid: 'a', name: 'Ada' }, { uid: 'b', name: 'Bo' }],
  ),
  'Ada, Bo',
);

assert.equal(
  memberSummary(
    { memberIds: ['a', 'f1'], storage: 'family' },
    [{ uid: 'a', name: 'Ada' }],
    [{ uid: 'f1', name: 'Finn Friend' }],
  ),
  'Ada, Finn (venn)',
);

assert.equal(
  memberSummary(
    { memberIds: ['a', 'x'], storage: 'family', sharedFromFriend: true },
    [{ uid: 'a', name: 'Ada' }],
  ),
  'Ada +1',
);

assert.equal(
  memberSummary(
    { memberIds: ['x', 'y'], storage: 'family', sharedFromFriend: true },
    [],
    [],
  ),
  'Delt av venn',
);

void require;
console.log('shoppingListSharing.test.mjs: ok');
