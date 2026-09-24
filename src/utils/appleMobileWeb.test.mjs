import assert from 'node:assert/strict';
import { detectAppleMobileWeb } from './appleMobileWeb.js';

assert.equal(
  detectAppleMobileWeb({ ua: 'Mozilla/5.0 (iPad; CPU OS 17_0)', platform: 'iPad', maxTouchPoints: 5 }),
  true,
);
assert.equal(
  detectAppleMobileWeb({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', platform: 'iPhone', maxTouchPoints: 5 }),
  true,
);
assert.equal(
  detectAppleMobileWeb({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 5 }),
  true,
);
assert.equal(
  detectAppleMobileWeb({ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', platform: 'MacIntel', maxTouchPoints: 0 }),
  false,
);
assert.equal(
  detectAppleMobileWeb({ ua: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 }),
  false,
);

console.log('appleMobileWeb.test.mjs: ok');
