import assert from 'node:assert/strict';
import {
  parentTaskCreatedKey,
  parentTaskDeadlineKey,
  isParentTaskOpen,
  isParentTaskOverdue,
  parentTaskVisibleOnDate,
} from './parentTasks.js';

const today = new Date(2026, 7, 22); // 22. aug 2026
const yesterday = new Date(2026, 7, 21);
const twoDaysAgo = new Date(2026, 7, 20);
const lastWeek = new Date(2026, 7, 15);
const tomorrow = new Date(2026, 7, 23);

const overdueOpen = {
  id: '1',
  active: true,
  type: 'task',
  deadline: '2026-08-21',
  createdAt: '2026-08-21T10:00:00',
  done: false,
  completedDates: [],
};

assert.equal(parentTaskCreatedKey(overdueOpen), '2026-08-21');
assert.equal(isParentTaskOpen(overdueOpen), true);
assert.equal(isParentTaskOverdue(overdueOpen, today), true);

assert.equal(parentTaskVisibleOnDate(overdueOpen, today, today), true);
assert.equal(parentTaskVisibleOnDate(overdueOpen, yesterday, today), true);
assert.equal(parentTaskVisibleOnDate(overdueOpen, twoDaysAgo, today), false);
assert.equal(parentTaskVisibleOnDate(overdueOpen, lastWeek, today), false);

const closed = { ...overdueOpen, done: true, completedDates: ['2026-08-21'] };
assert.equal(isParentTaskOpen(closed), false);
assert.equal(isParentTaskOverdue(closed, today), false);
assert.equal(parentTaskVisibleOnDate(closed, today, today), false);
assert.equal(parentTaskVisibleOnDate(closed, yesterday, today), true);

const multiDay = {
  id: '2',
  active: true,
  type: 'task',
  deadline: '2026-08-25',
  createdAt: { seconds: Math.floor(new Date(2026, 7, 20, 12).getTime() / 1000) },
  done: false,
  completedDates: [],
};
assert.equal(parentTaskCreatedKey(multiDay), '2026-08-20');
assert.equal(parentTaskVisibleOnDate(multiDay, twoDaysAgo, today), true);
assert.equal(parentTaskVisibleOnDate(multiDay, lastWeek, today), false);
assert.equal(parentTaskVisibleOnDate(multiDay, today, today), true);

// ISO-deadline må ikke ødelegge forfalt-badge (tidligere streng-sammenligningsbug)
const isoDeadline = {
  id: 'iso',
  active: true,
  deadline: '2026-08-21T22:00:00.000Z',
  createdAt: '2026-08-21T10:00:00.000Z',
  done: false,
  completedDates: [],
};
assert.equal(parentTaskDeadlineKey(isoDeadline), '2026-08-21');
assert.equal(isParentTaskOverdue(isoDeadline, today), true);
assert.equal(parentTaskVisibleOnDate(isoDeadline, today, today), true);
assert.equal(parentTaskVisibleOnDate(isoDeadline, lastWeek, today), false);

const openNoMeta = {
  id: '3',
  active: true,
  done: false,
  completedDates: [],
};
assert.equal(parentTaskVisibleOnDate(openNoMeta, today, today), true);
assert.equal(parentTaskVisibleOnDate(openNoMeta, yesterday, today), false);

const overdueNoCreated = {
  id: '4',
  active: true,
  deadline: '2026-08-21',
  done: false,
  completedDates: [],
};
assert.equal(parentTaskVisibleOnDate(overdueNoCreated, today, today), true);
assert.equal(parentTaskVisibleOnDate(overdueNoCreated, yesterday, today), true);
assert.equal(parentTaskVisibleOnDate(overdueNoCreated, twoDaysAgo, today), false);

// startKey vinner over createdAt — aldri synlig før startKey
const withStartKey = {
  id: '5',
  active: true,
  deadline: '2026-08-25',
  startKey: '2026-08-21',
  createdAt: '2026-08-10T10:00:00',
  done: false,
  completedDates: [],
};
assert.equal(parentTaskCreatedKey(withStartKey), '2026-08-21');
assert.equal(parentTaskVisibleOnDate(withStartKey, twoDaysAgo, today), false);
assert.equal(parentTaskVisibleOnDate(withStartKey, yesterday, today), true);

// Åpen uten frist: synlig fra opprettet t.o.m. i dag — ikke i fremtiden
const openNoDeadline = {
  id: '6',
  active: true,
  startKey: '2026-08-20',
  done: false,
  completedDates: [],
};
assert.equal(parentTaskVisibleOnDate(openNoDeadline, twoDaysAgo, today), true);
assert.equal(parentTaskVisibleOnDate(openNoDeadline, lastWeek, today), false);
assert.equal(parentTaskVisibleOnDate(openNoDeadline, today, today), true);
assert.equal(parentTaskVisibleOnDate(openNoDeadline, tomorrow, today), false);

// Legacy dueDate som frist
const legacyDue = {
  id: '7',
  active: true,
  dueDate: '2026-08-21',
  startKey: '2026-08-21',
  done: false,
  completedDates: [],
};
assert.equal(parentTaskDeadlineKey(legacyDue), '2026-08-21');
assert.equal(isParentTaskOverdue(legacyDue, today), true);
assert.equal(parentTaskVisibleOnDate(legacyDue, today, today), true);

// Regelmessig oppgave: synlig på ukedager, kvittering lukker kun den dagen
const recurringWeekly = {
  id: '8',
  active: true,
  type: 'task',
  recurring: true,
  recurrenceType: 'weekly',
  recurrenceInterval: 1,
  recurrenceByDays: [5], // fredag (getDay() === 5)
  startKey: '2026-08-17', // mandag
  recurrenceUntilKey: '2026-09-30',
  endKey: '2026-09-30',
  done: false,
  completedDates: ['2026-08-21'], // forrige fredag kvittert
};

assert.equal(isParentTaskOpen(recurringWeekly), true, 'serien er ikke lukket uten dato');
assert.equal(isParentTaskOpen(recurringWeekly, '2026-08-21'), false, 'kvittert fredag er lukket');
assert.equal(isParentTaskOpen(recurringWeekly, '2026-08-28'), true, 'neste fredag er åpen');
assert.equal(isParentTaskOverdue(recurringWeekly, today), false);

// 22. aug 2026 er lørdag — ukentlig fre er synlig 21. (fre), ikke 22.
assert.equal(parentTaskVisibleOnDate(recurringWeekly, yesterday, today), true, 'fredag 21.');
assert.equal(parentTaskVisibleOnDate(recurringWeekly, today, today), false, 'lørdag 22.');
assert.equal(parentTaskVisibleOnDate(recurringWeekly, twoDaysAgo, today), false, 'torsdag');
const nextFriday = new Date(2026, 7, 28);
assert.equal(parentTaskVisibleOnDate(recurringWeekly, nextFriday, today), true, 'fredag 28.');

const afterUntil = new Date(2026, 9, 2); // 2. okt
assert.equal(parentTaskVisibleOnDate(recurringWeekly, afterUntil, afterUntil), false);

const dailyRecurring = {
  id: '9',
  active: true,
  type: 'task',
  recurring: true,
  recurrenceType: 'daily',
  recurrenceInterval: 1,
  startKey: '2026-08-20',
  recurrenceUntilKey: null,
  done: false,
  completedDates: ['2026-08-22'],
};
assert.equal(parentTaskVisibleOnDate(dailyRecurring, today, today), true);
assert.equal(isParentTaskOpen(dailyRecurring, today), false);
assert.equal(isParentTaskOpen(dailyRecurring, yesterday), true);

console.log('parentTasks.test.mjs: ok');
