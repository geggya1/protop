/**
 * Frister ved sykefravær: oppfølgingsplan (4 uker), dialogmøte 1 (7 uker), dialogmøte 2 (26 uker).
 */
import assert from 'node:assert/strict';
import {
  SICK_SOURCE, addDays, markSickMilestone, sickCases, sickFollowUpRows, sickTask, sickTaskId, sickTaskPlan,
} from './sickLeave.js';

/** Hverdager fra start til og med slutt. */
function days(employeeId, from, to, type = 'syk_melding') {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push({ employeeId, date: d, type, hours: 7.5 });
  }
  return out;
}

const ada = { id: 'e1', person: { firstName: 'Ada' } };

{
  // Egenmelding og så sykmelding, med helg imellom: ett tilfelle. Sykt barn og ferie telles ikke.
  const rows = [
    ...days('e1', '2026-09-01', '2026-09-03', 'egenmelding'),
    ...days('e1', '2026-09-07', '2026-10-30'),
    ...days('e1', '2026-08-03', '2026-08-04', 'sykt_barn'),
    ...days('e1', '2026-07-06', '2026-07-24', 'ferie'),
  ];
  const cases = sickCases(rows);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].start, '2026-09-01');
  assert.equal(cases[0].end, '2026-10-30');
  assert.equal(cases[0].key, 'e1_2026-09-01');
}

{
  // Tilbake i 10 dager: samme tilfelle. Tilbake i 20 dager: nytt tilfelle.
  const near = sickCases([...days('e1', '2026-09-01', '2026-09-04'), ...days('e1', '2026-09-15', '2026-09-18')]);
  assert.equal(near.length, 1);
  const far = sickCases([...days('e1', '2026-09-01', '2026-09-04'), ...days('e1', '2026-09-25', '2026-09-28')]);
  assert.equal(far.length, 2);
  // Avslått fravær teller ikke.
  assert.equal(sickCases([{ employeeId: 'e1', date: '2026-09-01', type: 'syk_melding', status: 'avslått' }]).length, 0);
  // Importerte datoer i norsk format.
  assert.equal(sickCases([{ employeeId: 'e1', date: '01.09.2026', type: 'syk_melding' }])[0].start, '2026-09-01');
}

{
  // Syk fra 1.9. I dag 20.9: oppfølgingsplan snart (frist 29.9), dialogmøte 1 senere.
  const absences = days('e1', '2026-09-01', '2026-11-30');
  let rows = sickFollowUpRows(absences, [], { today: '2026-09-20', employees: [ada] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].employee, ada);
  const [plan, dm1, dm2] = rows[0].milestones;
  assert.equal(plan.due, '2026-09-29');
  assert.equal(plan.status, 'soon');
  assert.equal(dm1.due, '2026-10-20');
  assert.equal(dm1.status, 'later');
  assert.equal(dm2.due, '2027-03-02');
  assert.equal(rows[0].next.id, 'plan');

  // 1.10: planen er forsinket. Markert gjort: ferdig.
  rows = sickFollowUpRows(absences, [], { today: '2026-10-01' });
  assert.equal(rows[0].milestones[0].status, 'overdue');
  const marked = markSickMilestone([], rows[0], 'plan', 'done', { by: 'hr', today: '2026-10-01' });
  assert.equal(marked[0].marks.plan.status, 'done');
  rows = sickFollowUpRows(absences, marked, { today: '2026-10-01' });
  assert.equal(rows[0].milestones[0].status, 'done');
  assert.equal(rows[0].next.id, 'dm1');
  // Fjern markeringen igjen.
  assert.deepEqual(markSickMilestone(marked, rows[0], 'plan', '')[0].marks, {});
}

{
  // Kort fravær (en uke) vises ikke. Tilbake før fristen og i mer enn 16 dager: ikke nødvendig.
  const short = days('e1', '2026-10-05', '2026-10-09');
  assert.equal(sickFollowUpRows(short, [], { today: '2026-10-12' }).length, 0);
  const back = days('e1', '2026-08-03', '2026-08-21');
  const all = sickFollowUpRows(back, [], { today: '2026-10-01', all: true });
  assert.equal(all[0].milestones[0].status, 'notNeeded');
  assert.equal(sickFollowUpRows(back, [], { today: '2026-10-01' }).length, 0);
}

{
  // Oppgaver: nøytral tittel, uten navn og ansatt-id. Lukkes når fristen er markert.
  const absences = days('e1', '2026-09-01', '2026-11-30');
  const rows = sickFollowUpRows(absences, [], { today: '2026-09-20' });
  let plan = sickTaskPlan(rows, []);
  assert.equal(plan.create.length, 1);
  assert.equal(plan.create[0].milestone.id, 'plan');
  const id = sickTaskId(rows[0], 'plan');
  assert.equal(plan.create[0].id, id);
  assert.ok(!id.includes('e1'), 'id-en skal ikke vise ansatt-id');
  const task = { ...sickTask(plan.create[0].milestone, { uid: 'hr', today: '2026-09-20' }), id };
  assert.equal(task.title, 'Frist i sykefraværsoppfølging: oppfølgingsplan');
  assert.equal(task.deadline, '2026-09-29');
  assert.equal(task.assignedTo, 'hr');
  assert.equal(task.source, SICK_SOURCE);
  assert.ok(!JSON.stringify(task).includes('Ada'));
  assert.ok(!('employeeId' in task));

  // Oppgaven finnes: ingen ny.
  assert.equal(sickTaskPlan(rows, [task]).create.length, 0);
  // Markert gjort: lukkes.
  const marked = markSickMilestone([], rows[0], 'plan', 'done');
  plan = sickTaskPlan(sickFollowUpRows(absences, marked, { today: '2026-09-21' }), [task]);
  assert.deepEqual(plan.close.map((t) => t.id), [id]);
}

console.log('sickLeave ok');
