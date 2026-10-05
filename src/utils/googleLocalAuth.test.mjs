import assert from 'assert';
import { shouldUseFirebasePopupForGoogle } from './googleLocalAuth.js';

assert.strictEqual(
  shouldUseFirebasePopupForGoogle({ isWeb: true, hostname: 'localhost' }),
  true,
);
assert.strictEqual(
  shouldUseFirebasePopupForGoogle({ isWeb: true, hostname: '127.0.0.1' }),
  true,
);
assert.strictEqual(
  shouldUseFirebasePopupForGoogle({ isWeb: true, hostname: 'protop.no' }),
  false,
);
assert.strictEqual(
  shouldUseFirebasePopupForGoogle({ isWeb: false, hostname: 'localhost' }),
  false,
);

console.log('googleLocalAuth: ok');
