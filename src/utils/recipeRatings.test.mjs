import assert from 'node:assert/strict';
import {
  recipeRatingKey,
  sortRecipesByRating,
  ratingForRecipe,
  summarizeRatingEntries,
} from './recipeRatingHelpers.js';

assert.equal(recipeRatingKey({ id: 'abc', isCustom: true }), 'custom:abc');
assert.equal(recipeRatingKey({ id: 'lakseform' }), 'builtin:lakseform');
assert.equal(recipeRatingKey({ id: 'x', fromCatalog: true }), 'catalog:x');

assert.deepEqual(
  summarizeRatingEntries({
    u1: { stars: 5 },
    u2: { stars: 4 },
  }),
  { averageRating: 4.5, ratingCount: 2 },
);

const recipes = [
  { id: 'a', title: 'Aaa', isCustom: false },
  { id: 'b', title: 'Bbb', isCustom: true },
  { id: 'c', title: 'Ccc', isCustom: false },
];

const ratings = {
  'builtin:c': { averageRating: 4.5, ratingCount: 2 },
  'custom:b': { averageRating: 5, ratingCount: 1 },
  'builtin:a': { averageRating: 0, ratingCount: 0 },
};

const sorted = sortRecipesByRating(recipes, ratings);
assert.deepEqual(sorted.map((r) => r.id), ['b', 'c', 'a']);
assert.equal(ratingForRecipe(ratings, recipes[1]).averageRating, 5);

console.log('recipeRatings.test.mjs ok');
