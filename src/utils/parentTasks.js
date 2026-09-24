import { appliesOnDate, dateKey, isToday, toDateSafe, dueDateKey } from './dates.js';

/** Normaliser frist til YYYY-MM-DD (tåler ISO-strenger, Timestamp og legacy dueDate). */
export function parentTaskDeadlineKey(task) {
  if (!task) return null;
  return dueDateKey(task.deadline) || dueDateKey(task.dueDate) || null;
}

/** Familieoppgave med regelmessighet (samme motor som gjøremål/kalender). */
export function isParentTaskRecurring(task) {
  return !!(task && task.recurring === true && task.recurrenceType);
}

function completionKey(onDate) {
  if (onDate == null) return null;
  return typeof onDate === 'string' ? onDate : dateKey(onDate);
}

/**
 * YYYY-MM-DD for tidligste synlige dag.
 * Preferer eksplisitt startKey (satt ved opprettelse), deretter createdAt, ellers frist.
 * Aldri speil bakover uten en av disse.
 */
export function parentTaskCreatedKey(task) {
  if (!task) return null;
  if (task.startKey && /^\d{4}-\d{2}-\d{2}/.test(String(task.startKey))) {
    return String(task.startKey).slice(0, 10);
  }
  const d = toDateSafe(task.createdAt);
  if (d && !Number.isNaN(d.getTime())) return dateKey(d);
  // Fallback: fristdagen som tidligste synlige dag når createdAt mangler
  return parentTaskDeadlineKey(task);
}

/**
 * Engangs: lukket ved done / completedDates.
 * Regelmessig: lukket kun for den gitte hendelsesdatoen (kvittering per gang).
 * Uten dato: serien er aldri «globalt lukket» av én kvittering.
 */
export function isParentTaskClosed(task, onDate = null) {
  if (!task) return true;
  if (isParentTaskRecurring(task)) {
    const k = completionKey(onDate);
    if (!k) return false;
    const completed = Array.isArray(task.completedDates) ? task.completedDates : [];
    return completed.includes(k);
  }
  if (task.done === true) return true;
  const completed = Array.isArray(task.completedDates) ? task.completedDates : [];
  if (!completed.length) return false;
  const deadline = parentTaskDeadlineKey(task);
  if (deadline && completed.includes(deadline)) return true;
  // Én fullføring (på en hvilken som helst dag) lukker engangsoppgaven.
  return true;
}

export function isParentTaskOpen(task, onDate = null) {
  return !!task && !isParentTaskClosed(task, onDate);
}

export function isParentTaskOverdue(task, refDate = new Date()) {
  // Regelmessige oppgaver kvitteres per hendelse — ingen «forsinket»-badge på serien.
  if (isParentTaskRecurring(task)) return false;
  const deadline = parentTaskDeadlineKey(task);
  if (!deadline || !isParentTaskOpen(task)) return false;
  const k = dateKey(refDate);
  if (deadline > k) return false;
  if (deadline === k) {
    if (task.deadlineTime) {
      const [hh, mm] = String(task.deadlineTime).split(':').map(Number);
      const limit = new Date(
        refDate.getFullYear(),
        refDate.getMonth(),
        refDate.getDate(),
        hh || 0,
        mm || 0,
      );
      if (refDate <= limit) return false;
    }
    return true;
  }
  return true;
}

/**
 * Synlighet for familieoppgaver (parentTodos) på en kalenderdag:
 * - regelmessig → appliesOnDate (start/stopp/ukedager)
 * - engangs: aldri før opprettet-dato (startKey / createdAt / frist-fallback)
 * - t.o.m. frist mens den er relevant
 * - forfalt + åpen → alltid synlig «i dag» til den lukkes
 * - uten frist + åpen → fra opprettet t.o.m. i dag (ikke fremtid, ikke før opprettet)
 */
export function parentTaskVisibleOnDate(task, date, refToday = new Date()) {
  if (!task || task.deleted || task.active === false) return false;

  if (isParentTaskRecurring(task)) {
    return appliesOnDate(task, date);
  }

  const k = dateKey(date);
  const todayK = dateKey(refToday);
  const created = parentTaskCreatedKey(task);
  const deadline = parentTaskDeadlineKey(task);
  const open = isParentTaskOpen(task);

  // Hard grense: aldri synlig før opprettet.
  if (created && k < created) return false;

  // Åpen oppgave med passert (eller dagens) frist henger på «i dag» til lukket.
  if (open && isToday(date, refToday)) {
    if (!deadline || deadline <= todayK) {
      if (!created || created <= todayK) return true;
    }
  }

  if (deadline) {
    if (k > deadline) return false;
    if (created) return k >= created;
    // Uten createdAt: ikke speil bakover i tid — kun fristdagen.
    return k === deadline;
  }

  // Uten frist: synlig fra opprettet t.o.m. i dag mens åpen; ellers kun fullføringsdager.
  if (open) {
    if (created) return k >= created && k <= todayK;
    return isToday(date, refToday);
  }
  const completed = Array.isArray(task.completedDates) ? task.completedDates : [];
  return completed.includes(k);
}

export function parentTodosOnDate(tasks, date, refToday = new Date()) {
  return (tasks || []).filter((t) => parentTaskVisibleOnDate(t, date, refToday));
}

export function parentTasksForOverview(tasks, today = new Date()) {
  return parentTodosOnDate(tasks, today, today);
}
