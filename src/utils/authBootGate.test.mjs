import assert from 'node:assert/strict';
import { shouldRedirectStartUrlToMarketing } from './authBootGate.js';

assert.equal(
  shouldRedirectStartUrlToMarketing({
    authBootstrapped: false,
    loading: true,
    user: null,
  }),
  false,
  'must not redirect during auth bootstrap',
);

assert.equal(
  shouldRedirectStartUrlToMarketing({
    authBootstrapped: true,
    loading: true,
    user: null,
  }),
  false,
  'must not redirect while auth listener is still resolving',
);

assert.equal(
  shouldRedirectStartUrlToMarketing({
    authBootstrapped: true,
    loading: false,
    user: { uid: 'abc' },
  }),
  false,
  'signed-in users stay in the app',
);

assert.equal(
  shouldRedirectStartUrlToMarketing({
    authBootstrapped: true,
    loading: false,
    user: null,
    oauthReturn: true,
  }),
  false,
  'oauth returns must not bounce to marketing',
);

assert.equal(
  shouldRedirectStartUrlToMarketing({
    authBootstrapped: true,
    loading: false,
    user: null,
    justRegisteredEmail: 'a@b.c',
  }),
  false,
);

assert.equal(
  shouldRedirectStartUrlToMarketing({
    authBootstrapped: true,
    loading: false,
    user: null,
  }),
  true,
  'truly logged-out /hjem may go to marketing',
);

import { shouldHoldFamilyBootSpinner } from './authBootGate.js';

assert.equal(shouldHoldFamilyBootSpinner({ bootTimedOut: false }), true);
assert.equal(
  shouldHoldFamilyBootSpinner({ bootTimedOut: true }),
  false,
  'a shell that is still being created must not keep the spinner',
);

console.log('authBootGate tests ok');
