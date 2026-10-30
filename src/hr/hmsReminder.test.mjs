/**
 * Varsel når HMS-kortet går ut: oppgave til HR fra 30 dager før, lukkes når nytt kort er registrert.
 */
import assert from 'node:assert/strict';
import { HMS_SOURCE, hmsRenewalTask, hmsTaskId, hmsTaskPlan } from './hmsReminder.js';

const ada = { id: 'e1', person: { firstName: 'Ada', lastName: 'Nordmann' }, company: { status: 'active' } };
const bo = { id: 'e2', person: { firstName: 'Bo', lastName: 'Berg' }, company: { status: 'active' } };
const today = '2026-10-30';

{
  // Går ut om 20 dager: oppgave. Gyldig lenge: ingen. Ikke aktuelt: ingen.
  const cards = [
    { employeeId: 'e1', number: 'HMS 1', validTo: '2026-11-19' },
    { employeeId: 'e2', number: 'HMS 2', validTo: '2027-06-01' },
  ];
  const plan = hmsTaskPlan([ada, bo], cards, [], { today });
  assert.deepEqual(plan.create.map((row) => row.employee.id), ['e1']);
  assert.equal(plan.close.length, 0);
  assert.equal(hmsTaskPlan([ada], cards, [], { today, notApplicable: ['e1'] }).create.length, 0);

  const task = hmsRenewalTask(ada, cards[0], { uid: 'hr1', today });
  assert.equal(task.title, 'Forny HMS-kortet til Ada Nordmann');
  assert.match(task.description, /går ut 19\.11\.2026\. Bestill nytt kort på hmskort\.no/);
  assert.equal(task.deadline, '2026-11-19');
  assert.equal(task.assignedTo, 'hr1');
  assert.equal(task.source, HMS_SOURCE);
  assert.equal(task.validTo, '2026-11-19');
  assert.equal(hmsTaskId('e1'), 'hms_e1');

  // Samme kort: ingen ny oppgave, heller ikke når den er lukket for hånd.
  const existing = { ...task, id: 'hms_e1' };
  assert.equal(hmsTaskPlan([ada], cards, [existing], { today }).create.length, 0);
  assert.equal(hmsTaskPlan([ada], cards, [{ ...existing, done: true, completedDates: [today] }], { today }).create.length, 0);

  // Nytt kort registrert: oppgaven lukkes.
  const renewed = [{ employeeId: 'e1', number: 'HMS 9', validTo: '2028-11-19' }];
  assert.deepEqual(hmsTaskPlan([ada], renewed, [existing], { today }).close.map((row) => row.id), ['hms_e1']);
  // Personen er ikke i listen (ikke ferdig lastet): oppgaven står.
  assert.equal(hmsTaskPlan([], renewed, [existing], { today }).close.length, 0);
  // Utløpt kort: oppgaven sier at det gikk ut.
  assert.match(hmsRenewalTask(ada, { number: 'HMS 1', validTo: '2026-10-01' }, { today }).description, /gikk ut 01\.10\.2026/);
}

console.log('hmsReminder.test.mjs: ok');
