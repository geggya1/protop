import assert from 'node:assert/strict';
import {
  DEFAULT_PARENT_SHORTCUT_IDS,
  DEFAULT_HOME_SHORTCUT_TILES,
  DEFAULT_CHILD_HOME_SHORTCUT_TILES,
  MORE_FOLDER_GLYPHS,
  normalizeShortcutIds,
  resolveShortcutIds,
  parentAppShortLabel,
  MAX_PARENT_SHORTCUTS,
} from './parentHomeShortcuts.js';

assert.deepEqual(
  normalizeShortcutIds(['stars', 'shop', 'stars', '', null, 'chat']),
  ['stars', 'shop', 'chat'],
);

assert.deepEqual(
  normalizeShortcutIds(['stars', 'nope', 'mail'], { allowedIds: new Set(['stars', 'mail']) }),
  ['stars', 'mail'],
);

const many = Array.from({ length: 20 }, (_, i) => `a${i}`);
assert.equal(normalizeShortcutIds(many).length, MAX_PARENT_SHORTCUTS);

assert.deepEqual(
  resolveShortcutIds(null, ['stars', 'shop', 'chat', 'mail', 'plan', 'games']),
  DEFAULT_PARENT_SHORTCUT_IDS,
);

assert.deepEqual(DEFAULT_PARENT_SHORTCUT_IDS, ['stars', 'shop', 'games', 'mail']);
assert.deepEqual(
  DEFAULT_HOME_SHORTCUT_TILES.map((t) => t.id),
  ['stars', 'shop', 'games', 'more'],
);
assert.equal(DEFAULT_HOME_SHORTCUT_TILES[0].tileLabel, 'Oppgave');
assert.equal(DEFAULT_HOME_SHORTCUT_TILES[2].tileLabel, 'Familiespill');
assert.equal(DEFAULT_HOME_SHORTCUT_TILES[3].tileLabel, '+ mer');
assert.equal(DEFAULT_HOME_SHORTCUT_TILES[3].folder, true);
assert.deepEqual(
  DEFAULT_CHILD_HOME_SHORTCUT_TILES.map((t) => t.id),
  ['stars', 'chores', 'games', 'more'],
);
assert.equal(DEFAULT_CHILD_HOME_SHORTCUT_TILES[0].tileLabel, 'Oppgave');
assert.equal(DEFAULT_CHILD_HOME_SHORTCUT_TILES[1].tileLabel, 'Gjøremål');
assert.equal(DEFAULT_CHILD_HOME_SHORTCUT_TILES[2].tileLabel, 'Familiespill');
assert.equal(DEFAULT_CHILD_HOME_SHORTCUT_TILES[3].folder, true);
assert.equal(parentAppShortLabel({ id: 'skole', label: 'Skolen' }), 'Skole');
assert.equal(MORE_FOLDER_GLYPHS.length, 4);
assert.equal(parentAppShortLabel({ id: 'more', label: 'Mer' }), '+ mer');

assert.deepEqual(
  resolveShortcutIds(['plan', 'notes'], ['plan', 'notes', 'chat']),
  ['plan', 'notes'],
);

assert.equal(parentAppShortLabel({ id: 'meals', label: 'Måltidsplanlegger' }), 'Måltidsplan');
assert.equal(parentAppShortLabel({ id: 'notes', label: 'Notater' }), 'Notat');
assert.equal(parentAppShortLabel({ id: 'friends', label: 'Venner' }), 'Venner');

console.log('parentHomeShortcuts.test.mjs: ok');
