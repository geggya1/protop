import assert from 'node:assert/strict';
import {
  isValidKitchenPin,
  verifyKitchenPin,
} from './kitchenDisplay.js';
import { LEGACY_KITCHEN_PIN_SALT } from './legacyNames.js';

assert.equal(isValidKitchenPin('1234'), true);
assert.equal(isValidKitchenPin('12'), false);
assert.equal(isValidKitchenPin('abcd'), false);
assert.equal(isValidKitchenPin('12345'), false);
assert.equal(isValidKitchenPin(''), false);

assert.equal(await verifyKitchenPin({}, '0000'), true);
assert.equal(await verifyKitchenPin({ pinHash: null }, '0000'), true);

async function hashPin(pin, salt = 'protop-kitchen-v2:') {
  const s = `${salt}${String(pin || '')}`;
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const settings = { pinHash: await hashPin('2468') };
assert.equal(await verifyKitchenPin(settings, '2468'), true);
assert.equal(await verifyKitchenPin(settings, '0000'), false);
assert.equal(await verifyKitchenPin(settings, '24680'), false);

// PIN lagret før ProTop virker fortsatt.
const legacy = { pinHash: await hashPin('1357', LEGACY_KITCHEN_PIN_SALT) };
assert.equal(await verifyKitchenPin(legacy, '1357'), true);
assert.equal(await verifyKitchenPin(legacy, '0000'), false);

console.log('kitchenDisplay ok');
