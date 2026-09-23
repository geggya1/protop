import assert from 'node:assert/strict';
import {
  addWidget,
  catalogForRole,
  groupedCatalog,
  cycleWidgetSize,
  DEFAULT_CHILD_WIDGETS,
  DEFAULT_PARENT_WIDGETS,
  DEFAULT_HOME_LOOK,
  HOME_LOOKS,
  PARENT_WIDGET_CATALOG,
  CHILD_WIDGET_CATALOG,
  applyCanonicalLook,
  applyCanonicalVariants,
  MODULE_CHROME,
  moduleChrome,
  helpIdForWidget,
  moveWidget,
  moveWidgetToIndex,
  normalizeWidgets,
  packWidgetRows,
  removeWidget,
  resolvedWidgetSize,
  setHomeLook,
  widgetVariant,
  widgetCellStyle,
  widgetsForLook,
  toggleWidgetType,
  setWidgetVariantInList,
  isWidgetOn,
} from './homeWidgetCatalog.js';

assert.equal(DEFAULT_HOME_LOOK, 'oversikt');
assert.deepEqual(HOME_LOOKS.map((l) => l.id), ['oversikt', 'fokus']);

assert.deepEqual(DEFAULT_PARENT_WIDGETS.map((w) => w.type), [
  'timeline', 'tasks', 'notes', 'reminders', 'shortcuts',
]);
assert.deepEqual(
  DEFAULT_PARENT_WIDGETS.filter((w) => w.type === 'tasks' || w.type === 'notes').map((w) => ({
    type: w.type, gw: w.gw, gh: w.gh,
  })),
  [
    { type: 'tasks', gw: 3, gh: 2 },
    { type: 'notes', gw: 2, gh: 3 },
  ],
);
assert.deepEqual(DEFAULT_CHILD_WIDGETS.map((w) => w.type), [
  'timeline', 'tasks', 'notes', 'shortcuts',
]);
assert.ok(!DEFAULT_PARENT_WIDGETS.some((w) => w.type === 'clock'));
assert.ok(!DEFAULT_PARENT_WIDGETS.some((w) => w.type === 'date'));
assert.ok(!DEFAULT_PARENT_WIDGETS.some((w) => w.type === 'messages'));

const packed = packWidgetRows([
  { id: 'a', type: 'weather', size: 'half' },
  { id: 'b', type: 'nextEvent', size: 'half' },
  { id: 'c', type: 'timeline', size: 'full' },
  { id: 'd', type: 'tasks', size: 'tall' },
]);
assert.equal(packed.length, 3);
assert.deepEqual(packed[0].items.map((w) => w.id), ['a', 'b']);
assert.equal(packed[1].items[0].id, 'c');
assert.equal(packed[2].items[0].size, 'tall');

const thirds = packWidgetRows([
  { id: 't1', type: 'tasks', size: 'third' },
  { id: 't2', type: 'shopping', size: 'third' },
  { id: 't3', type: 'meals', size: 'third' },
  { id: 't4', type: 'notes', size: 'full' },
]);
assert.equal(thirds.length, 2);
assert.equal(thirds[0].items.length, 3);
assert.equal(resolvedWidgetSize({ type: 'tasks', size: 'third' }), 'third');
assert.deepEqual(widgetCellStyle({ type: 'tasks', size: 'third' }), { minWidth: 0, width: '31.5%' });
assert.deepEqual(widgetCellStyle({ type: 'weather', size: 'half' }), { minWidth: 0, width: '48.5%' });
assert.deepEqual(widgetCellStyle({ type: 'tasks', size: 'third' }, { shareRow: true }), { flex: 1, minWidth: 0 });

const moved = moveWidget(
  [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  'a',
  1,
);
assert.deepEqual(moved.map((w) => w.id), ['b', 'a', 'c']);

const swapped = moveWidgetToIndex(
  [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  'c',
  'a',
);
assert.deepEqual(swapped.map((w) => w.id), ['c', 'a', 'b']);

const cleaned = normalizeWidgets([
  { id: 'x', type: 'weather', size: 'tall' },
  { type: 'not-real', size: 'full' },
  { id: 'x', type: 'clock', size: 'half' },
], 'parent');
assert.equal(cleaned.length, 1);
assert.equal(cleaned[0].type, 'weather');
assert.equal(cleaned[0].size, 'full');

const sized = cycleWidgetSize({ id: 't', type: 'tasks', size: 'half', gw: 2, gh: 2 });
assert.equal(sized.gw, 3);
assert.equal(sized.gh, 2);

const added = addWidget([], 'notes', 'parent');
assert.equal(added[0].type, 'notes');
assert.equal(removeWidget(added, added[0].id).length, 0);
assert.equal(addWidget(added, 'notes', 'parent').length, 1);

const withoutNotes = toggleWidgetType(DEFAULT_PARENT_WIDGETS, 'notes', 'parent');
assert.equal(isWidgetOn(withoutNotes, 'notes'), false);
assert.equal(isWidgetOn(toggleWidgetType(withoutNotes, 'notes', 'parent'), 'notes'), true);
assert.equal(isWidgetOn(setWidgetVariantInList(DEFAULT_PARENT_WIDGETS, 'notes', 'off', 'parent'), 'notes'), false);
assert.equal(setWidgetVariantInList(DEFAULT_PARENT_WIDGETS, 'tasks', 'illustrated', 'parent').find((w) => w.type === 'tasks').variant, 'illustrated');

assert.ok(catalogForRole('child').every((w) => w.type !== 'shopping'));
assert.ok(catalogForRole('child').every((w) => w.type !== 'custody'));
assert.ok(catalogForRole('child').every((w) => w.type !== 'meals'));
assert.ok(catalogForRole('child').every((w) => w.type !== 'homework'));
assert.ok(catalogForRole('child').every((w) => w.type !== 'school'));
assert.ok(catalogForRole('child').some((w) => w.type === 'tasks'));
assert.ok(catalogForRole('child').some((w) => w.type === 'notes'));
assert.ok(catalogForRole('child').some((w) => w.type === 'timeline'));
assert.ok(catalogForRole('parent').every((w) => w.type !== 'custody'));
assert.ok(!PARENT_WIDGET_CATALOG.some((w) => w.type === 'custody'));
assert.ok(!groupedCatalog('parent').flatMap((g) => g.items).some((i) => i.type === 'custody'));
assert.equal(
  normalizeWidgets([{ id: 'old-custody', type: 'custody', size: 'full' }], 'parent').length,
  0,
);
assert.ok(catalogForRole('parent').every((w) => !['rewards', 'goals', 'progress', 'messages', 'family', 'location', 'activities', 'familyTree', 'shopping', 'meals'].includes(w.type)));
assert.ok(catalogForRole('parent').some((w) => w.type === 'weekPlan'));
assert.ok(catalogForRole('parent').some((w) => w.type === 'tasks'));
assert.ok(catalogForRole('parent').some((w) => w.type === 'notes'));
assert.ok(catalogForRole('parent').some((w) => w.type === 'timeline'));
assert.ok(catalogForRole('parent').some((w) => w.type === 'reminders'));

const parentChoices = groupedCatalog('parent').flatMap((g) => g.items.map((i) => i.type));
assert.equal(parentChoices.length, catalogForRole('parent').length);
catalogForRole('parent').forEach((item) => {
  assert.ok(parentChoices.includes(item.type), `missing parent choice ${item.type}`);
});
const childChoices = groupedCatalog('child').flatMap((g) => g.items.map((i) => i.type));
assert.equal(childChoices.length, catalogForRole('child').length);
catalogForRole('child').forEach((item) => {
  assert.ok(childChoices.includes(item.type), `missing child choice ${item.type}`);
});
assert.ok(catalogForRole('child').every((w) => w.type !== 'school'));
assert.ok(catalogForRole('child').every((w) => w.type !== 'homework'));
assert.ok(groupedCatalog('parent').some((g) => g.id === 'plan'));
assert.ok(groupedCatalog('parent').find((g) => g.id === 'plan').items.some((i) => i.type === 'timeline'));
assert.equal(moduleChrome('timeline').icon, 'list');
assert.equal(moduleChrome('family').icon, 'people');
assert.equal(moduleChrome('messages').icon, 'chatbubbles');
assert.equal(moduleChrome('tasks').icon, 'checkbox');
assert.notEqual(moduleChrome('timeline').icon, moduleChrome('family').icon);
assert.ok(MODULE_CHROME.weekPlan);
assert.ok(MODULE_CHROME.school);
assert.ok(MODULE_CHROME.rewards);
assert.ok(MODULE_CHROME.progress);
assert.ok(Object.values(MODULE_CHROME).every((c) => c.icon && c.glyphColor));

assert.equal(DEFAULT_PARENT_WIDGETS[0].gw, 5);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'tasks').gw, 3);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'tasks').gh, 2);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'tasks').col, 0);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'notes').gw, 2);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'notes').gh, 3);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'notes').col, 3);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'timeline').gh, 2);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'reminders').row, 5);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'shortcuts').variant, 'row');
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'shortcuts').row, 7);

assert.equal(DEFAULT_CHILD_WIDGETS[0].gw, 5);
assert.equal(DEFAULT_CHILD_WIDGETS[0].gh, 2);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'tasks').gw, 5);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'tasks').gh, 2);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'notes').gw, 5);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'notes').col, 0);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'notes').row, 4);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'shortcuts').row, 6);
assert.equal(DEFAULT_CHILD_WIDGETS.find((w) => w.type === 'shortcuts').variant, 'row');
assert.deepEqual(
  widgetsForLook('fokus', 'child').map((w) => w.type),
  DEFAULT_CHILD_WIDGETS.map((w) => w.type),
);

const packedDefault = packWidgetRows(DEFAULT_PARENT_WIDGETS);
assert.ok(packedDefault.length >= 2);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'tasks').col, 0);
assert.equal(DEFAULT_PARENT_WIDGETS.find((w) => w.type === 'notes').col, 3);

const fokusParent = widgetsForLook('fokus', 'parent');
assert.deepEqual(fokusParent.map((w) => w.type), DEFAULT_PARENT_WIDGETS.map((w) => w.type));
assert.equal(fokusParent.find((w) => w.type === 'timeline').gh, 2);
assert.equal(fokusParent.find((w) => w.type === 'tasks').gw, 3);
assert.equal(fokusParent.find((w) => w.type === 'tasks').gh, 2);
assert.equal(fokusParent.find((w) => w.type === 'notes').gh, 3);

assert.equal(widgetVariant('weather', 'small').id, 'now');
assert.equal(widgetVariant('weather', 'now').size, 'half');
assert.equal(widgetVariant('weather', 'medium').id, 'hours');
assert.equal(widgetVariant('weather', 'day').gw, 5);
assert.equal(widgetVariant('timeline').height, undefined);
assert.equal(resolvedWidgetSize({ type: 'tasks', size: 'full' }), 'full');

const applied = applyCanonicalLook('fokus', 'parent');
assert.equal(applied.find((w) => w.type === 'shortcuts').variant, 'row');
assert.equal(applied.find((w) => w.type === 'tasks').gh, 2);
assert.deepEqual(applyCanonicalVariants([], 'parent').map((w) => w.type), DEFAULT_PARENT_WIDGETS.map((w) => w.type));
assert.deepEqual(setHomeLook([], 'fokus', 'parent').map((w) => w.type), fokusParent.map((w) => w.type));

const helpUsed = new Set();
assert.equal(helpIdForWidget({ type: 'weather', size: 'half' }, helpUsed), null);
assert.equal(helpIdForWidget({ type: 'clock', size: 'half' }, helpUsed), null);
assert.equal(helpIdForWidget({ type: 'nextEvent', size: 'half' }, helpUsed), 'timeline');
assert.equal(helpIdForWidget({ type: 'tasks', size: 'third' }, helpUsed), null);
assert.equal(helpIdForWidget({ type: 'shopping', size: 'third' }, helpUsed), 'content');
assert.equal(helpIdForWidget({ type: 'kids', size: 'full' }, helpUsed), null);
assert.equal(helpIdForWidget({ type: 'shortcuts', size: 'third' }, helpUsed), 'shortcuts');

console.log('homeWidgetCatalog.test.mjs: ok');
