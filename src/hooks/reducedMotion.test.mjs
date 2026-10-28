import assert from 'node:assert/strict';
import {
  REDUCED_MOTION_QUERY, autoLoopIterations, prefersReducedMotion, watchReducedMotion,
} from './reducedMotion.js';

function fakeWindow(matches, { legacy = false } = {}) {
  const listeners = new Set();
  const query = {
    matches,
    ...(legacy
      ? { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) }
      : {
        addEventListener: (_type, fn) => listeners.add(fn),
        removeEventListener: (_type, fn) => listeners.delete(fn),
      }),
  };
  return {
    listeners,
    query,
    matchMedia(text) {
      assert.equal(text, REDUCED_MOTION_QUERY);
      return query;
    },
  };
}

assert.equal(prefersReducedMotion(fakeWindow(true)), true);
assert.equal(prefersReducedMotion(fakeWindow(false)), false);
assert.equal(prefersReducedMotion({}), false);
assert.equal(prefersReducedMotion({ matchMedia: () => { throw new Error('nei'); } }), false);

for (const legacy of [false, true]) {
  const win = fakeWindow(false, { legacy });
  const seen = [];
  const stop = watchReducedMotion((value) => seen.push(value), win);
  win.query.matches = true;
  win.listeners.forEach((fn) => fn());
  assert.deepEqual(seen, [true]);
  stop();
  assert.equal(win.listeners.size, 0);
}

// Hjelpeknappen: pulsen (1,4 s) går tre ganger, «bob» (3,6 s) én gang. Begge under 5 sekunder.
assert.equal(autoLoopIterations(1400), 3);
assert.ok(autoLoopIterations(1400) * 1400 < 5000);
assert.equal(autoLoopIterations(3600), 1);
assert.equal(autoLoopIterations(1400, { reduced: true }), 0);
assert.equal(autoLoopIterations(0), 0);

console.log('reducedMotion.test.mjs: ok');
