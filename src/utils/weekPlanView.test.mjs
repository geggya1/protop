import assert from 'node:assert/strict';
import {
  canAdultEditSchedule,
  planDayKeyFromDate,
  defaultPlanDayKey,
  schoolMonday,
  dateForPlanDay,
  formatWeekRange,
  formatDayHeading,
  weekNumberLabel,
  subjectStyle,
  lessonStatus,
  buildDayTimeline,
  schoolDayEnd,
  schoolDayHasPassed,
  resolveWeekProgramFocus,
  remindersForDay,
  statusLabel,
} from './weekPlanView.js';

assert.equal(canAdultEditSchedule({ isParent: true, isChild: false, isActingAsChild: false }), true);
assert.equal(canAdultEditSchedule({ isParent: true, isChild: false, isActingAsChild: true }), true);
assert.equal(canAdultEditSchedule({ isParent: true, isChild: true, isActingAsChild: false }), false);
assert.equal(canAdultEditSchedule({ isParent: false, isChild: true }), false);
assert.equal(canAdultEditSchedule({ isParent: false, isChild: false, isAdmin: true }), true);
assert.equal(canAdultEditSchedule({ isAdmin: true, isChild: true }), false);

assert.equal(planDayKeyFromDate(new Date(2026, 8, 2)), 'wed'); // 2. sep 2026
assert.equal(planDayKeyFromDate(new Date(2026, 8, 5)), null); // lørdag
assert.equal(defaultPlanDayKey(new Date(2026, 8, 5)), 'mon');

const monday = schoolMonday(new Date(2026, 8, 2), 0); // uke med ons 2. sep
assert.equal(monday.getDate(), 31);
assert.equal(monday.getMonth(), 7);
assert.equal(formatWeekRange(monday), '31. aug. – 4. sep.');
assert.equal(formatDayHeading(new Date(2026, 8, 2)), 'Onsdag 2. september');
assert.equal(weekNumberLabel(new Date(2026, 8, 2)), 'Uke 36');
assert.equal(dateForPlanDay(monday, 'wed').getDate(), 2);

assert.equal(subjectStyle('Norsk').icon, 'book-outline');
assert.equal(subjectStyle('Matte').color, '#2563eb');
assert.equal(subjectStyle('Friminutt').kind, 'break');
assert.equal(subjectStyle('Kroppsøving').icon, 'walk-outline');

const slot = { time: '08:15', endTime: '09:00', subject: 'Norsk' };
assert.equal(lessonStatus(slot, { viewingToday: false, nowMin: 8 * 60 + 30 }), 'upcoming');
assert.equal(lessonStatus(slot, { viewingToday: true, nowMin: 9 * 60 + 10 }), 'done');
assert.equal(lessonStatus(slot, { viewingToday: true, nowMin: 8 * 60 + 30 }), 'now');
assert.equal(lessonStatus(slot, { viewingToday: true, nowMin: 7 * 60 }), 'upcoming');

const timetable = {
  wed: [
    { time: '08:15', endTime: '09:00', subject: 'Norsk' },
    { time: '09:15', endTime: '10:00', subject: 'Matte' },
    { time: '10:00', endTime: '10:15', subject: 'Friminutt' },
    { time: '11:30', endTime: '12:15', subject: 'Kroppsøving' },
  ],
};

const timeline = buildDayTimeline(timetable, 'wed', {
  now: new Date(2026, 8, 2, 9, 20),
  viewingToday: true,
});
assert.equal(timeline[0].status, 'done');
assert.equal(timeline[1].status, 'now');
assert.equal(timeline[1].title, 'Matte');
assert.equal(timeline[2].isBreak, true);
assert.equal(schoolDayEnd(timetable, 'wed'), '12:15');

const reminders = remindersForDay(timetable, 'wed');
assert.ok(reminders.some((r) => r.label === 'Gymtøy'));
assert.ok(reminders.some((r) => r.label === 'Drikkeflaske'));

assert.equal(statusLabel('next'), 'Neste time');
assert.equal(statusLabel('done'), 'Ferdig');
assert.equal(statusLabel('upcoming'), null);

const nextTimeline = buildDayTimeline(timetable, 'wed', {
  now: new Date(2026, 8, 2, 9, 5),
  viewingToday: true,
});
assert.equal(nextTimeline[1].status, 'next');

assert.equal(schoolDayHasPassed(timetable, 'wed', new Date(2026, 8, 2, 12, 14)), false);
assert.equal(schoolDayHasPassed(timetable, 'wed', new Date(2026, 8, 2, 12, 15)), true);

const duringDay = resolveWeekProgramFocus(timetable, new Date(2026, 8, 2, 9, 20));
assert.equal(duringDay.dayKey, 'wed');
assert.equal(duringDay.reason, 'today');
assert.equal(duringDay.programTitle, 'Dagens program');
assert.ok(duringDay.lessons.some((l) => l.title === 'Matte'));
assert.equal(duringDay.weekDays.find((d) => d.id === 'wed')?.active, true);

const afterSchool = resolveWeekProgramFocus({
  ...timetable,
  thu: [
    { time: '08:15', endTime: '09:00', subject: 'Engelsk' },
    { time: '09:15', endTime: '10:00', subject: 'Norsk' },
  ],
}, new Date(2026, 8, 2, 14, 0));
assert.equal(afterSchool.dayKey, 'thu');
assert.equal(afterSchool.reason, 'passed');
assert.equal(afterSchool.programTitle, 'I morgen');
assert.equal(afterSchool.lessons[0].title, 'Engelsk');

const weekend = resolveWeekProgramFocus({
  mon: [{ time: '08:15', endTime: '09:00', subject: 'Matte' }],
}, new Date(2026, 8, 5, 10, 0)); // lørdag
assert.equal(weekend.dayKey, 'mon');
assert.equal(weekend.reason, 'weekend');
assert.equal(weekend.lessons[0].title, 'Matte');

console.log('weekPlanView.test.mjs ok');
