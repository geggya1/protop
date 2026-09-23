import assert from 'node:assert/strict';
import { normalizeBarcode, isValidBarcode } from './barcode.js';

assert.equal(normalizeBarcode('7038010002151'), '7038010002151');
assert.equal(normalizeBarcode('70 38010 00215 1'), '7038010002151');
assert.equal(normalizeBarcode('012345678905'), '0012345678905'); // UPC-A → EAN-13
assert.equal(normalizeBarcode('07038010002151'), '7038010002151'); // leading 0 + 13 → last 13
assert.equal(isValidBarcode('7038010002151'), true);
assert.equal(isValidBarcode('12345678'), true);
assert.equal(isValidBarcode('123'), false);
assert.equal(isValidBarcode(''), false);

console.log('barcode ok');
