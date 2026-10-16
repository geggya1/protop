import assert from 'node:assert/strict';
import {
  blockingFindings,
  controlEntries,
  formatLockAge,
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

console.log('timesheetReview.test.mjs: ok');
