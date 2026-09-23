import assert from 'node:assert/strict';
import { eventOccursOnDate, eventEndDateKey, eventSpanDays } from './events.js';
import { parseDateKey } from './dates.js';

const weekend = {
  title: 'Tur',
  dateKey: '2026-08-21', // fredag
  endDateKey: '2026-08-23', // søndag
  recurring: false,
};

assert.equal(eventEndDateKey(weekend), '2026-08-23');
assert.equal(eventSpanDays(weekend), 3);

assert.equal(eventOccursOnDate(weekend, parseDateKey('2026-08-20')), false);
assert.equal(eventOccursOnDate(weekend, parseDateKey('2026-08-21')), true);
assert.equal(eventOccursOnDate(weekend, parseDateKey('2026-08-22')), true);
assert.equal(eventOccursOnDate(weekend, parseDateKey('2026-08-23')), true);
assert.equal(eventOccursOnDate(weekend, parseDateKey('2026-08-24')), false);

const single = { dateKey: '2026-08-21', recurring: false };
assert.equal(eventOccursOnDate(single, parseDateKey('2026-08-21')), true);
assert.equal(eventOccursOnDate(single, parseDateKey('2026-08-22')), false);

// Gjentakende flerdagers: hver fredag–søndag
const recurringWeekend = {
  dateKey: '2026-08-21',
  endDateKey: '2026-08-23',
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 1,
  recurrenceByDays: [5], // Friday
};
assert.equal(eventOccursOnDate(recurringWeekend, parseDateKey('2026-08-21')), true);
assert.equal(eventOccursOnDate(recurringWeekend, parseDateKey('2026-08-22')), true);
assert.equal(eventOccursOnDate(recurringWeekend, parseDateKey('2026-08-28')), true); // next Friday
assert.equal(eventOccursOnDate(recurringWeekend, parseDateKey('2026-08-30')), true); // next Sunday
assert.equal(eventOccursOnDate(recurringWeekend, parseDateKey('2026-08-27')), false); // Thursday

console.log('events.dateRange.test.mjs: ok');
