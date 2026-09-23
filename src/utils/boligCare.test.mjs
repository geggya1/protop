import assert from 'node:assert/strict';
import {
  WARRANTY_WARN_DAYS,
  cleanTasks,
  cleanIssues,
  cleanSystems,
  missingStarterTasks,
  markTaskDone,
  markIssueFixed,
  markSystemServiced,
  warrantyAlerts,
  taskAlerts,
  watchItems,
  careNotificationId,
  careReminderCopy,
  itemCareParts,
  holdingsForHome,
  suggestedDueKey,
  nextDueAfter,
  daysBetween,
  STARTER_TASKS,
} from './boligCare.js';

const today = '2026-09-19';

assert.equal(daysBetween('2026-09-19', '2026-10-19'), 30);
assert.equal(daysBetween('2026-09-19', '2026-09-01'), -18);
assert.equal(nextDueAfter('2026-01-15', 'biannual'), '2026-07-15');
assert.equal(nextDueAfter('2026-10-15', 'yearly'), '2027-10-15');
assert.equal(nextDueAfter('2026-10-15', 'once'), '2026-10-15');

const due = suggestedDueKey({ month: 10, cadence: 'yearly' }, new Date(2026, 8, 19));
assert.equal(due, '2026-10-15');
const pastMonth = suggestedDueKey({ month: 1, cadence: 'yearly' }, new Date(2026, 8, 19));
assert.equal(pastMonth, '2027-01-15');

const starters = missingStarterTasks([], new Date(2026, 8, 19));
assert.equal(starters.length, STARTER_TASKS.length);
assert.ok(starters.every((task) => task.nextDueKey && task.status === 'open'));
const again = missingStarterTasks(starters, new Date(2026, 8, 19));
assert.equal(again.length, 0);

const cleaned = cleanTasks([
  { title: '  Test røykvarslere  ', cadence: 'nope', priority: 'safety', nextDueKey: '2026-01-15' },
  { title: '   ' },
]);
assert.equal(cleaned.length, 1);
assert.equal(cleaned[0].cadence, 'yearly');
assert.equal(cleaned[0].priority, 'safety');

const done = markTaskDone(cleaned[0], today, 'Ok');
assert.equal(done.lastDoneKey, today);
assert.equal(done.nextDueKey, '2027-09-19');
assert.equal(done.history.length, 1);
const once = markTaskDone({ ...cleaned[0], cadence: 'once' }, today);
assert.equal(once.status, 'done');

const issues = cleanIssues([{ title: 'Lekkasje bad', severity: 'high' }]);
assert.equal(issues[0].status, 'open');
assert.equal(markIssueFixed(issues[0], today).status, 'fixed');

const systems = cleanSystems([{ name: 'Varmepumpe stue', kind: 'heatpump', serviceMonths: 12 }]);
const serviced = markSystemServiced(systems[0], '2026-03-01');
assert.equal(serviced.lastServiceKey, '2026-03-01');
assert.equal(serviced.nextServiceKey, '2027-03-01');

const papers = [
  { id: 'e1', title: 'Vaskemaskin', warrantyUntil: '2026-10-01' },
  { id: 'e2', title: 'Gammel komfyr', warrantyUntil: '2025-01-01' },
  { id: 'e3', title: 'Ny tv', warrantyUntil: '2028-01-01' },
];
const warranties = warrantyAlerts(papers, today, WARRANTY_WARN_DAYS);
assert.equal(warranties.length, 2);
assert.equal(warranties.find((row) => row.refId === 'e2').tone, 'overdue');
assert.equal(warranties.some((row) => row.refId === 'e3'), false);

const tasks = taskAlerts([
  { id: 't1', title: 'Rens takrenner', status: 'open', nextDueKey: '2026-09-20', cadence: 'yearly' },
  { id: 't2', title: 'Langt frem', status: 'open', nextDueKey: '2027-01-01', cadence: 'yearly' },
], today);
assert.equal(tasks.length, 1);

const watch = watchItems({
  id: 'home',
  entries: papers,
  tasks: [{ id: 't1', title: 'Rens takrenner', status: 'open', nextDueKey: '2026-09-10' }],
  systems: [{ id: 's1', name: 'Varmepumpe', nextServiceKey: '2026-09-25' }],
  issues: [{ id: 'i1', title: 'Drypp fra kran', status: 'open', severity: 'normal' }],
}, today, [
  { id: 'h1', title: 'Vaskemaskin', boligId: 'home', warrantyUntil: '2026-09-01' },
]);
assert.ok(watch[0].days < 0);
assert.ok(watch.some((row) => row.kind === 'warranty' && row.refId === 'item_h1'));
assert.equal(careNotificationId('fam', 'home', watch), careNotificationId('fam', 'home', [...watch].reverse()));
assert.match(careReminderCopy('Eikveien 1', watch).title, /Eikveien 1/);

const parts = itemCareParts(
  { roomId: 'r1', warrantyUntil: '2027-01-01', linkedEntryId: 'e1' },
  { rooms: [{ id: 'r1', name: 'Vaskerom' }], entries: papers },
);
assert.deepEqual(parts, ['Vaskerom', 'garanti til 2027-01-01', 'Vaskemaskin']);
assert.equal(holdingsForHome([{ id: 'a' }, { id: 'b', boligId: 'h1' }, { id: 'c', boligId: 'h2' }], 'h1').length, 2);

console.log('boligCare.test.mjs: ok');
