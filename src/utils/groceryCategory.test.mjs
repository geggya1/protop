import assert from 'node:assert/strict';
import {
  AISLE_ORDER,
  classifyShoppingItem,
  guessShoppingCategory,
  resolveIngredientCategory,
  SHOPPING_CATEGORY_KEYS,
} from './groceryCategory.js';
import { guessCategory } from './productLookup.js';

function assertCat(name, expected) {
  const got = classifyShoppingItem(name);
  assert.equal(got.category, expected, `${name} → category=${got.category}, expected ${expected}`);
  assert.equal(guessShoppingCategory(name), expected, `${name} guess ≠ ${expected}`);
}

function aisleSortIndex(category) {
  const i = AISLE_ORDER.indexOf(category || 'general');
  return i >= 0 ? i : AISLE_ORDER.length;
}

function sortItemsForSession(items = []) {
  return [...(items || [])].sort((a, b) => {
    const aDone = a.done ? 1 : 0;
    const bDone = b.done ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ai = aisleSortIndex(a.category);
    const bi = aisleSortIndex(b.category);
    if (ai !== bi) return ai - bi;
    return String(a.title || '').localeCompare(String(b.title || ''), 'nb');
  });
}

// --- Rapporterte feil: baconost / havregryn / servelat ---
assertCat('Baconost', 'dairy');
assertCat('baconost', 'dairy');
assertCat('Skinkeost', 'dairy');
assertCat('Havregryn', 'pantry');
assertCat('havregryn', 'pantry');
assertCat('Servelat', 'meat');
assertCat('servelat', 'meat');

// --- Meieri vs kjøtt ---
assertCat('Ost', 'dairy');
assertCat('Melk', 'dairy');
assertCat('Bacon', 'meat');
assertCat('Skinke', 'meat');
assertCat('Kjøttdeig', 'meat');
assertCat('Salami', 'meat');

// --- Tørrvare / frokost ---
assertCat('Cornflakes', 'pantry');
assertCat('Müsli', 'pantry');
assertCat('Pasta', 'pantry');
assertCat('Leverpostei', 'pantry');
assertCat('Makrell i tomat', 'pantry');

// --- Drikke før frukt (eplemost) ---
assertCat('Eplemost', 'drinks');
assertCat('Solkysset Appelsin', 'drinks');

// --- Husholdning (ekte) vs ukjent mat ---
assertCat('Barberhøvel', 'household');
assertCat('Oppvaskmiddel', 'household');
assertCat('Toalettpapir', 'household');

const unknown = classifyShoppingItem('Xyzzyqwerty');
assert.equal(unknown.category, 'general');
assert.equal(unknown.confident, false);
assert.equal(unknown.suggestions[0], 'general');

// --- resolveIngredientCategory beholder kjent kategori ---
assert.equal(resolveIngredientCategory({ name: 'Baconost', category: 'dairy' }), 'dairy');
assert.equal(resolveIngredientCategory({ name: 'Baconost', category: 'general' }), 'dairy');
assert.equal(resolveIngredientCategory({ name: 'Havregryn' }), 'pantry');

// --- Hyllerekkefølge: meieri før kjøtt, tørrvare etter ---
assert.ok(AISLE_ORDER.indexOf('dairy') < AISLE_ORDER.indexOf('meat'));
assert.ok(AISLE_ORDER.indexOf('meat') < AISLE_ORDER.indexOf('pantry'));
assert.ok(AISLE_ORDER.indexOf('pantry') < AISLE_ORDER.indexOf('household'));
assert.deepEqual(
  [...new Set(AISLE_ORDER)].sort(),
  [...SHOPPING_CATEGORY_KEYS].sort(),
);

const sorted = sortItemsForSession([
  { id: '1', title: 'Baconost', category: 'dairy', done: false },
  { id: '2', title: 'Havregryn', category: 'pantry', done: false },
  { id: '3', title: 'Servelat', category: 'meat', done: false },
  { id: '4', title: 'Eple', category: 'produce', done: false },
  { id: '5', title: 'Såpe', category: 'household', done: false },
]);
assert.deepEqual(
  sorted.map((i) => i.title),
  ['Eple', 'Baconost', 'Servelat', 'Havregryn', 'Såpe'],
);

// --- Open Food Facts-sti: baconost / havregryn ---
assert.equal(guessCategory([], 'Baconost'), 'dairy');
assert.equal(guessCategory(['en:bacons'], 'Baconost'), 'dairy');
assert.equal(guessCategory([], 'Havregryn'), 'pantry');
assert.equal(guessCategory(['en:meats'], 'Servelat'), 'meat');
assert.equal(guessCategory(['en:milks'], 'Melk'), 'dairy');
assert.equal(guessCategory(['en:fruit-jams'], 'Bringebærsyltetøy'), 'pantry');

console.log('groceryCategory.test.mjs: ok');
