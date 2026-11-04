import assert from 'node:assert/strict';
import {
  assignmentDuration, durationLabel, evaluationScore, exitProgress, followUpStatus, followUpSummary,
  normalizeHiredFollowUp,
} from './followUp.js';
import {
  normalizeSupplier, supplierChecksFor, supplierForEmployee, supplierStatus, suppliersSummary,
} from './suppliers.js';
import { normalizeHrState } from '../hr/model.js';
import { hrRetentionPlan } from '../hr/retention.js';

const TODAY = '2026-11-04';

// Oppfølging: bare feltene som hører til typen beholdes.
{
  const row = normalizeHiredFollowUp({ employeeId: 'a', kind: 'trivsel', score: 9, date: '2026-10-01T10:00' });
  assert.equal(row.score, 0);
  assert.equal(row.date, '2026-10-01');
  const evalRow = normalizeHiredFollowUp({ kind: 'evaluering', score: 4, ratings: { kvalitet: 5, hms: 4, x: 3 }, rehire: 'yes' });
  assert.equal(evalRow.score, 0);
  assert.deepEqual(evalRow.ratings, { kvalitet: 5, hms: 4 });
  assert.equal(evaluationScore(evalRow), 4.5);
  const exit = normalizeHiredFollowUp({ kind: 'avslutning', checks: { tilganger: true, utstyr: 'ja' } });
  assert.deepEqual(exit.checks, { tilganger: true });
  assert.deepEqual(exitProgress(exit), { done: 1, total: 5, complete: false });
}

// Status: trivsel forfaller etter 30 dager, avslutning når oppdraget er slutt.
{
  const people = [
    { employee: { id: 'a', company: {} }, active: true },
    { employee: { id: 'b', company: {} }, active: true },
    { employee: { id: 'c', company: { periodTo: '2026-10-31' } }, active: true },
    { employee: { id: 'd', company: {} }, active: false },
  ];
  const rows = followUpStatus(people, [
    { employeeId: 'a', kind: 'trivsel', score: 2, date: '2026-10-20' },
    { employeeId: 'b', kind: 'trivsel', score: 5, date: '2026-09-01' },
    { employeeId: 'd', kind: 'avslutning', date: '2026-10-01', checks: Object.fromEntries(['tilganger', 'utstyr', 'adgang', 'timer', 'evaluering'].map((k) => [k, true])) },
  ], { today: TODAY });
  assert.deepEqual(rows.map((row) => row.due), ['', 'trivsel', 'avslutning', '']);
  const sum = followUpSummary(rows);
  assert.equal(sum.avg, 3.5);
  assert.equal(sum.low.length, 1);
  assert.equal(sum.dueTrivsel.length, 1);
  assert.equal(sum.dueExit.length, 1);
}

// Varighet: varsel for innleide fra 2,5 år, over 3 år gir rett til fast ansettelse.
{
  const emp = (from, to = '') => ({ company: { periodFrom: from, periodTo: to } });
  assert.equal(assignmentDuration(emp('2024-01-01'), { kindLabel: 'Innleid', today: TODAY }).level, 'watch');
  assert.equal(assignmentDuration(emp('2023-01-01'), { kindLabel: 'Innleid', today: TODAY }).level, 'over');
  assert.equal(assignmentDuration(emp('2023-01-01'), { kindLabel: 'Ekstern', today: TODAY }).level, '');
  assert.equal(assignmentDuration(emp('2026-10-01'), { kindLabel: 'Innleid', today: TODAY }).months, 1);
  assert.equal(assignmentDuration(emp(''), { today: TODAY }).days, null);
  assert.equal(durationLabel(14), '1 år 2 mnd');
  assert.equal(durationLabel(0), 'Under 1 mnd');
}

// Leverandørkontroll: lovkrav per type, og kontroller som går ut på tid.
{
  assert.ok(supplierChecksFor('bemanning').some((row) => row.id === 'sup_registry'));
  assert.ok(!supplierChecksFor('leverandor').some((row) => row.id === 'sup_registry'));
  const s = normalizeSupplier({ name: ' Bygg UE AS ', orgNr: '123 456 789', kind: 'underentreprenor', employeeIds: ['a', 'a', ''] });
  assert.equal(s.name, 'Bygg UE AS');
  assert.equal(s.orgNr, '123456789');
  assert.deepEqual(s.employeeIds, ['a']);
  const status = supplierStatus({
    ...s,
    checks: {
      sup_tax: { status: 'ok', date: '2026-01-01' },
      sup_terms: { status: 'ok', date: '2026-06-01' },
      sup_hms_cards: { status: 'ok' },
      sup_crew_list: { status: 'na' },
    },
  }, { today: TODAY });
  assert.equal(status.items.find((row) => row.id === 'sup_tax').status, 'expired');
  assert.equal(status.items.find((row) => row.id === 'sup_terms').validTo, '2027-06-01');
  assert.deepEqual(status.lawGaps.map((row) => row.id), []);
  const sum = suppliersSummary([s, { name: 'Arkivert', archived: true }], { today: TODAY });
  assert.equal(sum.count, 1);
  assert.equal(sum.withLawGaps, 1);
  assert.equal(supplierForEmployee([s], 'a').name, 'Bygg UE AS');
  assert.equal(supplierForEmployee([s], 'b'), null);
}

// HR-dokumentet beholder listene, og slettingen tar oppfølgingen og koblingen til personen.
{
  const hr = normalizeHrState({
    hiredFollowUps: [{ employeeId: 'gone', kind: 'trivsel', score: 3, date: '2020-01-01' }],
    suppliers: [{ name: 'Firma', employeeIds: ['gone', 'stay'] }],
  });
  assert.equal(hr.hiredFollowUps.length, 1);
  assert.equal(hr.suppliers.length, 1);
  const employees = [
    { id: 'gone', company: { status: 'inactive', periodTo: '2015-01-31' } },
    { id: 'stay', company: { status: 'active' } },
  ];
  const plan = hrRetentionPlan(hr, { employees, now: new Date(`${TODAY}T12:00:00`) });
  assert.equal(plan.state.hiredFollowUps.length, 0);
  assert.deepEqual(plan.state.suppliers[0].employeeIds, ['stay']);
}

console.log('innleie followUp/suppliers ok');

// Tidslinjen: felles skala fra tidligste start, i dag og framtidig del.
{
  const { assignmentTimeline } = await import('./dashboard.js');
  const t = assignmentTimeline([
    { id: 'a', name: 'A', kindLabel: 'Innleid', duration: { from: '2024-11-04', to: '', months: 24, level: '' } },
    { id: 'b', name: 'B', kindLabel: 'Ekstern', duration: { from: '2025-11-04', to: '2027-11-04', months: 12, level: '' } },
  ], { today: TODAY });
  assert.equal(t.start, '2024-11-04');
  assert.equal(t.end, '2027-11-04');
  assert.equal(t.rows[0].left, 0);
  assert.ok(Math.abs(t.todayPct - 66.7) < 0.2);
  assert.ok(t.rows[1].future > 30);
  assert.ok(Math.abs(t.rows[0].threeYearPct - 100) < 0.2);
  assert.equal(t.rows[1].threeYearPct, null);
  assert.deepEqual(assignmentTimeline([], { today: TODAY }).rows, []);
}
