import assert from 'node:assert/strict';
import {
  parseGraphDateTime,
  encodeOutlookCalendarPathId,
  formatInTimeZone,
  graphWindowForDateKeys,
  graphWindowUtcPadded,
  addDaysToDateKey,
  osloOffsetForDateKey,
  graphEventWallClock,
} from './graphDate.js';
import {
  originFromRedirectUri,
  microsoftGrantedCalendarAccess,
  microsoftTokenHeaders,
} from './msOauth.js';

const utcMidnight = parseGraphDateTime(
  { dateTime: '2026-08-25T10:30:00.0000000', timeZone: 'UTC' },
);
assert.ok(utcMidnight instanceof Date);
assert.equal(utcMidnight.toISOString(), '2026-08-25T10:30:00.000Z');

const allDay = parseGraphDateTime(
  { dateTime: '2026-08-25T00:00:00.0000000', timeZone: 'UTC' },
  { allDay: true },
);
assert.equal(allDay.getFullYear(), 2026);
assert.equal(allDay.getMonth(), 7);
assert.equal(allDay.getDate(), 25);

const dateOnly = parseGraphDateTime({ date: '2026-08-26' }, { allDay: true });
assert.equal(dateOnly.getDate(), 26);

assert.equal(parseGraphDateTime(null), null);
assert.equal(parseGraphDateTime({ dateTime: '' }), null);

// 22:30 UTC in August = 00:30 next calendar day in Europe/Oslo (CEST).
const lateUtc = formatInTimeZone(new Date('2026-08-25T22:30:00.000Z'), 'Europe/Oslo');
assert.equal(lateUtc.dateKey, '2026-08-26');
assert.equal(lateUtc.timeStr, '00:30');

const midday = formatInTimeZone(new Date('2026-08-25T10:30:00.000Z'), 'Europe/Oslo');
assert.equal(midday.dateKey, '2026-08-25');
assert.equal(midday.timeStr, '12:30');

assert.equal(addDaysToDateKey('2026-08-25', -1), '2026-08-24');
assert.equal(addDaysToDateKey('2026-08-31', 1), '2026-09-01');

assert.equal(osloOffsetForDateKey('2026-01-15'), '+01:00');
assert.equal(osloOffsetForDateKey('2026-08-25'), '+02:00');

const window = graphWindowForDateKeys('2026-08-24', '2026-08-30');
assert.equal(window.min, '2026-08-24T00:00:00+02:00');
assert.equal(window.max, '2026-08-30T23:59:59+02:00');

const utcPad = graphWindowUtcPadded('2026-08-24', '2026-08-30');
assert.equal(utcPad.min, '2026-08-23T00:00:00.0000000Z');
assert.equal(utcPad.max, '2026-08-31T23:59:59.0000000Z');

assert.equal(originFromRedirectUri('https://protop.no/oauth/calendar'), 'https://protop.no');
assert.equal(originFromRedirectUri('https://www.protop.no/oauth/calendar'), 'https://www.protop.no');
assert.equal(originFromRedirectUri('not-a-url'), 'https://protop.no');
assert.equal(microsoftTokenHeaders('https://protop.no').Origin, 'https://protop.no');
assert.equal(microsoftGrantedCalendarAccess({ scope: 'User.Read Calendars.Read' }), true);
assert.equal(microsoftGrantedCalendarAccess({ scope: 'User.Read' }), false);
assert.equal(microsoftGrantedCalendarAccess({ scope: 'User.Read Calendars.Read.Shared' }), true);
assert.ok(encodeOutlookCalendarPathId('AAMkA==').includes('%3D'));
assert.notEqual(
  encodeOutlookCalendarPathId('AAMkA==', 1),
  encodeOutlookCalendarPathId('AAMkA==', 2),
);

const wall = graphEventWallClock(
  { dateTime: '2026-08-25T10:30:00.0000000', timeZone: 'Europe/Oslo' },
);
assert.equal(wall.dateKey, '2026-08-25');
assert.equal(wall.timeStr, '10:30');

console.log('graphDate ok');
