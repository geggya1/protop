import assert from 'node:assert/strict';
import { overlayDismissAllowedAt, OVERLAY_DISMISS_GUARD_MS } from './overlayDismissGuard.js';

assert.equal(OVERLAY_DISMISS_GUARD_MS >= 300, true, 'guard must outlast the opening click');
assert.equal(overlayDismissAllowedAt(1000, 1000), false, 'same-tick click must not dismiss');
assert.equal(overlayDismissAllowedAt(1000, 1000 + OVERLAY_DISMISS_GUARD_MS - 1), false);
assert.equal(overlayDismissAllowedAt(1000, 1000 + OVERLAY_DISMISS_GUARD_MS), true);
assert.equal(overlayDismissAllowedAt(NaN, 2000), false);
assert.equal(overlayDismissAllowedAt(1000, NaN), false);

console.log('overlayDismissGuard.test.mjs: ok');
