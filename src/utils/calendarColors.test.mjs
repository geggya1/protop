import assert from 'node:assert/strict';
import {
  EXTERNAL_CALENDAR_COLORS,
  FAMILY_CALENDAR_COLOR,
  canonicalCalendarColorId,
  colorForConnection,
  colorForExternalCalendar,
  colorForFamilyEvent,
  withExternalEventColor,
  applyExternalEventColors,
} from './calendarColors.js';

assert.equal(canonicalCalendarColorId('primary'), 'default');
assert.equal(canonicalCalendarColorId('account'), 'default');
assert.equal(canonicalCalendarColorId('default'), 'default');
assert.equal(canonicalCalendarColorId('', true), 'default');
assert.equal(canonicalCalendarColorId('AAMkA-real-id'), 'AAMkA-real-id');
assert.equal(canonicalCalendarColorId('AAMkA-real-id', true), 'default');

const conn = 'consult1-conn';
const parent = colorForConnection(conn, 'microsoft');
assert.equal(colorForExternalCalendar(conn, 'primary', 'microsoft'), parent);
assert.equal(colorForExternalCalendar(conn, 'account', 'microsoft'), parent);
assert.equal(colorForExternalCalendar(conn, 'AAMkA-own', 'microsoft', { isDefault: true }), parent);

const shared = colorForExternalCalendar(conn, 'AAMkA-shared', 'microsoft');
assert.notEqual(shared, parent);

assert.ok(!EXTERNAL_CALENDAR_COLORS.includes('#2563eb'));
assert.ok(!EXTERNAL_CALENDAR_COLORS.includes('#0078d4'));
assert.notEqual(parent, '#2563eb');
assert.notEqual(FAMILY_CALENDAR_COLOR, '#2563eb');

const defaultEv = withExternalEventColor({
  id: '1',
  private: true,
  source: 'microsoft',
  connectionId: conn,
  graphCalendarId: 'AAMkA-own',
  graphCalendarIsDefault: true,
});
assert.equal(defaultEv.color, parent);

const sharedEv = withExternalEventColor({
  id: '2',
  private: true,
  source: 'microsoft',
  connectionId: conn,
  graphCalendarId: 'AAMkA-shared',
});
assert.equal(sharedEv.color, shared);

const fromLayers = applyExternalEventColors(
  [{ id: '3', private: true, source: 'microsoft', connectionId: conn, graphCalendarId: 'AAMkA-own' }],
  [{ connectionId: conn, calendars: [{ id: 'AAMkA-own', isDefault: true }] }],
);
assert.equal(fromLayers[0].color, parent);

const members = [
  { id: 'a', uid: 'a', color: '#111111' },
  { id: 'b', uid: 'b', color: '#222222' },
];
assert.equal(colorForFamilyEvent({ color: '#abc' }, members), '#abc');
assert.equal(colorForFamilyEvent({ memberIds: ['b'] }, members), '#222222');
assert.equal(colorForFamilyEvent({ memberIds: ['missing'] }, members), FAMILY_CALENDAR_COLOR);
assert.equal(colorForFamilyEvent({ audience: 'family' }, members), FAMILY_CALENDAR_COLOR);

console.log('calendarColors ok');
