import assert from 'node:assert/strict';
import { activeShopFamilyIds, shopFamilyIdsKey } from './shopFamilyIds.js';

const families = [
  { id: 'a', active: true },
  { id: 'b', deleted: true },
  { id: 'c', archived: true },
  { id: 'd', active: false },
  { id: 'e' },
];

assert.deepEqual(activeShopFamilyIds(families, 'a'), ['a', 'e']);
assert.deepEqual(activeShopFamilyIds(families, 'z'), ['a', 'e', 'z']);
assert.equal(shopFamilyIdsKey(families, 'a'), 'a|e');
assert.equal(shopFamilyIdsKey(families, 'z'), 'a|e|z');
assert.equal(shopFamilyIdsKey(null, 'x'), 'x');
assert.deepEqual(activeShopFamilyIds([], null), []);
assert.equal(shopFamilyIdsKey([], null), '');

console.log('shopFamilyIds.test.mjs: ok');
