import assert from 'node:assert/strict';
import { guessCategory, isOffProductMissing, lookupProduct } from './productLookup.js';

assert.equal(guessCategory(['en:milks'], 'Melk'), 'dairy');
assert.equal(guessCategory(['en:fruit-jams'], 'Bringebærsyltetøy'), 'pantry');
assert.equal(guessCategory(['en:fresh-fruits'], 'Eple'), 'produce');

assert.equal(isOffProductMissing({ status: 404 }, { status: 0 }), true);
assert.equal(isOffProductMissing({ status: 404 }, null), true);
assert.equal(isOffProductMissing({ status: 200 }, { status: 0 }), true);
assert.equal(isOffProductMissing({ status: 200 }, { status: 1, product: {} }), false);
assert.equal(isOffProductMissing({ status: 503 }, { status: 1 }), false);

const originalFetch = globalThis.fetch;

globalThis.fetch = async () => ({
  ok: false,
  status: 404,
  async json() {
    return { code: '7038010011234', status: 0, status_verbose: 'product not found' };
  },
});

const missing = await lookupProduct('7038010011234');
assert.equal(missing.notFound, true);
assert.equal(missing.barcode, '7038010011234');
assert.match(missing.title, /7038010011234/);
assert.equal(missing.source, null);

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  async json() {
    return {
      status: 1,
      product: {
        product_name_no: 'Skummet melk',
        brands: 'Tine sa, Extra',
        categories_tags: ['en:milks'],
        quantity: '1 l',
        image_front_small_url: 'https://example.com/m.jpg',
        nutriments: { 'energy-kcal_100g': 35 },
        completeness: 0.8,
      },
    };
  },
});

const found = await lookupProduct('7038010002151');
assert.equal(found.notFound, false);
assert.equal(found.title, 'Skummet melk');
assert.equal(found.brand, 'Tine sa');
assert.equal(found.category, 'dairy');
assert.equal(found.quantity, '1 l');
assert.equal(found.imageUrl, 'https://example.com/m.jpg');
assert.equal(found.kcal100g, 35);
assert.equal(found.source, 'openfoodfacts');

globalThis.fetch = async () => {
  throw new TypeError('Network request failed');
};

await assert.rejects(
  () => lookupProduct('7038010002151'),
  /nettforbindelsen/i,
);

globalThis.fetch = async () => ({
  ok: false,
  status: 503,
  async json() {
    throw new Error('not json');
  },
});

await assert.rejects(
  () => lookupProduct('7038010002151'),
  /Prøv igjen om litt/i,
);

globalThis.fetch = originalFetch;

console.log('productLookup ok');
