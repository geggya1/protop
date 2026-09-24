import assert from 'node:assert/strict';
import {
  groceryVisual,
  eventVisual,
  mealSlotsFromItems,
  wishVisual,
  weekColumns,
  withFallback,
  placeText,
  progressPct,
  FALLBACK_SHOP,
  FALLBACK_MEALS,
} from './homeWidgetVisuals.js';

assert.equal(groceryVisual('Melk').icon, 'water');
assert.equal(groceryVisual('BananeR').bg, '#E8C547');
assert.equal(groceryVisual('Tacolefser').icon, 'fast-food');
assert.equal(groceryVisual('Ukjent vare').icon, 'basket');

assert.equal(eventVisual('Fotballtrening').icon, 'football');
assert.equal(eventVisual('Legetime (EMT)').icon, 'medkit');
assert.equal(eventVisual('Kjøre til skolen').icon, 'car');
assert.equal(eventVisual('Teammøte').icon, 'people');

const meals = mealSlotsFromItems([{ id: 'x', title: 'Laks og ris', meta: 'Middag' }]);
assert.equal(meals.length, 3);
assert.equal(meals[1].meta, 'Laks og ris');
assert.equal(meals[0].title, 'Frokost');

assert.equal(wishVisual('Fotball').icon, 'football');
assert.equal(wishVisual('Ny bok').icon, 'book');

const cols = weekColumns({
  eventsToday: [{ title: 'Fotballtrening' }],
  eventsTomorrow: [{ title: 'Legetime' }],
  now: new Date(2026, 8, 21), // Monday
  useFallback: false,
});
assert.equal(cols.length, 5);
assert.equal(cols[0].items[0].label, 'Fotballtrening'.split(' ')[0]);
assert.equal(cols[1].items[0].label, 'Legetime');
assert.equal(cols[2].items.length, 0);

const emptyWeek = weekColumns({
  eventsToday: [],
  eventsTomorrow: [],
  now: new Date(2026, 8, 21),
  useFallback: true,
});
assert.ok(emptyWeek[0].items.length > 0);

assert.deepEqual(withFallback([], FALLBACK_SHOP, { demo: true }), FALLBACK_SHOP);
assert.deepEqual(withFallback([], FALLBACK_SHOP), []);
assert.equal(withFallback([{ id: 1 }], FALLBACK_SHOP).length, 1);

const compactWeek = weekColumns({
  eventsToday: [{ title: 'Fotballtrening' }],
  eventsTomorrow: [{ title: 'Legetime' }],
  now: new Date(2026, 8, 21),
  dayCount: 3,
});
assert.equal(compactWeek.length, 3);
assert.equal(compactWeek[0].label, 'Man');
assert.equal(progressPct(3, 5), 60);
assert.equal(progressPct(0, 0), 0);
assert.equal(FALLBACK_MEALS.length, 3);

assert.equal(placeText(null), '');
assert.equal(placeText('Banen'), 'Banen');
assert.equal(placeText({
  source: 'coords',
  lat: 59.91,
  placeId: 'abc',
  label: 'Oslo',
  lng: 10.75,
}), 'Oslo');
assert.equal(placeText({ name: 'Hjem', lat: 1, lng: 2 }), 'Hjem');
assert.equal(placeText({ lat: 1, lng: 2, placeId: '', source: 'x' }), '');
assert.equal(typeof placeText({
  source: 'profile', lat: 1, placeId: '', label: 'Bergen', lng: 2,
}), 'string');

console.log('homeWidgetVisuals.test.mjs: ok');
