import assert from 'node:assert/strict';
import {
  CAL_PAD_DAYS,
  eventOverlapsRange,
  padCalendarFetchRange,
  peekExternalCalendarCache,
  putExternalCalendarCache,
  resetExternalCalendarCacheMemory,
  sliceExternalEvents,
} from './externalCalendarCache.js';

resetExternalCalendarCacheMemory();

const week = padCalendarFetchRange('2026-09-16', '2026-09-17');
assert.equal(week.start, '2026-09-14');
assert.equal(week.end, '2026-10-11');
assert.equal(CAL_PAD_DAYS, 28);

const alreadyWide = padCalendarFetchRange('2026-08-31', '2026-10-04');
assert.equal(alreadyWide.start, '2026-08-31');
assert.equal(alreadyWide.end, '2026-10-04');

assert.equal(eventOverlapsRange({ dateKey: '2026-09-16' }, '2026-09-14', '2026-09-20'), true);
assert.equal(eventOverlapsRange({ dateKey: '2026-09-10', endDateKey: '2026-09-16' }, '2026-09-14', '2026-09-20'), true);
assert.equal(eventOverlapsRange({ dateKey: '2026-09-01' }, '2026-09-14', '2026-09-20'), false);

const sliced = sliceExternalEvents([
  { id: 'a', dateKey: '2026-09-16' },
  { id: 'b', dateKey: '2026-09-22' },
], '2026-09-14', '2026-09-20');
assert.deepEqual(sliced.map((e) => e.id), ['a']);

putExternalCalendarCache('u1', week.start, week.end, {
  events: [
    { id: 'mon', dateKey: '2026-09-14', startTime: '09:00', title: 'A' },
    { id: 'wed', dateKey: '2026-09-16', startTime: '12:00', title: 'B' },
  ],
  layers: [{ connectionId: 'c1' }],
});

const today = peekExternalCalendarCache('u1', '2026-09-16', '2026-09-17');
assert.ok(today);
assert.equal(today.stale, false);
assert.equal(today.partial, false);
assert.deepEqual(today.events.map((e) => e.id), ['wed']);

const plan = peekExternalCalendarCache('u1', '2026-09-14', '2026-09-20');
assert.equal(plan.partial, false);
assert.equal(plan.events.length, 2);

const outside = peekExternalCalendarCache('u1', '2026-11-01', '2026-11-07');
assert.equal(outside, null);

putExternalCalendarCache('u1', '2026-09-21', '2026-09-21', {
  events: [{ id: 'next', dateKey: '2026-09-21', startTime: '08:00', title: 'C' }],
  layers: [{ connectionId: 'c1' }],
});
const merged = peekExternalCalendarCache('u1', '2026-09-14', '2026-09-21');
assert.equal(merged.events.length, 3);
assert.ok(merged.events.some((e) => e.id === 'mon'));
assert.ok(merged.events.some((e) => e.id === 'next'));

resetExternalCalendarCacheMemory();
console.log('externalCalendarCache.test.mjs: ok');
