import assert from 'node:assert/strict';
import {
  DEFAULT_MATCOACH_PREFS,
  collectShoppingFromPlan,
  mergeFridgeSelections,
  lunchBoxIsColdSafe,
  subtractPantryFromShopping,
  restorePlanFromHistoryEntry,
  matchRecipeForSuggestion,
  enrichSuggestionDay,
  dayAsRecipeThumb,
  synthesizeInstructions,
} from './matcoachLogic.js';

assert.equal(DEFAULT_MATCOACH_PREFS.diet, 'classic');
assert.equal(DEFAULT_MATCOACH_PREFS.maxMinutes, 40);

{
  const plan = {
    days: [
      {
        dayName: 'Mandag',
        ingredients: [
          { name: 'Løk', amount: '1 stk', category: 'produce' },
          { name: 'Pasta', amount: '400 g', category: 'general' },
        ],
      },
      {
        dayName: 'Tirsdag',
        ingredients: [
          { name: 'løk', amount: '2 stk', category: 'produce' },
          { name: 'Melk', amount: '1 liter', category: 'dairy' },
        ],
      },
    ],
  };
  const list = collectShoppingFromPlan(plan);
  assert.equal(list.length, 3);
  const onion = list.find((i) => i.name.toLowerCase() === 'løk');
  assert.ok(onion);
  assert.deepEqual(onion.fromDays, ['Mandag', 'Tirsdag']);
}

{
  const items = [
    { name: 'Melk', amountText: '1 l', location: 'fridge' },
    { name: 'Egg', amountText: '6', location: 'fridge' },
    { name: '', amountText: '', location: 'fridge' },
  ];
  const all = mergeFridgeSelections(items);
  assert.equal(all.length, 2);
  const onlyMilk = mergeFridgeSelections(items, ['Melk']);
  assert.equal(onlyMilk.length, 1);
  assert.equal(onlyMilk[0].name, 'Melk');
  const relocated = mergeFridgeSelections(items, ['Egg'], { Egg: 'freezer' });
  assert.equal(relocated.length, 1);
  assert.equal(relocated[0].location, 'freezer');
}

{
  const guessed = mergeFridgeSelections([
    { name: 'Pasta', amountText: '500 g', category: 'general' },
    { name: 'Iskrem', amountText: '', category: 'frozen' },
  ]);
  assert.equal(guessed[0].location, 'pantry');
  assert.equal(guessed[1].location, 'freezer');
}

{
  assert.equal(lunchBoxIsColdSafe({ title: 'Wrap med kylling', items: [{ name: 'Tortilla' }] }), true);
  assert.equal(lunchBoxIsColdSafe({ title: 'Varm gryte i termos', items: [] }), false);
}

{
  const shopping = [
    { name: 'Melk', amount: '1 l' },
    { name: 'Pasta', amount: '400 g' },
    { name: 'Løk', amount: '2 stk' },
  ];
  const pantry = [{ name: 'melk' }, { name: 'Ost' }];
  const { needed, covered } = subtractPantryFromShopping(shopping, pantry);
  assert.equal(needed.length, 2);
  assert.equal(covered.length, 1);
  assert.equal(covered[0].name, 'Melk');
}

{
  const restored = restorePlanFromHistoryEntry({
    headline: 'Uke',
    summary: 'ok',
    engine: 'local',
    snapshot: { days: [{ dayIndex: 0, title: 'Suppe' }], estimatedWeeklyCostKr: 700 },
  });
  assert.equal(restored.days[0].title, 'Suppe');
  assert.equal(restorePlanFromHistoryEntry({ snapshot: {} }), null);
}

{
  const recipes = [
    {
      id: 'tomatpasta',
      title: 'Kremet tomatpasta',
      emoji: '🍝',
      description: 'Rask pasta',
      minutes: 25,
      ingredients: [{ name: 'Pasta', amount: '400 g' }],
      instructions: '1. Kok pasta.\n2. Lag saus.',
    },
  ];
  const matched = matchRecipeForSuggestion({ title: 'Kremet tomatpasta' }, recipes);
  assert.equal(matched.id, 'tomatpasta');
  const enriched = enrichSuggestionDay({
    dayIndex: 0,
    dayName: 'Mandag',
    title: 'Kremet tomatpasta',
    whyChosen: 'Raskt',
  }, recipes);
  assert.equal(enriched.recipeId, 'tomatpasta');
  assert.ok(enriched.instructions.includes('Kok pasta'));
  assert.equal(enriched.ingredients[0].name, 'Pasta');
  const thumb = dayAsRecipeThumb(enriched);
  assert.equal(thumb.sourceBuiltinId, 'tomatpasta');
  const synth = synthesizeInstructions({ title: 'Test', ingredients: [{ name: 'Løk' }] });
  assert.match(synth, /Samle ingrediensene/);
}

console.log('matcoachLogic.test.mjs ok');
