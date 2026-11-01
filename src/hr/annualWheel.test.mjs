/**
 * HR-årshjul: katalog, status per måned, avkrysning og oppgaver når måneden starter.
 */
import assert from 'node:assert/strict';
import {
  HR_ANNUAL_ACTIVITIES, HR_ANNUAL_SOURCE, activityApplies, annualSummary, annualTaskId, annualTaskPlan,
  hrAnnualWheel, normalizeAnnualSettings, reviewProgress, toggleAnnualDone, toggleAnnualOff,
} from './annualWheel.js';

// Katalogen: unike id-er, gyldige måneder, og lovkrav har lovhenvisning.
const ids = HR_ANNUAL_ACTIVITIES.map((a) => a.id);
assert.equal(new Set(ids).size, ids.length);
for (const a of HR_ANNUAL_ACTIVITIES) {
  assert.ok(a.months.length && a.months.every((m) => m >= 0 && m <= 11), a.id);
  if (a.kind === 'lov') assert.ok(a.law, `${a.id} mangler lovhenvisning`);
}

// Lagret oppsett: ukjente id-er og ugyldige nøkler forsvinner.
const s = normalizeAnnualSettings({ off: ['finnes_ikke', 'apenhetsloven'], done: { '2026:feriepenger': { at: '2026-06-20' }, rot: 1 }, tasks: 'ja' });
assert.deepEqual(s.off, ['apenhetsloven']);
assert.deepEqual(Object.keys(s.done), ['2026:feriepenger']);
assert.equal(s.tasks, false);

// Antall ansatte: AMU fra 50, åpenhetsloven fra 50. Ukjent antall: gjelder.
const amu = HR_ANNUAL_ACTIVITIES.find((a) => a.id === 'amu_rapport');
assert.equal(activityApplies(amu, 12), false);
assert.equal(activityApplies(amu, 60), true);
assert.equal(activityApplies(amu, null), true);

{
  // 15. mars 2026, 12 ansatte.
  const today = new Date(2026, 2, 15);
  let settings = toggleAnnualDone({}, 2026, 'ferie_saldo', { by: 'hr', today });
  settings = toggleAnnualOff(settings, 'verneombud');
  const wheel = hrAnnualWheel(settings, { year: 2026, today, staffCount: 12 });
  const status = (id) => wheel.flatMap((m) => m.items).find((i) => i.activity.id === id).status;
  assert.equal(status('ferie_saldo'), 'done');
  assert.equal(status('verneombud'), 'off');
  assert.equal(status('amu_rapport'), 'na');
  assert.equal(status('likestilling'), 'na', 'under 20 ansatte');
  assert.equal(status('ferie_fastsett'), 'now');
  assert.equal(status('lonnsoppgjor'), 'later');
  // Medarbeidersamtaler går over mars og april og er derfor «nå».
  assert.equal(status('medarbeidersamtaler'), 'now');
  // Et tidligere år: alt som ikke er gjort, er forsinket.
  const last = hrAnnualWheel({}, { year: 2025, today, staffCount: 12 });
  assert.ok(last.flatMap((m) => m.items).filter((i) => i.status !== 'na').every((i) => i.status === 'late'));
  const sum = annualSummary(wheel);
  assert.equal(sum.done, 1);
  assert.ok(sum.total > 8);
  // Automatisk fremdrift fra samtalene.
  const extra = { medarbeidersamtaler: { label: '2 av 2', done: true } };
  assert.equal(hrAnnualWheel({}, { year: 2026, today, extra }).flatMap((m) => m.items).find((i) => i.activity.id === 'medarbeidersamtaler').status, 'done');
  // Avkrysning to ganger fjerner den.
  assert.deepEqual(toggleAnnualDone(toggleAnnualDone({}, 2026, 'ferie_saldo'), 2026, 'ferie_saldo').done, {});
}

{
  // Oppgaver: bare når slått på, bare inneværende måned, ikke for det som er gjort eller finnes.
  const today = new Date(2026, 2, 2);
  assert.deepEqual(annualTaskPlan({}, { today }), []);
  const on = { tasks: true };
  const plan = annualTaskPlan(on, { today, staffCount: 12, uid: 'hr' });
  assert.deepEqual(plan.map((t) => t.activityId).sort(), ['ferie_fastsett', 'medarbeidersamtaler']);
  const task = plan.find((t) => t.activityId === 'ferie_fastsett');
  assert.equal(task.id, annualTaskId('ferie_fastsett', 2026, 2));
  assert.equal(task.id, 'hrahj_ferie_fastsett_2026_03');
  assert.equal(task.deadline, '2026-03-31');
  assert.equal(task.assignedTo, 'hr');
  assert.equal(task.source, HR_ANNUAL_SOURCE);
  assert.match(task.title, /^HR-årshjul: Fastsett hovedferien/);
  assert.equal(annualTaskPlan(on, { today, existingIds: plan.map((t) => t.id) }).length, 0);
  const done = toggleAnnualDone(on, 2026, 'ferie_fastsett');
  assert.deepEqual(annualTaskPlan(done, { today }).map((t) => t.activityId), ['medarbeidersamtaler']);
}

// Fremdrift for medarbeidersamtaler.
const reviews = [
  { employeeId: 'e1', status: 'done', date: '2026-03-10' },
  { employeeId: 'e2', status: 'planned', date: '2026-04-01' },
  { employeeId: 'e3', status: 'done', date: '2025-03-10' },
];
assert.deepEqual(reviewProgress(reviews, ['e1', 'e2', 'e3'], 2026), { label: '1 av 3 har hatt samtale i 2026', done: false });
assert.equal(reviewProgress(reviews, [], 2026), null);

console.log('annualWheel ok');
