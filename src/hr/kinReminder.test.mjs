import assert from 'node:assert/strict';
import { KIN_SOURCE, KIN_TASK_TITLE, kinMissing, kinPlan, kinReminderDue, kinTask, kinTaskId } from './kinReminder.js';

const now = new Date(2026, 9, 26, 10, 0);
const later = (days) => new Date(2026, 9, 26 + days, 10, 0);
const ola = { id: 'e1', personUid: 'ola', person: { firstName: 'Ola', kinName: '', kinPhone: '' } };
const kari = { id: 'e2', personUid: 'kari', person: { firstName: 'Kari', kinName: 'Per', kinPhone: '900 00 000' } };
const lise = { id: 'e3', personUid: '', person: { firstName: 'Lise' } };

/* Hva som mangler */
assert.equal(kinMissing(ola), true);
assert.equal(kinMissing(kari), false);
assert.equal(kinMissing({ person: { kinName: 'Per' } }), true, 'telefon må også være med');
assert.equal(kinTaskId('e1'), 'kin_e1');

/* Oppgaven tildeles den ansattes brukerkonto, med frist om 14 dager */
const task = { ...kinTask(ola, { uid: 'hr', now }), id: 'kin_e1' };
assert.equal(task.title, KIN_TASK_TITLE);
assert.equal(task.assignedTo, 'ola');
assert.equal(task.source, KIN_SOURCE);
assert.equal(task.deadline, '2026-11-09');
assert.equal(task.startKey, '2026-10-26');
assert.equal(task.done, false);

/* Plan: lag oppgave til dem med brukerkonto som mangler pårørende */
let plan = kinPlan([ola, kari, lise], [], { now });
assert.deepEqual(plan.create.map((row) => row.id), ['e1'], 'Lise har ikke brukerkonto og kan ikke få oppgave');
assert.deepEqual(plan.missing.map((row) => row.employee.id), ['e1', 'e3']);
assert.equal(plan.close.length, 0);

/* Åpen oppgave: ingen ny, ingen påminnelse før fristen */
plan = kinPlan([ola], [task], { now: later(5) });
assert.equal(plan.create.length, 0);
assert.equal(plan.remind.length, 0);
assert.equal(plan.missing[0].task.id, 'kin_e1');

/* Etter fristen: påminnelse, så ny etter en uke, høyst tre */
assert.equal(kinReminderDue(task, later(14)), false, 'fristdagen selv gir ingen påminnelse');
assert.equal(kinReminderDue(task, later(15)), true);
assert.deepEqual(kinPlan([ola], [task], { now: later(15) }).remind.map((row) => row.id), ['kin_e1']);
const reminded = { ...task, reminders: 1, remindedAt: '2026-11-10' };
assert.equal(kinReminderDue(reminded, later(18)), false);
assert.equal(kinReminderDue(reminded, later(22)), true);
assert.equal(kinReminderDue({ ...reminded, reminders: 3 }, later(60)), false);

/* Pårørende lagt inn: oppgaven lukkes */
plan = kinPlan([{ ...ola, person: { kinName: 'Mor', kinPhone: '1' } }], [task], { now });
assert.deepEqual(plan.close.map((row) => row.id), ['kin_e1']);
assert.equal(plan.missing.length, 0);
assert.equal(kinPlan([], [task], { now }).close.length, 0, 'tom ansattliste lukker ikke oppgaver');

/* Lukket uten at pårørende er lagt inn: åpnes igjen etter en uke, som påminnelse */
const closed = { ...task, done: true, completedDates: ['2026-10-27'] };
assert.equal(kinPlan([ola], [closed], { now: later(3) }).create.length, 0);
assert.deepEqual(kinPlan([ola], [closed], { now: later(8) }).create.map((row) => row.id), ['e1']);
const again = kinTask(ola, { now: later(8), previous: closed });
assert.equal(again.reminders, 1);
assert.equal(again.remindedAt, '2026-11-03');
assert.equal(kinPlan([ola], [{ ...closed, reminders: 3 }], { now: later(30) }).create.length, 0);

console.log('kinReminder.test.mjs ok');
