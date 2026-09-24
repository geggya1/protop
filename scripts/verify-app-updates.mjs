#!/usr/bin/env node
/**
 * Unit checks for day-level changelog + major-only notify rules.
 */
import assert from 'assert';
import {
  formatMajorVersion,
  formatUpdateDate,
  getAppMajor,
  groupUpdatesByDay,
  latestMajorUpdateForVersion,
  localizeUpdates,
  majorNotifyDecision,
  parseSemver,
} from '../src/utils/appUpdatesLogic.js';

const T = (nb, en) => ({ nb, en });
const SAMPLE = [
  {
    id: 'fix-a',
    date: '2026-09-16',
    level: 'fix',
    title: T('Fiks A', 'Fix A'),
    summary: T('Kort', 'Short'),
  },
  {
    id: 'fix-b',
    date: '2026-09-16',
    level: 'fix',
    title: T('Fiks B', 'Fix B'),
    summary: T('Kort', 'Short'),
  },
  {
    id: 'major-3',
    date: '2026-09-01',
    level: 'major',
    version: '3.0.0',
    title: T('V3', 'V3'),
    summary: T('Ny modul', 'New module'),
  },
  {
    id: 'major-2',
    date: '2026-08-01',
    level: 'major',
    version: '2.0.0',
    title: T('V2', 'V2'),
    summary: T('Basis', 'Base'),
  },
];

assert.deepStrictEqual(parseSemver('3.0.0'), { major: 3, minor: 0, patch: 0, raw: '3.0.0' });
assert.strictEqual(getAppMajor('2.0.0'), 2);
assert.strictEqual(formatMajorVersion(4), '4.0.0');

assert.strictEqual(majorNotifyDecision(null, 2), 'seed');
assert.strictEqual(majorNotifyDecision(2, 2), 'none');
assert.strictEqual(majorNotifyDecision(2, 3), 'notify');
assert.strictEqual(majorNotifyDecision(3, 2), 'none');
assert.strictEqual(majorNotifyDecision(undefined, 0), 'none');

const groups = groupUpdatesByDay(SAMPLE.slice(0, 2));
assert.strictEqual(groups.length, 1);
assert.strictEqual(groups[0].date, '2026-09-16');
assert.strictEqual(groups[0].items.length, 2);

const listed = localizeUpdates(SAMPLE, { lang: 'nb', level: 'fix' });
assert.strictEqual(listed.length, 2);
assert.ok(!listed.some((x) => x.level === 'major'));
assert.ok(!/\d{1,2}:\d{2}/.test(formatUpdateDate('2026-09-16', 'nb')), 'date must be day-level, no clock');

assert.strictEqual(latestMajorUpdateForVersion(SAMPLE, '3.0.0')?.version, '3.0.0');
assert.strictEqual(latestMajorUpdateForVersion(SAMPLE, '2.0.0')?.version, '2.0.0');

console.log('verify-app-updates: ok');
