import assert from 'node:assert/strict';
import { addDays, dateKey } from '../utils/dates.js';
import { companyHomeTaskRows } from '../companyHome/model.js';
import { isParentTaskOpen, parentTaskVisibleOnDate } from '../utils/parentTasks.js';
import { parentTaskVisibleToUser } from '../utils/parentTaskVisibility.js';
import {
  caseFromPeopleEvent,
  followUpParentTodo,
  followUpTaskFromCase,
  planFollowUpCases,
} from './model.js';

const event = {
  type: 'anniversary',
  employeeId: 'e1',
  name: 'Gonzalo Longe',
  label: '3-årsjubileum',
  date: '2026-11-01',
  days: 16,
};
const row = caseFromPeopleEvent(event);
const draft = followUpTaskFromCase(row, { assigneeUid: 'geir', assigneeName: 'Geir' });

assert.equal(draft.title, row.title);
assert.match(draft.title, /jubileum/i);
assert.equal(draft.deadline, '2026-11-01');
assert.equal(draft.assignedTo, 'geir');
assert.match(draft.description, /Gonzalo Longe/);
assert.match(draft.description, /Ansvar: Geir/);
assert.equal(draft.source, `hr-case:${row.id}`);

const today = new Date();
const startKey = dateKey(today);
const task = followUpParentTodo(
  { ...draft, deadline: dateKey(addDays(today, 30)) },
  { uid: 'geir', startKey, id: 'task-1' },
);
const viewer = { uid: 'geir', ids: new Set(['geir']), asChild: false };
const other = { uid: 'ada', ids: new Set(['ada']), asChild: false };

assert.equal(parentTaskVisibleToUser(task, viewer), true);
assert.equal(parentTaskVisibleToUser(task, other), false);
assert.equal(parentTaskVisibleOnDate(task, today, today), true);
assert.equal(parentTaskVisibleOnDate(task, addDays(today, 10), today), true);
assert.equal(parentTaskVisibleOnDate(task, addDays(today, 31), today), false);
assert.equal(isParentTaskOpen(task, today), true);

const onDashboard = companyHomeTaskRows([task], today, viewer, {
  visibleToUser: parentTaskVisibleToUser,
  visibleOnDate: parentTaskVisibleOnDate,
  isOpen: isParentTaskOpen,
});
assert.equal(onDashboard.length, 1);
assert.equal(onDashboard[0].title, draft.title);
assert.equal(companyHomeTaskRows([task], today, other, {
  visibleToUser: parentTaskVisibleToUser,
  visibleOnDate: parentTaskVisibleOnDate,
  isOpen: isParentTaskOpen,
}).length, 0);

const created = planFollowUpCases([], row, {});
assert.equal(created.created, true);
assert.equal(created.case.taskId, '');
const linked = planFollowUpCases(created.cases, created.case, {
  taskId: 'task-1',
  assigneeUid: 'geir',
  assigneeName: 'Geir',
});
assert.equal(linked.created, false);
assert.equal(linked.linked, true);
assert.equal(linked.cases[0].taskId, 'task-1');
assert.equal(linked.cases[0].assigneeName, 'Geir');
const again = planFollowUpCases(linked.cases, row, {});
assert.equal(again.created, false);
assert.equal(again.linked, false);
assert.equal(again.case.taskId, 'task-1');
assert.equal(again.cases.length, 1);
assert.equal(again.cases[0].taskId, 'task-1');

console.log('hr/followUpTask.test.mjs ok');
