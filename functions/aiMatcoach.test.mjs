import assert from 'node:assert/strict';
import { __test } from './aiMatcoach.js';

const {
  normalizePrefs,
  dishBlocked,
  localWeekPlan,
  localFridgeScan,
  localLunchBoxes,
  normalizeWeekPlan,
  LOCAL_DINNERS,
} = __test;

{
  const prefs = normalizePrefs({
    diet: 'vegetarian',
    allergies: ['peanøtt', ''],
    maxMinutes: 200,
    adults: 99,
    children: -1,
  });
  assert.equal(prefs.diet, 'vegetarian');
  assert.deepEqual(prefs.allergies, ['peanøtt']);
  assert.equal(prefs.maxMinutes, 120);
  assert.equal(prefs.adults, 12);
  assert.equal(prefs.children, 0);
}

{
  const prefs = normalizePrefs({ allergies: ['fiskeboller'], maxMinutes: 60 });
  const fish = LOCAL_DINNERS.find((d) => /fiskeboller/i.test(d.title));
  assert.ok(fish);
  assert.equal(dishBlocked(fish, prefs), true);
  assert.equal(dishBlocked(LOCAL_DINNERS.find((d) => /tomatpasta/i.test(d.title)), prefs), false);
}

{
  const plan = localWeekPlan(normalizePrefs({ adults: 2, children: 2, maxMinutes: 45, budgetKr: 1000 }));
  assert.equal(plan.days.length, 7);
  assert.equal(plan.days[0].dayName, 'Mandag');
  assert.equal(plan.days[6].dayName, 'Søndag');
  assert.ok(plan.days.every((d) => d.title && d.ingredients.length));
  assert.equal(plan.engine, 'local');
  assert.ok(plan.estimatedWeeklyCostKr <= 1000);
}

{
  const scan = localFridgeScan('melk, egg, paprika, pasta');
  assert.equal(scan.items.length, 4);
  assert.equal(scan.items[0].name, 'melk');
  assert.equal(scan.items[0].location, 'fridge');
  assert.equal(scan.items[3].location, 'pantry');
  assert.ok(scan.mealIdeas.length >= 1);
}

{
  const boxes = localLunchBoxes(normalizePrefs({ children: 2 }));
  assert.equal(boxes.boxes.length, 5);
  assert.equal(boxes.boxes[0].dayName, 'Mandag');
}

{
  const normalized = normalizeWeekPlan({
    headline: 'Test',
    summary: 'ok',
    estimatedWeeklyCostKr: 800,
    days: [{ dayIndex: 0, title: 'Suppe', minutes: 20, ingredients: [{ name: 'Løk', amount: '1', category: 'produce' }] }],
  }, normalizePrefs({}), 'gemini');
  assert.equal(normalized.days.length, 7);
  assert.equal(normalized.days[0].title, 'Suppe');
  assert.equal(normalized.days[1].dayName, 'Tirsdag');
  assert.equal(normalized.engine, 'gemini');
}

console.log('aiMatcoach.test.mjs ok');
