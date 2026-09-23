import assert from 'node:assert/strict';
import {
  defaultSlotEndTime,
  slotTimeRange,
  formatSlotRange,
  timetableToGridEvents,
  timetableHasLessons,
  upsertTimetableSlot,
  emptyWeekTimetable,
  isScheduleBreak,
  layoutWeekPlanDay,
  filledDaySlots,
} from './weekPlanGrid.js';

assert.equal(defaultSlotEndTime('08:00'), '08:45');
assert.equal(defaultSlotEndTime('09:30', 60), '10:30');

assert.equal(isScheduleBreak('Friminutt'), true);
assert.equal(isScheduleBreak('Spising'), true);
assert.equal(isScheduleBreak('Norsk'), false);

assert.deepEqual(slotTimeRange({ time: '10:00', endTime: '10:40' }), {
  start: '10:00',
  end: '10:40',
});
assert.deepEqual(slotTimeRange({ time: '09:55', subject: 'Friminutt' }), {
  start: '09:55',
  end: '10:10',
});
assert.deepEqual(slotTimeRange({ time: '11:00', subject: 'Spising' }), {
  start: '11:00',
  end: '11:25',
});
assert.equal(formatSlotRange({ time: '10:00', endTime: '10:40' }), '10:00–10:40');
assert.equal(formatSlotRange({ time: '08:15' }), '08:15–09:00');
assert.equal(formatSlotRange({ time: '09:55', subject: 'Friminutt' }), '09:55–10:10');

const overlapDay = layoutWeekPlanDay([
  { id: 'l1', title: 'Matte', startTime: '10:10', endTime: '11:00' },
  { id: 'b1', title: 'Friminutt', startTime: '11:00', endTime: '11:15' },
  { id: 'l2', title: 'Engelsk', startTime: '11:50', endTime: '12:50' },
]);
const friminutt = overlapDay.find((l) => l.event.title === 'Friminutt');
assert.ok(friminutt?.isBreak, 'friminutt markeres som pause');
assert.equal(friminutt.col, 0);
assert.equal(friminutt.colCount, 1);

const empty = emptyWeekTimetable();
assert.equal(timetableHasLessons(empty), false);
assert.equal(empty.mon[0].endTime, '08:45');

const filled = upsertTimetableSlot(empty, 'tue', {
  time: '09:00',
  endTime: '09:45',
  subject: 'Norsk',
});
assert.equal(timetableHasLessons(filled), true);
const events = timetableToGridEvents(filled);
assert.equal(events.length, 1);
assert.equal(events[0].day, 'tue');
assert.equal(events[0].title, 'Norsk');
assert.equal(events[0].startTime, '09:00');
assert.equal(events[0].endTime, '09:45');

// Malformed day values must not crash the ukeplan screen
assert.deepEqual(filledDaySlots({ mon: 'bad' }, 'mon'), []);
assert.deepEqual(filledDaySlots({ mon: null }, 'mon'), []);
assert.equal(timetableHasLessons({ mon: { subject: 'Norsk' } }), false);

console.log('weekPlanGrid.test.mjs ok');
