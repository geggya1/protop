import assert from 'assert';
import {
  isLocalGoogleHost,
  shouldUseFirebaseGoogleOnLocal,
} from './googleLocalAuth.js';

assert.strictEqual(isLocalGoogleHost('localhost'), true);
assert.strictEqual(isLocalGoogleHost('127.0.0.1'), true);
assert.strictEqual(isLocalGoogleHost('192.168.1.20'), true);
assert.strictEqual(isLocalGoogleHost('protop.no'), false);

assert.strictEqual(
  shouldUseFirebaseGoogleOnLocal({ isWeb: true, hostname: 'localhost' }),
  true,
);
assert.strictEqual(
  shouldUseFirebaseGoogleOnLocal({ isWeb: true, hostname: 'protop.no' }),
  false,
);
assert.strictEqual(
  shouldUseFirebaseGoogleOnLocal({ isWeb: false, hostname: 'localhost' }),
  false,
);

console.log('googleLocalAuth: ok');
