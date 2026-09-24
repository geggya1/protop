import assert from 'node:assert/strict';
import {
  GROCERY_STORES,
  flyerUrlForStore,
  storeById,
} from './groceryStores.js';

assert.ok(GROCERY_STORES.length >= 8);
for (const store of GROCERY_STORES) {
  assert.ok(store.flyerUrl, `${store.id} missing flyerUrl`);
  assert.equal(store.flyerUrl.includes('/tilbudsavis'), false, `${store.id} still uses dead /tilbudsavis path`);
  if (store.id !== 'oda') {
    assert.match(store.flyerUrl, /etilbudsavis\.no/);
  }
}

assert.equal(flyerUrlForStore('kiwi'), 'https://etilbudsavis.no/Kiwi');
assert.equal(flyerUrlForStore('extra'), 'https://etilbudsavis.no/Extra');
assert.equal(flyerUrlForStore('coop'), 'https://etilbudsavis.no/coop-prix');
assert.ok(storeById('meny'));

console.log('groceryStores.test.mjs: ok');
