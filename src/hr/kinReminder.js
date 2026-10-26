/**
 * Pårørende fylles inn av den ansatte selv på profilen (Ansatte › Min side › Pårørende).
 * Det finnes ikke eget skjema. Mangler det, får den ansatte en oppgave i oppgavemodulen
 * med varsel, og en påminnelse når fristen er passert.
 *
 * Oppgaven har fast id per ansatt (kin_<ansatt-id>) i families/{id}/parentTodos,
 * så den aldri lages to ganger. Den lukkes når pårørende er lagret.
 */
import { dateKey, parseDateKey } from '../utils/dates.js';
import { isParentTaskOpen } from '../utils/parentTasks.js';

export const KIN_SOURCE = 'hr-kin';
export const KIN_DUE_DAYS = 14;
export const KIN_REMIND_DAYS = 7;
export const KIN_MAX_REMINDERS = 3;
export const KIN_TASK_TITLE = 'Legg inn pårørende på profilen din';

function text(value) {
  return String(value ?? '').trim();
}

function addDays(key, days) {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

/** Mangler navn eller telefon til nærmeste pårørende? */
export function kinMissing(employee) {
  const person = employee?.person || {};
  return !text(person.kinName) || !text(person.kinPhone);
}

export function kinTaskId(employeeId) {
  return `kin_${text(employeeId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`;
}

/**
 * Oppgaven til den ansatte. Tildelt brukerkontoen (personUid).
 * previous: en lukket oppgave som åpnes igjen. Da telles det som en påminnelse.
 */
export function kinTask(employee, { uid = '', now = new Date(), previous = null } = {}) {
  const today = dateKey(now);
  return {
    title: KIN_TASK_TITLE,
    description: 'Gå til Ansatte › Min side › Pårørende og fyll inn navn og telefon til nærmeste pårørende. Det vises bare for deg og administrator. Oppgaven lukkes når det er lagret.',
    deadline: addDays(today, KIN_DUE_DAYS),
    deadlineTime: null,
    participants: [],
    assignedTo: text(employee?.personUid) || null,
    attachments: [],
    done: false,
    active: true,
    deleted: false,
    type: 'task',
    completedDates: [],
    createdBy: text(uid) || null,
    startKey: today,
    order: 0,
    source: KIN_SOURCE,
    employeeId: text(employee?.id),
    remindedAt: previous ? today : '',
    reminders: previous ? (Number(previous.reminders) || 0) + 1 : 0,
  };
}

function open(task) {
  return !!task && task.deleted !== true && isParentTaskOpen(task);
}

/** En lukket oppgave der pårørende fortsatt mangler, åpnes igjen etter en uke (høyst tre ganger). */
function reopenDue(task, today) {
  if ((Number(task.reminders) || 0) >= KIN_MAX_REMINDERS) return false;
  const last = text(task.remindedAt).slice(0, 10) || text(task.startKey).slice(0, 10);
  return !last || addDays(last, KIN_REMIND_DAYS) <= today;
}

/** Fristen er passert og det er lenge nok siden forrige påminnelse. */
export function kinReminderDue(task, now = new Date()) {
  if (!open(task)) return false;
  const today = dateKey(now);
  const deadline = text(task.deadline).slice(0, 10);
  if (!deadline || today <= deadline) return false;
  if ((Number(task.reminders) || 0) >= KIN_MAX_REMINDERS) return false;
  const last = text(task.remindedAt).slice(0, 10);
  return !last || addDays(last, KIN_REMIND_DAYS) <= today;
}

/**
 * Hva som skal gjøres nå. employees er aktive ansatte.
 *   create  ansatte med brukerkonto som mangler pårørende og ikke har oppgave, eller der
 *           oppgaven er lukket uten at pårørende er lagt inn (åpnes igjen etter en uke)
 *   close   åpne oppgaver der pårørende nå er lagret
 *   remind  åpne oppgaver der fristen er passert
 *   missing alle aktive som mangler pårørende, med oppgaven hvis den finnes
 */
export function kinPlan(employees, tasks, { now = new Date() } = {}) {
  const list = Array.isArray(employees) ? employees : [];
  const byId = new Map((Array.isArray(tasks) ? tasks : []).filter((row) => row?.id).map((row) => [row.id, row]));
  const missing = [];
  const create = [];
  const remind = [];
  const close = [];
  for (const employee of list) {
    if (!kinMissing(employee)) continue;
    const task = byId.get(kinTaskId(employee.id)) || null;
    missing.push({ employee, task: open(task) ? task : null });
    if (!text(employee.personUid)) continue;
    if (!task || (!open(task) && reopenDue(task, dateKey(now)))) create.push(employee);
    else if (kinReminderDue(task, now)) remind.push(task);
  }
  for (const task of byId.values()) {
    if (task.source !== KIN_SOURCE || !open(task)) continue;
    // Bare når den ansatte er funnet. En liste som ikke er ferdig lastet skal ikke lukke oppgaver.
    const employee = list.find((row) => kinTaskId(row.id) === task.id);
    if (employee && !kinMissing(employee)) close.push(task);
  }
  return { create, close, remind, missing };
}
