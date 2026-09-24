import assert from 'node:assert/strict';
import {
  appearanceSummary,
  isDarkScheduled,
  normalizeAppearancePrefs,
  resolveAppearanceScheme,
} from './resolveAppearance.js';

const at = (h, m) => new Date(2026, 8, 21, h, m, 0);

assert.equal(resolveAppearanceScheme({ automatic: false, manual: 'dark' }, { systemScheme: 'light', now: at(12, 0) }), 'dark');
assert.equal(resolveAppearanceScheme({ automatic: false, manual: 'light' }, { systemScheme: 'dark', now: at(12, 0) }), 'light');
assert.equal(resolveAppearanceScheme({ automatic: true, schedule: 'system' }, { systemScheme: 'dark', now: at(15, 0) }), 'dark');
assert.equal(resolveAppearanceScheme({ automatic: true, schedule: 'system', manual: 'dark' }, { systemScheme: 'light', now: at(15, 0) }), 'light');

const clock = { automatic: true, schedule: 'clock', darkAt: '22:00', lightAt: '09:00' };
assert.equal(resolveAppearanceScheme(clock, { now: at(23, 30) }), 'dark');
assert.equal(resolveAppearanceScheme(clock, { now: at(8, 59) }), 'dark');
assert.equal(resolveAppearanceScheme(clock, { now: at(9, 0) }), 'light');
assert.equal(resolveAppearanceScheme(clock, { now: at(21, 59) }), 'light');
assert.equal(resolveAppearanceScheme(clock, { now: at(22, 0) }), 'dark');

assert.equal(isDarkScheduled(at(12, 0), '08:00', '16:00'), true);
assert.equal(isDarkScheduled(at(16, 0), '08:00', '16:00'), false);
assert.equal(isDarkScheduled(at(7, 0), '08:00', '16:00'), false);

assert.deepEqual(
  appearanceSummary(clock, { now: at(7, 0), systemScheme: 'light' }),
  { key: 'darkUntil', time: '09:00', scheme: 'dark' },
);
assert.deepEqual(
  appearanceSummary(clock, { now: at(10, 0), systemScheme: 'dark' }),
  { key: 'lightUntil', time: '22:00', scheme: 'light' },
);
assert.equal(appearanceSummary({ automatic: true, schedule: 'system' }, { systemScheme: 'dark', now: at(12, 0) }).key, 'system');

const dirty = normalizeAppearancePrefs({ automatic: 'yes', manual: 'nope', lightAt: '9:5', darkAt: '25:00', schedule: 'clock' });
assert.equal(dirty.automatic, false);
assert.equal(dirty.manual, 'light');
assert.equal(dirty.lightAt, '09:00');
assert.equal(dirty.darkAt, '22:00');
assert.equal(dirty.schedule, 'clock');

console.log('resolveAppearance.test.mjs ok');
