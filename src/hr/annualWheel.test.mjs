/**
 * HR-årshjul: katalog, status per måned, avkrysning og oppgaver når måneden starter.
 */
import assert from 'node:assert/strict';
import {
  HR_ANNUAL_ACTIVITIES, HR_ANNUAL_SOURCE, activityApplies, annualSummary, annualTaskId, annualTaskPlan,
  hrAnnualWheel, normalizeAnnualSettings, reviewFormsFromFilled, reviewProgress, toggleAnnualDone, toggleAnnualOff,
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
  // En aktivitet over flere måneder står én gang, i første måned, med perioden.
  const all = wheel.flatMap((m) => m.items.map((i) => i.activity.id));
  assert.equal(new Set(all).size, all.length, 'ingen aktivitet står to ganger');
  const samtaler = wheel[2].items.find((i) => i.activity.id === 'medarbeidersamtaler');
  assert.equal(samtaler.period, 'Mars–april');
  assert.equal(wheel[3].items.some((i) => i.activity.id === 'medarbeidersamtaler'), false);
  // Midt i perioden (april) er den fortsatt «nå».
  const april = hrAnnualWheel({}, { year: 2026, today: new Date(2026, 3, 10), staffCount: 12 });
  assert.equal(april.flatMap((m) => m.items).find((i) => i.activity.id === 'medarbeidersamtaler').status, 'now');
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
  assert.equal(task.id, annualTaskId('ferie_fastsett', 2026));
  assert.equal(task.id, 'hrahj_ferie_fastsett_2026');
  assert.equal(task.deadline, '2026-03-31');
  assert.equal(task.assignedTo, 'hr');
  assert.equal(task.source, HR_ANNUAL_SOURCE);
  assert.match(task.title, /^HR-årshjul: Fastsett hovedferien/);
  assert.equal(annualTaskPlan(on, { today, existingIds: plan.map((t) => t.id) }).length, 0);
  const done = toggleAnnualDone(on, 2026, 'ferie_fastsett');
  assert.deepEqual(annualTaskPlan(done, { today }).map((t) => t.activityId), ['medarbeidersamtaler']);
  // Én oppgave per periode: frist ved periodens slutt, og ingen ny oppgave i april når den finnes.
  assert.equal(plan.find((t) => t.activityId === 'medarbeidersamtaler').deadline, '2026-04-30');
  const april = new Date(2026, 3, 2);
  assert.equal(annualTaskPlan(on, { today: april, existingIds: plan.map((t) => t.id) }).some((t) => t.activityId === 'medarbeidersamtaler'), false);
  // Slått på i april (eller ingen åpnet HR i mars): oppgaven lages likevel, med samme id.
  assert.equal(annualTaskPlan(on, { today: april }).find((t) => t.activityId === 'medarbeidersamtaler').id, 'hrahj_medarbeidersamtaler_2026');
  // En oppgave med den gamle id-en (per måned) teller som laget.
  assert.equal(annualTaskPlan(on, { today: april, existingIds: ['hrahj_medarbeidersamtaler_2026_03'] }).some((t) => t.activityId === 'medarbeidersamtaler'), false);
}

// Fremdrift for medarbeidersamtaler.
const reviews = [
  { employeeId: 'e1', status: 'done', date: '2026-03-10' },
  { employeeId: 'e2', status: 'planned', date: '2026-04-01' },
  { employeeId: 'e3', status: 'done', date: '2025-03-10' },
];
assert.deepEqual(reviewProgress(reviews, ['e1', 'e2', 'e3'], 2026), { label: '1 av 3 har hatt samtale i 2026', done: false });
assert.equal(reviewProgress(reviews, [], 2026), null);
// KS-skjemaet «Medarbeidersamtale» under Skjemaer teller også.
const forms = reviewFormsFromFilled([
  { scope: 'hr', libraryKey: 'medarbeidersamtale', status: 'ferdig', completedAt: '2026-04-02T10:00:00Z', subject: { id: 'e2' } },
  { scope: 'hr', libraryKey: 'medarbeidersamtale', status: 'utkast', subject: { id: 'e3' } },
  { scope: 'hr', libraryKey: 'nyansatt', status: 'ferdig', completedAt: '2026-04-02T10:00:00Z', subject: { id: 'e3' } },
]);
assert.deepEqual(forms, [{ employeeId: 'e2', date: '2026-04-02' }]);
assert.equal(reviewProgress(reviews, ['e1', 'e2', 'e3'], 2026, forms).label, '2 av 3 har hatt samtale i 2026');

console.log('annualWheel ok');

// Grafisk hjul: hver aktivitet én gang, overlappende aktiviteter på hvert sitt spor.
{
  const { wheelLayout, yearFraction } = await import('./annualWheel.js');
  const wheel = hrAnnualWheel({ off: ['apenhetsloven'] }, { year: 2026, today: new Date(2026, 2, 15), staffCount: 60 });
  const { items, tracks } = wheelLayout(wheel);
  assert.equal(items.length, HR_ANNUAL_ACTIVITIES.length);
  assert.equal(items.find((i) => i.activity.id === 'apenhetsloven').track, -1);
  const jan = items.filter((i) => i.track >= 0 && i.start <= 0 && i.end >= 0);
  assert.equal(new Set(jan.map((i) => i.track)).size, jan.length, 'januar: ingen deler spor');
  const lik = items.find((i) => i.activity.id === 'likestilling');
  const amu = items.find((i) => i.activity.id === 'amu_rapport');
  assert.notEqual(lik.track, amu.track, 'likestilling (jan–feb) og AMU (feb) overlapper');
  assert.ok(tracks >= 3 && tracks <= 4);
  assert.ok(Math.abs(yearFraction(new Date(2026, 6, 2)) - 0.5) < 0.01);
  console.log('wheel layout ok');
}
