import assert from 'node:assert/strict';
import {
  controlMeasureGaps,
  controlMeasuresSummary,
  normalizeControlMeasures,
} from './controlMeasures.js';

{
  const norm = normalizeControlMeasures({});
  assert.equal(norm.measures.usage.retentionDays, 90);
  assert.equal(norm.measures.usage.enabled, true);
  const gaps = controlMeasureGaps(norm.measures.usage, { today: '2026-11-03' });
  assert.equal(gaps.length, 3);
  const done = { ...norm.measures.usage, justification: 'Sikkerhet', discussedAt: '2026-01-10', informedAt: '2026-01-15' };
  assert.deepEqual(controlMeasureGaps(done, { today: '2026-11-03' }), []);
  assert.ok(controlMeasureGaps(done, { today: '2027-02-01' }).some((g) => /evaluert/.test(g)));
  assert.deepEqual(controlMeasureGaps({ ...done, evaluatedAt: '2027-01-20' }, { today: '2027-02-01' }), []);
  assert.deepEqual(controlMeasureGaps({ enabled: false }), []);
}

{
  const summary = controlMeasuresSummary({ measures: { productivity: { enabled: false } } }, { today: '2026-11-03' });
  assert.equal(summary.rows.length, 3);
  assert.equal(summary.open, 2);
  // Lagringstiden følger bruksloggen i companyPrivacy og kan ikke overstyres her.
  assert.equal(normalizeControlMeasures({ measures: { usage: { retentionDays: 5 } } }).measures.usage.retentionDays, 90);
}

console.log('controlMeasures ok');
