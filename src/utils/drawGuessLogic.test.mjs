import assert from 'node:assert/strict';
import {
  normalizeGuess,
  guessesMatch,
  sanitizeStroke,
  sanitizeStrokes,
  pickDrawWord,
  buildDistractors,
  DRAW_WORDS,
} from './drawGuessLogic.js';

assert.equal(normalizeGuess('  Katt! '), 'katt');
assert.equal(normalizeGuess('Snømann'), 'snømann');
assert.equal(normalizeGuess('is-krem'), 'iskrem');
assert.equal(guessesMatch('KATT', 'katt'), true);
assert.equal(guessesMatch('hund', 'katt'), false);
assert.equal(guessesMatch('', 'katt'), false);

const stroke = sanitizeStroke({
  color: '#dc2626',
  width: 99,
  points: [{ x: -1, y: 0.5 }, { x: 0.4, y: 2 }, { x: 'x', y: 0.2 }],
});
assert.equal(stroke.width, 24);
assert.equal(stroke.points.length, 3);
assert.equal(stroke.points[0].x, 0);
assert.equal(stroke.points[1].y, 1);

assert.deepEqual(sanitizeStrokes(null), []);
assert.equal(sanitizeStroke({ points: [] }), null);

const word = pickDrawWord();
assert.ok(DRAW_WORDS.includes(word));

const opts = buildDistractors('katt', 3);
assert.equal(opts.length, 4);
assert.ok(opts.includes('katt'));
assert.equal(new Set(opts).size, 4);

console.log('drawGuessLogic.test.mjs: ok');
