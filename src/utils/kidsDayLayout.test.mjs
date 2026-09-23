import assert from 'node:assert/strict';
import {
  KIDS_GAP,
  KIDS_PEEK,
  KIDS_VISIBLE,
  kidsDayCardWidth,
  kidsDayFitsViewport,
} from './kidsDayLayout.js';

assert.equal(KIDS_VISIBLE, 3);

assert.equal(kidsDayFitsViewport(0), false);
assert.equal(kidsDayFitsViewport(1), true);
assert.equal(kidsDayFitsViewport(3), true);
assert.equal(kidsDayFitsViewport(4), false);

assert.equal(kidsDayCardWidth(0, 3), undefined);
assert.equal(kidsDayCardWidth(300, 0), undefined);

// Three kids: equal thirds of available width, no peek.
assert.equal(
  kidsDayCardWidth(318, 3),
  Math.floor((318 - KIDS_GAP * 2) / 3),
);

// Two kids: half each, no peek.
assert.equal(
  kidsDayCardWidth(300, 2),
  Math.floor((300 - KIDS_GAP) / 2),
);

// Four kids: size as if three visible + peek so the fourth is reachable by scroll.
assert.equal(
  kidsDayCardWidth(340, 4),
  Math.floor((340 - KIDS_GAP * 2 - KIDS_PEEK) / 3),
);

// Sum of three fitted cards + gaps must not exceed viewport.
{
  const vw = 360;
  const w = kidsDayCardWidth(vw, 3);
  assert.ok(w * 3 + KIDS_GAP * 2 <= vw);
}

console.log('kidsDayLayout.test.mjs: ok');
