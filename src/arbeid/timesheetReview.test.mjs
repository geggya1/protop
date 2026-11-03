import assert from 'node:assert/strict';
import {
  blockingFindings,
  controlEntries,
  formatLockAge,
  lockNeedsControl,
  reportedLock,
  reviewTimesheetEntries,
  splitApprovalQueues,
  sumHours,
} from './timesheetReview.js';

{
  const findings = reviewTimesheetEntries([
    { id: 'a', date: '2026-10-01', hours: 7.5, description: 'Befaring og proskjektmøte' },
    { id: 'b', date: '2026-10-02', hours: 14, description: 'Lang dag på anlegg' },
    { id: 'c', date: '2026-10-03', hours: 8, description: 'x', clockIn: '08:00', clockOut: '16:00' },
    { id: 'd', date: '2026-10-05', hours: 8, description: 'Møte', clockIn: '08:00', clockOut: '12:00' },
  ]);
  const typo = findings.find((row) => row.entryId === 'a' && row.kind === 'skrivefeil');
  assert.equal(typo.suggestion, 'Befaring og prosjektmøte');
  assert.ok(findings.some((row) => row.entryId === 'b' && row.id.endsWith(':timer')));
  assert.ok(findings.some((row) => row.entryId === 'c' && row.id.endsWith(':tekst')));
  assert.ok(findings.some((row) => row.entryId === 'c' && row.severity === 'warn' && row.id.endsWith(':helg')));
  assert.ok(findings.some((row) => row.entryId === 'd' && row.id.endsWith(':klokke')));
  assert.ok(blockingFindings(findings).length >= 3);
}

{
  const now = new Date('2026-10-16T12:00:00.000Z');
  assert.equal(formatLockAge('', now), 'Aldri låst');
  assert.equal(formatLockAge('2026-10-16T08:00:00.000Z', now), 'Sist låst i dag');
  assert.equal(formatLockAge('2026-10-02T08:00:00.000Z', now), 'Sist låst for 14 dager siden');
  const queues = splitApprovalQueues({
    employees: [
      { id: 'e1', name: 'Aina Helen Jespersen' },
      { id: 'e2', name: 'Ola Nordmann' },
    ],
    locks: [{ employeeId: 'e1', throughDate: '2026-10-02', approvedAt: '' }],
    archive: [{ employeeId: 'e2', throughDate: '2026-09-30', lockedAt: '2026-10-02T08:00:00.000Z' }],
    now,
  });
  assert.equal(queues.locked.length, 1);
  assert.equal(queues.locked[0].employee.name, 'Aina Helen Jespersen');
  assert.equal(queues.unlocked.length, 1);
  assert.equal(queues.unlocked[0].ageLabel, 'Sist låst for 14 dager siden');
  assert.equal(queues.unlocked[0].lastThrough, '2026-09-30');
}

{
  const lock = {
    employeeId: 'e1',
    throughDate: '2026-10-02',
    approvedAt: '2026-10-16T00:00:00.000Z',
    approvedThrough: '2026-10-02',
    periodFrom: '2026-09-30',
  };
  const state = {
    timeEntries: [
      { id: 'old', employeeId: 'e1', date: '2026-09-12', hours: 8 },
      { id: 'new', employeeId: 'e1', date: '2026-10-01', hours: 7.5 },
    ],
  };
  assert.equal(sumHours(controlEntries(state, reportedLock(lock)).hours), 7.5);
}

{
  const lock = { employeeId: 'aina', throughDate: '2026-10-05', approvedAt: '' };
  assert.equal(lockNeedsControl({ timeEntries: [] }, lock), false);
  assert.equal(lockNeedsControl({
    timeEntries: [{ employeeId: 'aina', date: '2026-10-03', hours: 0 }],
  }, lock), false);
  assert.equal(lockNeedsControl({
    timeEntries: [{ employeeId: 'aina', date: '2026-10-16', hours: 6 }],
  }, lock), false);
  assert.equal(lockNeedsControl({
    timeEntries: [{ employeeId: 'aina', date: '2026-10-03', hours: 6 }],
  }, lock), true);
}

console.log('timesheetReview.test.mjs: ok');

// Arbeidstidsgrenser (aml §§ 10-4, 10-6, 10-8).
{
  const { workingTimeFindings, statutoryOvertime } = await import('./timesheetReview.js');
  const e = (id, date, hours, extra = {}) => ({ id, date, hours, description: 'Montering av vegg', ...extra });
  assert.equal(statutoryOvertime({ a: 10, b: 10, c: 8 }), 2);
  assert.equal(statutoryOvertime({ a: 9, b: 9, c: 9, d: 9, e: 9 }), 5);

  const long = workingTimeFindings([e('a', '2026-03-02', 14)]);
  assert.ok(long.some((f) => /13 timer per døgn/.test(f.message)));
  assert.ok(long.every((f) => f.severity === 'warn' && f.kind === 'arbeidstid'));

  // 5 x 11 t = 55 t: over 48 t og 15 t overtid.
  const week = ['02', '03', '04', '05', '06'].map((d, i) => e(`w${i}`, `2026-03-${d}`, 11));
  const wf = workingTimeFindings(week);
  assert.ok(wf.some((f) => /48 timer/.test(f.message)));
  assert.ok(wf.some((f) => /15 timer overtid/.test(f.message)));
  assert.equal(workingTimeFindings(week, { tariff: true }).some((f) => /overtid etter loven/.test(f.message)), false);

  // Hvile: ut 23:00, inn 07:00 = 8 t.
  const rest = workingTimeFindings([
    e('r1', '2026-03-02', 8, { clockIn: '15:00', clockOut: '23:00' }),
    e('r2', '2026-03-03', 8, { clockIn: '07:00', clockOut: '15:00' }),
  ]);
  assert.ok(rest.some((f) => /Bare 8 timer hvile/.test(f.message)));

  // Fire uker med 7 t overtid hver (5 x 9,4 t) = 28 t > 25 t, men bare med historikk.
  const weekOf = (monday, tag) => [0, 1, 2, 3, 4].map((i) => {
    const date = new Date(Date.UTC(...monday.split('-').map((v, k) => (k === 1 ? Number(v) - 1 : Number(v)))) + i * 86400000).toISOString().slice(0, 10);
    return e(`${tag}${i}`, date, 9.4);
  });
  const history = [...weekOf('2026-02-09', 'a'), ...weekOf('2026-02-16', 'b'), ...weekOf('2026-02-23', 'c')];
  const now = weekOf('2026-03-02', 'n');
  assert.equal(workingTimeFindings(now).some((f) => /overtid/.test(f.message)), false);
  const four = workingTimeFindings(now, { history });
  assert.ok(four.some((f) => /28 timer overtid de siste fire ukene/.test(f.message)));

  // Vanlig uke gir ingen varsler.
  assert.deepEqual(workingTimeFindings(['02', '03', '04', '05', '06'].map((d, i) => e(`ok${i}`, `2026-03-${d}`, 7.5))), []);
  console.log('workingTime ok');
}
