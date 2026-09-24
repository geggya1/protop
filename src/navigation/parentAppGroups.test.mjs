import assert from 'node:assert/strict';
import { groupParentAppItems, PARENT_APP_GROUPS } from './parentAppGroups.js';

assert.equal(PARENT_APP_GROUPS.some((g) => g.id === 'kids'), false, 'no parent Barn group');
assert.equal(PARENT_APP_GROUPS.find((g) => g.id === 'family')?.titleKey, 'shell.family');
assert.equal(PARENT_APP_GROUPS.some((g) => g.ids.includes('klassen')), false);
assert.equal(
  PARENT_APP_GROUPS.find((g) => g.id === 'family')?.ids.includes('friends'),
  false,
  'Venner is hurtigvalg (Hoved), not under Familien',
);

const tools = [
  { id: 'matcoach' }, { id: 'shop' }, { id: 'meals' }, { id: 'recipes' }, { id: 'pantry' },
  { id: 'albums' }, { id: 'wall' }, { id: 'familyTree' }, { id: 'scratchMap' }, { id: 'wishes' },
  { id: 'activities' }, { id: 'rememberDates' }, { id: 'location' }, { id: 'games' }, { id: 'books' },
  { id: 'friends' },
  { id: 'documents' }, { id: 'holdings' }, { id: 'boligmappa' }, { id: 'hospitality' },
  { id: 'klassen' }, { id: 'progress' },
];

const t = (k) => ({ 'shell.family': 'Familien', 'shell.food': 'Mat', 'shell.memories': 'Minner', 'shell.vehicles': 'Kjøretøy', 'shell.house': 'Boligen', 'apps.otherApps': 'Øvrige apper' }[k] || k);
const grouped = groupParentAppItems(tools, t);
assert.deepEqual(grouped.map((s) => s.id), ['food', 'memories', 'family', 'vehicles', 'house', 'tools']);
assert.deepEqual(grouped[0].items.map((i) => i.id), ['matcoach', 'shop', 'meals', 'recipes', 'pantry']);
assert.deepEqual(
  grouped.find((s) => s.id === 'house').items.map((i) => i.id),
  ['documents', 'boligmappa', 'hospitality'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'vehicles').items.map((i) => i.id),
  ['holdings'],
);
assert.deepEqual(
  grouped.find((s) => s.id === 'family').items.map((i) => i.id),
  ['location', 'rememberDates', 'activities', 'books', 'games', 'progress'],
);
assert.equal(grouped.find((s) => s.id === 'family').title, 'Familien');
assert.deepEqual(
  grouped.find((s) => s.id === 'memories').items.map((i) => i.id),
  ['albums', 'wall', 'familyTree', 'scratchMap', 'wishes'],
);
assert.equal(grouped.find((s) => s.id === 'kids'), undefined);
assert.deepEqual(
  grouped.find((s) => s.id === 'tools').items.map((i) => i.id),
  ['friends', 'klassen'],
  'Venner is leftover when still passed as a tool (drawer puts it in Hoved)',
);

const withoutProgress = groupParentAppItems(tools.filter((i) => i.id !== 'progress' && i.id !== 'klassen' && i.id !== 'friends'), t);
assert.equal(withoutProgress.find((s) => s.id === 'family').items.some((i) => i.id === 'progress'), false);
assert.equal(withoutProgress.find((s) => s.id === 'kids'), undefined);
assert.equal(withoutProgress.find((s) => s.id === 'tools'), undefined);

const leftover = groupParentAppItems([{ id: 'shop' }, { id: 'customTool' }], t);
assert.deepEqual(leftover.map((s) => s.id), ['food', 'tools']);
assert.equal(leftover[1].title, 'Øvrige apper');
assert.deepEqual(leftover[1].items.map((i) => i.id), ['customTool']);

console.log('parentAppGroups.test.mjs ok');
