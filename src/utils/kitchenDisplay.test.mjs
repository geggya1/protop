import assert from 'node:assert/strict';
import {
  isValidKitchenPin,
  verifyKitchenPin,
} from './kitchenDisplay.js';

assert.equal(isValidKitchenPin('1234'), true);
assert.equal(isValidKitchenPin('12'), false);
assert.equal(isValidKitchenPin('abcd'), false);
assert.equal(isValidKitchenPin('12345'), false);
assert.equal(isValidKitchenPin(''), false);

assert.equal(verifyKitchenPin({}, '0000'), true);
assert.equal(verifyKitchenPin({ pinHash: null }, '0000'), true);

// Samme djb2-hash som kitchenDisplay (speil for test)
function hashPin(pin) {
  const s = String(pin || '');
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) + h) + s.charCodeAt(i);
  }
  return String(h >>> 0);
}

const settings = { pinHash: hashPin('2468') };
assert.equal(verifyKitchenPin(settings, '2468'), true);
assert.equal(verifyKitchenPin(settings, '0000'), false);
assert.equal(verifyKitchenPin(settings, '24680'), false);

console.log('kitchenDisplay ok');
