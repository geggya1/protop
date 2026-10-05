import assert from 'node:assert/strict';
import { mergeAiFit, scoreNoticeFit, watchSearchTerms } from './matchFit.js';

const watch = {
  cpvCodes: [{ code: '71320000' }],
  keywords: ['prosjektering'],
  profile: {
    description: 'Rådgivende ingeniører innen bygg og samferdsel',
    keywords: ['bro', 'samferdsel'],
  },
};

const strong = scoreNoticeFit({
  title: 'Prosjektering av ny bro',
  description: 'Samferdsel og konstruksjon',
  cpvCodes: ['71322000'],
}, watch);
assert.equal(strong.strong, true);
assert.ok(strong.score >= 6);

const weak = scoreNoticeFit({
  title: 'Kjøp av kontorrekvisita',
  description: 'Papir og penner',
  cpvCodes: ['30190000'],
}, watch);
assert.equal(weak.strong, false);

assert.deepEqual(watchSearchTerms(watch).slice(0, 3), ['prosjektering', 'bro', 'samferdsel']);

const ranked = mergeAiFit(
  [{ id: '2026-1', title: 'Bro' }],
  [{ id: '2026-1', score: 9, reason: 'Treffer rådgivning og samferdsel' }],
);
assert.equal(ranked[0].aiFit.score, 9);
assert.match(ranked[0].aiFit.reason, /samferdsel/);

const fromAi = scoreNoticeFit({
  title: 'Kjøp av kontorrekvisita',
  description: 'Papir',
  cpvCodes: ['30190000'],
  aiFit: { score: 9, reason: 'Treffer kjerneleveransen' },
}, watch);
assert.equal(fromAi.strong, true);
assert.equal(fromAi.score, 9);

console.log('matchFit.test.mjs ok');
