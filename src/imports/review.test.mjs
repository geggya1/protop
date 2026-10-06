import assert from 'node:assert/strict';
import { employeeReviewSeverity, importResult, issueTally, reviewHeadline } from './review.js';

assert.equal(employeeReviewSeverity({ action: 'skip', reason: 'Mangler navn' }), 'block');
assert.equal(employeeReviewSeverity({ action: 'create', employee: {}, warnings: ['E-post er ikke gyldig og ble ikke importert.'] }), 'review');
assert.equal(employeeReviewSeverity({ action: 'update', employee: {}, warnings: [] }), 'ok');

assert.equal(reviewHeadline([
  { severity: 'ok' },
  { severity: 'review' },
  { severity: 'block' },
]), '1 klare · 1 må kontrolleres · 1 blir ikke importert');

const clean = importResult([{ name: 'Ada', issues: [] }], []);
assert.equal(clean.complete, true);
assert.equal(clean.saved, 1);

const partial = importResult(
  [{ name: 'Ada', issues: ['Mangler adresse.'] }],
  [{ name: 'Ola', reason: 'Mangler navn.' }],
);
assert.equal(partial.complete, false);
assert.equal(partial.saved, 1);
assert.equal(partial.total, 2);
assert.equal(partial.missed[0].name, 'Ola');
assert.equal(partial.attention[0].name, 'Ada');
assert.deepEqual(issueTally([
  { issues: ['Mangler adresse.', 'Mangler navn.'] },
  { issues: ['Mangler adresse.'] },
]), [['Mangler adresse.', 2], ['Mangler navn.', 1]]);

console.log('review.test.mjs: ok');