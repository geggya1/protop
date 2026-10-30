/**
 * Oppgaver til de ansatte for styrte dokumenter med lesekrav: «Les og bekreft» (pakrevd)
 * og «Fyll ut og signer» (signeres). Oppgaven ligger i oppgavemodulen og gir varsel.
 *
 * Den lages når en nyansatt mangler bekreftelsen, eller når en ny versjon er godkjent
 * og personen ikke har bekreftet den. Eldre mangler får ingen oppgave av seg selv, så
 * bedrifter som tar dette i bruk ikke får en bølge av oppgaver. De står på Min side og i
 * dokumentoversikten.
 *
 * Fast id per dokument og ansatt (doc_<dokument>_<ansatt>) i families/{id}/parentTodos.
 * Oppgaven husker versjonen, lages ikke på nytt for samme versjon, og lukkes når
 * dokumentet er bekreftet eller signert.
 */
import { isParentTaskOpen } from '../utils/parentTasks.js';
import { employeeName, isPublished, latestAck, publishedRevision } from './model.js';

export const DOC_TASK_SOURCE = 'doc-read';
/** Så mange dager etter tiltredelse regnes personen som nyansatt. */
export const NEW_HIRE_DAYS = 60;
/** Så mange dager etter godkjenning regnes en versjon som ny. */
export const NEW_REVISION_DAYS = 30;
export const DOC_TASK_DUE_DAYS = 14;

function text(value) {
  return String(value ?? '').trim();
}

function dayKey(value) {
  return text(value).slice(0, 10);
}

function addDays(key, days) {
  const m = dayKey(key).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days)).toISOString().slice(0, 10);
}

function employeeUid(employee) {
  return text(employee?.personUid || employee?.uid);
}

export function docTaskId(controlId, employeeId) {
  const clean = (value) => text(value).replace(/[^A-Za-z0-9_-]/g, '');
  return `doc_${clean(controlId).slice(0, 80)}_${clean(employeeId).slice(0, 80)}`;
}

/** Dokumenter som krever noe av hver ansatt. */
export function requiredControls(controls) {
  return (Array.isArray(controls) ? controls : []).filter((control) => control && !control.archived
    && isPublished(control) && (control.readRule === 'pakrevd' || control.readRule === 'signeres'));
}

/** Har personen bekreftet eller signert gjeldende versjon? */
export function docDone(control, employee, { acks = [], filled = [] } = {}) {
  const pub = publishedRevision(control);
  if (!pub) return false;
  if (control.readRule === 'signeres') {
    return (filled || []).some((doc) => doc.status === 'ferdig' && doc.templateId === control.refId
      && doc.subject?.kind === 'employee' && doc.subject.id === employee?.id);
  }
  const ack = latestAck(acks, control.id, { uid: employeeUid(employee), employeeId: employee?.id });
  return !!ack && ack.revision >= pub.revision;
}

function isNewHire(employee, today) {
  const start = dayKey(employee?.company?.periodFrom) || dayKey(employee?.createdAt);
  return !!start && start >= addDays(today, -NEW_HIRE_DAYS);
}

function isNewRevision(control, today) {
  const at = dayKey(publishedRevision(control)?.approvedAt);
  return !!at && at >= addDays(today, -NEW_REVISION_DAYS);
}

/** Oppgaven til den ansatte. */
export function docReadTask(control, employee, { uid = '', today = '' } = {}) {
  const pub = publishedRevision(control);
  const sign = control.readRule === 'signeres';
  return {
    title: `${sign ? 'Fyll ut og signer' : 'Les og bekreft'}: ${control.title}`,
    description: sign
      ? `Gå til Ansatte › Min side › Dokumenter å lese, fyll ut og signer «${control.title}». Det lagres i HR med begrenset tilgang. Oppgaven lukkes når dokumentet er signert.`
      : `Gå til Ansatte › Min side › Dokumenter å lese, les «${control.title}» (versjon ${pub?.revision || 1}) og trykk «Jeg har lest og forstått». Oppgaven lukkes når det er bekreftet.`,
    deadline: addDays(today, DOC_TASK_DUE_DAYS),
    deadlineTime: null,
    participants: [],
    assignedTo: employeeUid(employee) || null,
    attachments: [],
    done: false,
    active: true,
    deleted: false,
    type: 'task',
    completedDates: [],
    createdBy: text(uid) || null,
    startKey: today,
    order: 0,
    source: DOC_TASK_SOURCE,
    employeeId: text(employee?.id),
    employeeName: employeeName(employee),
    docKey: control.id,
    revision: pub?.revision || 0,
  };
}

function open(task) {
  return !!task && task.deleted !== true && isParentTaskOpen(task);
}

/**
 * Hva som skal gjøres nå. employees er aktive ansatte.
 *   create  { control, employee }: personen har brukerkonto, mangler gjeldende versjon, er
 *           nyansatt eller versjonen er ny, og har ikke fått oppgave for denne versjonen
 *   close   åpne oppgaver der dokumentet er bekreftet, eller ikke lenger krever noe
 */
export function docTaskPlan(employees, controls, tasks, { acks = [], filled = [], today = '' } = {}) {
  const now = dayKey(today) || new Date().toISOString().slice(0, 10);
  const people = Array.isArray(employees) ? employees : [];
  const required = requiredControls(controls);
  const byId = new Map((Array.isArray(tasks) ? tasks : []).filter((row) => row?.id).map((row) => [row.id, row]));
  const create = [];
  const close = [];
  for (const control of required) {
    const revision = publishedRevision(control).revision;
    const fresh = isNewRevision(control, now);
    for (const employee of people) {
      if (!employee?.id || !employeeUid(employee)) continue;
      if (docDone(control, employee, { acks, filled })) continue;
      const task = byId.get(docTaskId(control.id, employee.id));
      if (task && Number(task.revision) >= revision) continue;
      if (fresh || isNewHire(employee, now)) create.push({ control, employee });
    }
  }
  for (const task of byId.values()) {
    if (task.source !== DOC_TASK_SOURCE || !open(task)) continue;
    const control = required.find((row) => row.id === task.docKey);
    // Bare når personen er funnet. En liste som ikke er ferdig lastet skal ikke lukke oppgaver.
    const employee = people.find((row) => row.id === task.employeeId);
    if (!employee) continue;
    if (!control || docDone(control, employee, { acks, filled })) close.push(task);
  }
  return { create, close };
}
