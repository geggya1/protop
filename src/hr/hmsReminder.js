/**
 * Varsel når HMS-kortet går ut: HR får en oppgave i oppgavemodulen om å fornye kortet,
 * fra HMS_CARD_WARN_DAYS dager før utløpsdatoen. Kortet bestilles av arbeidsgiver.
 *
 * Oppgaven har fast id per ansatt (hms_<ansatt-id>) i families/{id}/parentTodos og husker
 * utløpsdatoen den gjelder. Den lages ikke på nytt for samme kort, og lukkes når et nytt
 * kort er registrert eller personen er satt til «Ikke aktuelt».
 */
import { isParentTaskOpen } from '../utils/parentTasks.js';
import { hmsCardFor, hmsCardStatus } from './hmsCard.js';

export const HMS_SOURCE = 'hr-hms-card';

function text(value) {
  return String(value ?? '').trim();
}

function nbDate(iso) {
  const m = text(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function personName(employee) {
  const p = employee?.person || {};
  return [p.firstName, p.middleName, p.lastName].map(text).filter(Boolean).join(' ') || text(employee?.name) || 'ansatt';
}

export function hmsTaskId(employeeId) {
  return `hms_${text(employeeId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80)}`;
}

/** Oppgaven til HR (uid) om å fornye kortet. */
export function hmsRenewalTask(employee, card, { uid = '', today = '' } = {}) {
  const expired = hmsCardStatus(card, today).id === 'expired';
  const name = personName(employee);
  return {
    title: `Forny HMS-kortet til ${name}`,
    description: `HMS-kort ${text(card?.number)} ${expired ? 'gikk ut' : 'går ut'} ${nbDate(card?.validTo)}. Bestill nytt kort på hmskort.no. Skann eller registrer det nye kortet i HR → Personell → ${name} → Lovpålagt. Oppgaven lukkes når det nye kortet er registrert.`,
    deadline: text(card?.validTo),
    deadlineTime: null,
    participants: [],
    assignedTo: text(uid) || null,
    attachments: [],
    done: false,
    active: true,
    deleted: false,
    type: 'task',
    completedDates: [],
    createdBy: text(uid) || null,
    startKey: text(today),
    order: 0,
    source: HMS_SOURCE,
    employeeId: text(employee?.id),
    validTo: text(card?.validTo),
  };
}

function open(task) {
  return !!task && task.deleted !== true && isParentTaskOpen(task);
}

/**
 * Hva som skal gjøres nå. employees er aktive ansatte. notApplicable er ansatt-id-er der
 * HMS-kort er satt til «Ikke aktuelt».
 *   create  { employee, card } for kort som er utløpt eller går ut snart, uten oppgave for
 *           akkurat det kortet (samme utløpsdato)
 *   close   åpne oppgaver der kortet er fornyet eller personen ikke lenger trenger kort
 */
export function hmsTaskPlan(employees, cards, tasks, { today = '', notApplicable = [] } = {}) {
  const now = text(today).slice(0, 10) || new Date().toISOString().slice(0, 10);
  const skip = new Set(notApplicable);
  const list = Array.isArray(employees) ? employees : [];
  const byId = new Map((Array.isArray(tasks) ? tasks : []).filter((row) => row?.id).map((row) => [row.id, row]));
  const create = [];
  const close = [];
  for (const employee of list) {
    const id = text(employee?.id);
    if (!id || skip.has(id)) continue;
    const card = hmsCardFor(id, cards);
    const state = hmsCardStatus(card, now).id;
    if (state !== 'expired' && state !== 'expiring') continue;
    const task = byId.get(hmsTaskId(id));
    if (task && text(task.validTo) === card.validTo) continue;
    create.push({ employee, card });
  }
  for (const task of byId.values()) {
    if (task.source !== HMS_SOURCE || !open(task)) continue;
    // Bare når den ansatte er funnet. En liste som ikke er ferdig lastet skal ikke lukke oppgaver.
    const employee = list.find((row) => hmsTaskId(row.id) === task.id);
    if (!employee) continue;
    const card = hmsCardFor(employee.id, cards);
    const renewed = card && card.validTo !== text(task.validTo) && hmsCardStatus(card, now).id === 'valid';
    if (renewed || skip.has(text(employee.id))) close.push(task);
  }
  return { create, close };
}
