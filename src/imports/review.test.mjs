import assert from 'node:assert/strict';
import { employeeReviewSeverity, importResult, issueTally, reviewHeadline, reviewSections } from './review.js';

assert.equal(employeeReviewSeverity({ action: 'skip', reason: 'Mangler navn' }), 'block');
assert.equal(employeeReviewSeverity({ action: 'create', employee: {}, warnings: ['E-post er ikke gyldig og ble ikke importert.'] }), 'review');
assert.equal(employeeReviewSeverity({ action: 'update', employee: {}, warnings: [] }), 'existing');
assert.equal(employeeReviewSeverity({ action: 'create', employee: {}, matchKind: 'email', warnings: [] }), 'existing');
assert.equal(employeeReviewSeverity({ action: 'create', employee: {}, warnings: [] }), 'ok');

assert.equal(reviewHeadline([
  { severity: 'ok' },
  { severity: 'existing' },
  { severity: 'review' },
  { severity: 'block' },
]), '1 klare · 1 finnes fra før · 1 må kontrolleres · 1 blir ikke importert');

assert.deepEqual(reviewSections([
  { severity: 'ok', id: '1' },
  { severity: 'existing', id: '2' },
]).map(([id, title, rows]) => [id, title, rows.length]), [
  ['existing', 'Finnes fra før', 1],
  ['ok', 'Klare', 1],
]);

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