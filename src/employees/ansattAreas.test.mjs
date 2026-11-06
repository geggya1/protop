import assert from 'node:assert/strict';
import { ANSATT_AREAS, ansattArea, ansattTiles, tint } from './ansattAreas.js';
import { ANSATT_MENU } from '../navigation/shellModules.js';

// Samme ikon i menyen og på flisene (den røde tråden).
const menuIcon = Object.fromEntries(ANSATT_MENU.map((row) => [row.id, row.icon.replace(/-outline$/, '')]));
assert.equal(ANSATT_AREAS.home.icon, menuIcon['ansatt-minside']);
assert.equal(ANSATT_AREAS.todo.icon, menuIcon['ansatt-gjoremal']);
assert.equal(ANSATT_AREAS.hours.icon, menuIcon['ansatt-timeliste']);
assert.equal(ANSATT_AREAS.absence.icon, menuIcon['ansatt-fravaer']);
assert.equal(ANSATT_AREAS.expenses.icon, menuIcon['ansatt-utlegg']);
// Hvert område har sin egen farge.
const colorsUsed = Object.values(ANSATT_AREAS).map((a) => a.color);
assert.equal(new Set(colorsUsed).size, colorsUsed.length);
for (const c of colorsUsed) assert.match(c, /^#[0-9a-f]{6}$/);
assert.equal(ansattArea('ukjent').id, 'home');

assert.equal(tint('#2563eb', 0.1), '#2563eb1a');
assert.equal(tint('var(--x)', 0.1), 'var(--x)');

// Flisene: bare områder med en vei inn, i fast rekkefølge, og hver flis har en handling.
const fn = () => {};
let tiles = ansattTiles({
  todo: { open: 2, urgent: 1 }, week: { worked: 20, planned: 37.5 }, absenceDays: 3.5, profilePct: 80,
  open: { todo: fn, hours: fn, absence: fn, expenses: fn, mileage: fn, settings: fn },
});
assert.deepEqual(tiles.map((t) => t.id), ['todo', 'hours', 'absence', 'expenses', 'mileage', 'settings']);
for (const t of tiles) assert.equal(typeof t.onPress, 'function', t.id);
assert.equal(tiles[0].value, '2');
assert.equal(tiles[0].alert, true);
assert.equal(tiles[1].value, '20 t');
assert.equal(tiles[1].caption, 'av 37,5 t planlagt');
assert.ok(Math.abs(tiles[1].progress - 20 / 37.5) < 1e-9);
assert.equal(tiles[2].value, '3,5');
assert.equal(tiles[5].value, '80 %');
assert.equal(tiles[5].progress, 0.8);

tiles = ansattTiles({ todo: { open: 0, urgent: 0 }, open: { todo: fn } });
assert.equal(tiles.length, 1);
assert.equal(tiles[0].caption, 'Alt er på plass');
assert.equal(tiles[0].alert, false);
// Mens tallene hentes.
tiles = ansattTiles({ open: { todo: fn, hours: fn, absence: fn } });
assert.deepEqual(tiles.map((t) => t.value), ['…', '…', '…']);
// Uten tilgang: ingen flis.
assert.deepEqual(ansattTiles({ open: {} }), []);
// Over 100 % av planen gir full stolpe, ikke mer.
assert.equal(ansattTiles({ week: { worked: 50, planned: 37.5 }, open: { hours: fn } })[0].progress, 1);

console.log('ansattAreas.test.mjs: ok');
