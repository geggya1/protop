import { appliesOnDate, dateKey } from './dates.js';
import {
  isParentTaskOpen,
  isParentTaskOverdue,
  isParentTaskRecurring,
  parentTaskDeadlineKey,
} from './parentTasks.js';
import { parentTaskVisibleToUser } from './parentTaskVisibility.js';
import { isDoneOn, todosOnDate } from './todoStatus.js';

/**
 * Outlook-style daily list: open family tasks sit on their due date.
 * Overdue open tasks also appear on today (and on the original due date
 * if that past day is still in view).
 * Recurring tasks appear on each occurrence day until signed off that day.
 */
export function calendarPaneTaskOnDate(task, date, refToday = new Date()) {
  if (!task || task.deleted || task.active === false) return false;
  if (isParentTaskRecurring(task)) {
    if (!appliesOnDate(task, date)) return false;
    return isParentTaskOpen(task, date);
  }
  if (!isParentTaskOpen(task)) return false;
  const k = dateKey(date);
  const todayK = dateKey(refToday);
  const deadline = parentTaskDeadlineKey(task);
  if (!deadline) return k === todayK;
  if (deadline < todayK) return k === todayK || k === deadline;
  return k === deadline;
}

export function calendarPaneTasksForDate(tasks, date, refToday, viewer) {
  return (tasks || []).filter((t) => (
    calendarPaneTaskOnDate(t, date, refToday)
    && parentTaskVisibleToUser(t, viewer)
  ));
}

/** Open child chores that apply on this calendar day. */
export function calendarPaneChoresForDate(todos, date) {
  const k = dateKey(date);
  return todosOnDate(todos, date).filter((t) => (
    String(t?.category || '').toLowerCase() !== 'lekser' && !isDoneOn(t, k)
  ));
}

/**
 * Bottom calendar strip: adult profiles show family tasks (Oppgaver),
 * child profiles show that child's chores (Gjøremål). The two lists are
 * never mixed — kids' chores stay on kids' pages.
 */
export function buildCalendarPaneItems({
  date,
  parentTodos = [],
  kids = [],
  kidsTodosById = {},
  viewer,
  refToday = new Date(),
} = {}) {
  const asChild = !!viewer?.asChild;
  const items = [];
  if (!asChild) {
    calendarPaneTasksForDate(parentTodos, date, refToday, viewer).forEach((t) => {
      items.push({
        key: `task:${t.id}`,
        kind: 'task',
        title: t.title || 'Oppgave',
        overdue: isParentTaskOverdue(t),
        meta: t.deadlineTime || null,
        date,
        task: t,
      });
    });
    return items;
  }
  kids.forEach((kid) => {
    if (!kid?.id) return;
    calendarPaneChoresForDate(kidsTodosById[kid.id] || [], date).forEach((t) => {
      items.push({
        key: `chore:${kid.id}:${t.id}`,
        kind: 'chore',
        title: t.title || 'Gjøremål',
        overdue: false,
        meta: null,
        date,
        task: t,
        childId: kid.id,
        child: kid,
      });
    });
  });
  return items;
}
