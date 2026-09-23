import assert from 'node:assert/strict';
import { CHILD_APP_GROUPS, groupChildAppItems } from './childAppGroups.js';

assert.equal(CHILD_APP_GROUPS.some((g) => g.id === 'food'), false, 'kids have no Mat & innkjøp');
assert.equal(CHILD_APP_GROUPS.find((g) => g.id === 'family')?.titleKey, 'shell.family');
assert.ok(CHILD_APP_GROUPS.find((g) => g.id === 'vehicles')?.ids.includes('holdings'));
assert.ok(CHILD_APP_GROUPS.find((g) => g.id === 'house')?.ids.includes('boligmappa'));
assert.equal(
  CHILD_APP_GROUPS.find((g) => g.id === 'family')?.ids.includes('chores'),
  false,
  'Gjøremål is hurtigvalg (Hoved), not under Familien',
);
assert.equal(
  CHILD_APP_GROUPS.find((g) => g.id === 'family')?.ids.includes('friends'),
  false,
  'Venner is hurtigvalg (Hoved), not under Familien',
);

const tools = [
  { id: 'books' }, { id: 'wishes' }, { id: 'games' }, { id: 'friends' },
  { id: 'albums' }, { id: 'wall' }, { id: 'familyTree' }, { id: 'scratchMap' },
  { id: 'reiseplanlegger' }, { id: 'rememberDates' }, { id: 'activities' },
  { id: 'location' }, { id: 'documents' }, { id: 'holdings' }, { id: 'boligmappa' },
  { id: 'ai' }, { id: 'customKidTool' },
];

const grouped = groupChildAppItems(tools);
assert.deepEqual(
  grouped.map((s) => s.id),
  ['memories', 'family', 'vehicles', 'house', 'tools'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'memories').items.map((i) => i.id),
  ['albums', 'wall', 'familyTree', 'scratchMap', 'reiseplanlegger', 'wishes'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'family').items.map((i) => i.id),
  ['location', 'rememberDates', 'activities', 'books', 'games'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'vehicles').items.map((i) => i.id),
  ['holdings'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'house').items.map((i) => i.id),
  ['documents', 'boligmappa'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'tools').items.map((i) => i.id),
  ['friends', 'ai', 'customKidTool'],
  'Venner/AI are not Familien apps — leftover if still passed in',
);

const noLeftover = groupChildAppItems(tools.filter((i) => i.id !== 'customKidTool' && i.id !== 'ai' && i.id !== 'friends'));
assert.equal(noLeftover.find((s) => s.id === 'tools'), undefined);

console.log('childAppGroups.test.mjs ok');
