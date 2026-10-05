import assert from 'assert';
import {
  isLocalGoogleHost,
  localGoogleAuthStrategy,
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

assert.strictEqual(
  localGoogleAuthStrategy({ isWeb: true, hostname: '127.0.0.1' }),
  'firebase-popup-then-redirect',
);
assert.strictEqual(
  localGoogleAuthStrategy({ isWeb: true, hostname: 'protop.no' }),
  'gis-or-firebase',
);

console.log('googleLocalAuth: ok');
