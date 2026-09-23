import assert from 'node:assert/strict';
import {
  parseTimeToMinutes,
  minutesToTime,
  snapMinutes,
  isAllDayEvent,
  layoutTimedEvents,
  visibleHourRange,
  calendarIdOf,
  memberLayerId,
  formatWeekRangeNo,
  isCalendarLayerHidden,
  icsHostFromUrl,
  icsDisplayLabel,
  icsSidebarLabel,
  hexToRgba,
  contrastingTextColor,
  calendarEventSurface,
} from './timeGrid.js';

assert.equal(parseTimeToMinutes('09:30'), 9 * 60 + 30);
assert.equal(parseTimeToMinutes('9:05'), 9 * 60 + 5);
assert.equal(parseTimeToMinutes('08.25'), 8 * 60 + 25);
assert.equal(parseTimeToMinutes(''), null);
assert.equal(parseTimeToMinutes('hele'), null);
assert.equal(minutesToTime(0), '00:00');
assert.equal(minutesToTime(10 * 60 + 30), '10:30');
assert.equal(snapMinutes(10 * 60 + 14), 10 * 60);
assert.equal(snapMinutes(10 * 60 + 20), 10 * 60 + 30);
assert.equal(isAllDayEvent({ title: 'Bursdag' }), true);
assert.equal(isAllDayEvent({ startTime: '10:00' }), false);

const a = { id: 'a', startTime: '10:00', endTime: '11:00' };
const b = { id: 'b', startTime: '10:30', endTime: '12:00' };
const c = { id: 'c', startTime: '13:00', endTime: '14:00' };
const laid = layoutTimedEvents([c, b, a]);
assert.equal(laid.length, 3);
const la = laid.find((x) => x.event.id === 'a');
const lb = laid.find((x) => x.event.id === 'b');
const lc = laid.find((x) => x.event.id === 'c');
assert.equal(la.colCount, 2);
assert.equal(lb.colCount, 2);
assert.notEqual(la.col, lb.col);
assert.equal(lc.colCount, 1);
assert.equal(lc.col, 0);

const range = visibleHourRange([a, { startTime: '06:15', endTime: '06:45' }]);
assert.equal(range.startHour, 6);
assert.equal(range.endHour, 21);

assert.equal(calendarIdOf({ familyId: 'f1' }, 'f1'), 'fam:f1');
assert.equal(calendarIdOf({ private: true, sourceLabel: 'Google' }, 'f1'), 'ext:Google');
assert.equal(calendarIdOf({ connectionId: 'c9', private: true }, 'f1'), 'ext:c9:primary');
assert.equal(calendarIdOf({ connectionId: 'c9', graphCalendarId: 'calA', private: true }, 'f1'), 'ext:c9:calA');
assert.equal(isCalendarLayerHidden({ connectionId: 'c9' }, new Set(), 'f1'), false);
assert.equal(isCalendarLayerHidden({ connectionId: 'c9', graphCalendarId: 'calA' }, new Set(['ext:c9']), 'f1'), true);
assert.equal(isCalendarLayerHidden({ connectionId: 'c9', graphCalendarId: 'calA' }, new Set(['ext:c9:calA']), 'f1'), true);
assert.equal(isCalendarLayerHidden({ connectionId: 'c9', graphCalendarId: 'calA' }, new Set(['ext:other']), 'f1'), false);
assert.equal(calendarIdOf({ crossPlatform: true, familyId: 'p2', sourceLabel: 'Klubb' }, 'f1'), 'plat:p2');

assert.equal(memberLayerId('u1'), 'mem:u1');
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', memberIds: ['a'] }, new Set(['mem:a']), 'f1'),
  true,
);
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', memberIds: ['a', 'b'] }, new Set(['mem:a']), 'f1'),
  false,
);
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', memberIds: ['a', 'b'] }, new Set(['mem:a', 'mem:b']), 'f1'),
  true,
);
assert.equal(
  isCalendarLayerHidden({ familyId: 'f1', audience: 'family' }, new Set(['mem:a']), 'f1'),
  false,
);

const week = [
  new Date(2026, 7, 24),
  new Date(2026, 7, 25),
  new Date(2026, 7, 26),
  new Date(2026, 7, 27),
  new Date(2026, 7, 28),
  new Date(2026, 7, 29),
  new Date(2026, 7, 30),
];
const months = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
];
assert.equal(formatWeekRangeNo(week, months), '24 - 30. august 2026');

assert.equal(icsHostFromUrl('https://outlook.office365.com/owa/calendar/abc/calendar.ics'), 'outlook.office365.com');
assert.equal(icsDisplayLabel({ label: 'ICS', icsHost: 'outlook.office365.com' }), 'ICS · outlook.office365.com');
assert.equal(icsDisplayLabel({ label: 'Jobb', icsHost: 'outlook.office365.com' }), 'Jobb');
assert.equal(
  icsSidebarLabel(
    { id: 'a', label: 'ICS', icsHost: 'outlook.office365.com', lastSyncCount: 73 },
    [{ id: 'b', label: 'ICS', icsHost: 'outlook.office365.com', lastSyncCount: 2 }],
  ),
  'ICS · outlook.office365.com · 73',
);
assert.equal(
  icsSidebarLabel(
    { id: 'a', label: 'ICS', icsHost: 'outlook.office365.com' },
    [{ id: 'c', label: 'Jobb', icsHost: 'calendar.google.com' }],
  ),
  'ICS · outlook.office365.com',
);

assert.equal(hexToRgba('#0078d4', 0.5), 'rgba(0, 120, 212, 0.5)');
assert.equal(hexToRgba('not-a-color', 1), 'rgba(37, 99, 235, 1)');
assert.equal(contrastingTextColor('#0078d4'), '#ffffff');
assert.equal(contrastingTextColor('#2563eb'), '#ffffff');
assert.equal(contrastingTextColor('#fde68a'), '#0f172a');
assert.equal(contrastingTextColor('#ffffff'), '#0f172a');

const outlookBlue = calendarEventSurface('#0078d4');
assert.match(outlookBlue.bg, /^#[0-9a-f]{6}$/);
assert.equal(outlookBlue.ink, '#1a2744');
assert.match(outlookBlue.border, /^#[0-9a-f]{6}$/);
assert.notEqual(outlookBlue.bg, outlookBlue.border);
assert.equal(outlookBlue.accent, '#0078d4');

const pale = calendarEventSurface('#fde68a');
assert.equal(pale.ink, '#1a2744');

const fallbackSurface = calendarEventSurface('nope');
assert.equal(fallbackSurface.ink, '#1a2744');

console.log('timeGrid ok');
