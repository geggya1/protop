import assert from 'node:assert/strict';
import {
  calendarPaneTaskOnDate,
  calendarPaneTasksForDate,
  calendarPaneChoresForDate,
  buildCalendarPaneItems,
} from './calendarTaskPane.js';

const today = new Date(2026, 7, 28); // fri 28. aug
const monday = new Date(2026, 7, 24);
const friday = today;
const yesterday = new Date(2026, 7, 27);
const lastFriday = new Date(2026, 7, 21);

const dueFriday = {
  id: 'a',
  active: true,
  title: 'NRA rentals report',
  deadline: '2026-08-28',
  done: false,
  completedDates: [],
  assignedTo: 'family',
};

const overdueThu = {
  id: 'b',
  active: true,
  title: 'Lederrollesjekk',
  deadline: '2026-08-27',
  done: false,
  completedDates: [],
  assignedTo: 'family',
};

const dueNextWeek = {
  id: 'c',
  active: true,
  title: 'Neste uke',
  deadline: '2026-09-02',
  done: false,
  completedDates: [],
  assignedTo: 'family',
};

const noDeadline = {
  id: 'd',
  active: true,
  title: 'Åpen',
  done: false,
  completedDates: [],
  assignedTo: 'family',
};

const done = {
  ...dueFriday,
  id: 'e',
  done: true,
  completedDates: ['2026-08-28'],
};

assert.equal(calendarPaneTaskOnDate(dueFriday, friday, today), true);
assert.equal(calendarPaneTaskOnDate(dueFriday, monday, today), false);

assert.equal(calendarPaneTaskOnDate(overdueThu, friday, today), true, 'overdue on today');
assert.equal(calendarPaneTaskOnDate(overdueThu, yesterday, today), true, 'overdue stays on due date');
assert.equal(calendarPaneTaskOnDate(overdueThu, monday, today), false);

assert.equal(calendarPaneTaskOnDate(dueNextWeek, friday, today), false);
assert.equal(calendarPaneTaskOnDate(noDeadline, friday, today), true);
assert.equal(calendarPaneTaskOnDate(noDeadline, monday, today), false);
assert.equal(calendarPaneTaskOnDate(done, friday, today), false);

assert.equal(calendarPaneTaskOnDate(overdueThu, lastFriday, today), false);

const mine = {
  ...dueFriday,
  id: 'mine',
  assignedTo: 'u1',
  createdBy: 'u1',
};
const viewer = { uid: 'u1', ids: new Set(['u1']), asChild: false };
const otherViewer = { uid: 'u2', ids: new Set(['u2']), asChild: false };

assert.equal(calendarPaneTasksForDate([dueFriday, mine], friday, today, viewer).length, 2);
assert.equal(calendarPaneTasksForDate([dueFriday, mine], friday, today, otherViewer).map((t) => t.id).join(), 'a');

const bedtime = {
  id: 'bed',
  title: 'Leggetid 20:30',
  type: 'daily',
  active: true,
  completedDates: [],
};
const homeworkDone = {
  id: 'hw',
  title: 'Gjøre lekser',
  type: 'daily',
  active: true,
  completedDates: ['2026-08-28'],
};
const adelen = { id: 'kid-a', name: 'Adelen' };
const kidsTodosById = { 'kid-a': [bedtime, homeworkDone] };

assert.equal(calendarPaneChoresForDate([bedtime, homeworkDone], friday).map((t) => t.id).join(), 'bed');

const adultItems = buildCalendarPaneItems({
  date: friday,
  parentTodos: [dueFriday, mine],
  kids: [adelen],
  kidsTodosById,
  viewer,
  refToday: today,
});
assert.equal(adultItems.some((i) => i.kind === 'chore'), false, 'adult pane hides kids chores');
assert.deepEqual(adultItems.map((i) => i.kind), ['task', 'task']);
assert.equal(adultItems.every((i) => i.kind === 'task'), true);

const childItems = buildCalendarPaneItems({
  date: friday,
  parentTodos: [dueFriday, mine],
  kids: [adelen],
  kidsTodosById,
  viewer: { uid: 'kid-a', ids: new Set(['kid-a']), asChild: true },
  refToday: today,
});
assert.equal(childItems.some((i) => i.kind === 'task'), false, 'child pane hides adult tasks');
assert.equal(childItems.length, 1);
assert.equal(childItems[0].kind, 'chore');
assert.equal(childItems[0].title, 'Leggetid 20:30');
assert.equal(childItems[0].childId, 'kid-a');

const recurringFri = {
  id: 'r1',
  active: true,
  title: 'Bytt batteri',
  type: 'task',
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 1,
  recurrenceByDays: [5],
  startKey: '2026-08-17',
  completedDates: [],
  assignedTo: 'family',
};
assert.equal(calendarPaneTaskOnDate(recurringFri, friday, today), true);
assert.equal(calendarPaneTaskOnDate(recurringFri, monday, today), false);
assert.equal(calendarPaneTaskOnDate(recurringFri, yesterday, today), false, 'torsdag er ikke hendelse');
const prevFriday = new Date(2026, 7, 21);
assert.equal(calendarPaneTaskOnDate(recurringFri, prevFriday, today), true);

const recurringDoneToday = {
  ...recurringFri,
  id: 'r2',
  completedDates: ['2026-08-28'],
};
assert.equal(calendarPaneTaskOnDate(recurringDoneToday, friday, today), false, 'kvittert i dag skjules');

console.log('calendarTaskPane.test.mjs ok');
