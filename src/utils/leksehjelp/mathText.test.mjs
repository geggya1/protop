import assert from 'node:assert/strict';
import {
  tokenizeMath, mathToPlain, splitProseAndMath,
} from './mathText.js';
import {
  canRequestFasit, fasitLockedReason, PEDAGOGY,
} from './pedagogy.js';

const tokens = tokenizeMath('5^2 = 25');
assert.ok(tokens.some((t) => t.type === 'sup' && t.value === '2'));
assert.match(mathToPlain('5^2'), /5²|5\^2/);

const frac = tokenizeMath('1/2 + 1/4');
assert.ok(frac.some((t) => t.type === 'frac' && t.num === '1' && t.den === '2'));

const parts = splitProseAndMath('Regn 324 × 9 og også 5^2 takk');
assert.ok(parts.some((p) => p.kind === 'math' && /324/.test(p.text)));
assert.ok(parts.some((p) => p.kind === 'math' && /5\^2/.test(p.text)));

assert.equal(canRequestFasit({ allowFasit: false, attemptCount: 5, hintLevel: 3 }), false);
assert.equal(canRequestFasit({ allowFasit: true, attemptCount: 0, hintLevel: 0 }), false);
assert.equal(canRequestFasit({
  allowFasit: true,
  attemptCount: PEDAGOGY.minAttemptsBeforeFasit,
  hintLevel: 0,
}), true);
assert.equal(canRequestFasit({ allowFasit: true, attemptCount: 0, hintLevel: 2 }), true);
assert.match(fasitLockedReason({ allowFasit: true, attemptCount: 0, hintLevel: 0 }), /Prøv/);

console.log('leksehjelp.mathText.test.mjs ok');
