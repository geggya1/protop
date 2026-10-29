import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isPayable,
  markReimbursed,
  payableExpenses,
  payoutPeriodOf,
  payoutSummary,
  payrollCsv,
  payrollLines,
} from './expensePayout.js';
import { normalizeExpense } from './expenses.js';

const rows = [
  { id: 'u1', employeeId: 'a', employeeName: 'Aina', date: '2026-10-07', category: 'books', description: 'Fagbok', amountInclVat: 69, paidBy: 'personal', status: 'approved' },
  { id: 'u2', employeeId: 'a', employeeName: 'Aina', date: '2026-10-20', category: 'mileage', description: 'Kjøring Kontoret – Forus', amountExVat: 572, vatCode: 'EXEMPT', taxableAmount: 180, paidBy: 'personal', status: 'approved' },
  { id: 'u3', employeeId: 'b', employeeName: 'Anas', date: '2026-10-02', category: 'parking', description: 'Parkering', amountInclVat: 120, paidBy: 'personal', status: 'approved' },
  // Ikke til utbetaling: firmakort, utkast, allerede utbetalt.
  { id: 'u4', employeeId: 'a', date: '2026-10-03', amountInclVat: 500, paidBy: 'company', status: 'approved' },
  { id: 'u5', employeeId: 'a', date: '2026-10-04', amountInclVat: 50, paidBy: 'personal', status: 'draft' },
  { id: 'u6', employeeId: 'b', date: '2026-09-04', amountInclVat: 80, paidBy: 'personal', status: 'reimbursed', reimbursedAt: '2026-09-25T10:00:00Z' },
];

test('til utbetaling: godkjent, betalt privat og ikke utbetalt', () => {
  assert.deepEqual(payableExpenses(rows).map((row) => row.id), ['u1', 'u2', 'u3']);
  assert.deepEqual(payableExpenses(rows, { employeeId: 'a' }).map((row) => row.id), ['u1', 'u2']);
  assert.deepEqual(payableExpenses(rows, { until: '2026-10-10' }).map((row) => row.id), ['u1', 'u3']);
  assert.equal(isPayable(rows[3]), false);
});

test('sum per ansatt med trekkfri og skattepliktig del', () => {
  const [aina, anas] = payoutSummary(rows);
  assert.equal(aina.employeeName, 'Aina');
  assert.equal(aina.count, 2);
  assert.equal(aina.total, 641);
  assert.equal(aina.taxable, 180);
  assert.equal(aina.taxFree, 461);
  assert.equal(aina.mileage, 572);
  assert.equal(aina.outlays, 69);
  assert.equal(aina.oldest, '2026-10-07');
  assert.equal(anas.total, 120);
});

test('lønnslinjer: refusjon av utlegg og bilgodtgjørelse delt i trekkfri og trekkpliktig', () => {
  const lines = payrollLines(payableExpenses(rows, { employeeId: 'a' }));
  assert.deepEqual(lines.map((line) => [line.label, line.amount]), [
    ['Refusjon utlegg', 69],
    ['Bilgodtgjørelse, trekkfri', 392],
    ['Bilgodtgjørelse, trekkpliktig', 180],
  ]);
  const csv = payrollCsv(payableExpenses(rows, { employeeId: 'a' }), { period: '2026-10' });
  assert.match(csv, /^﻿Periode;Ansatt-ID;Ansatt;Dato;Lønnsart;Beløp/);
  assert.match(csv, /"2026-10";"a";"Aina";"2026-10-20";"Bilgodtgjørelse, trekkpliktig";"180,00"/);
});

test('markert utbetalt med lønnsperiode', () => {
  const done = normalizeExpense(markReimbursed(rows[0], { period: '2026-10', at: '2026-10-25T08:00:00Z' }));
  assert.equal(done.status, 'reimbursed');
  assert.equal(done.payoutPeriod, '2026-10');
  assert.equal(done.payoutMethod, 'payroll');
  assert.equal(done.reimbursedAt, '2026-10-25T08:00:00Z');
  assert.equal(isPayable(done), false);
  assert.equal(normalizeExpense(markReimbursed(rows[0], { method: 'direct', at: '2026-11-02T08:00:00Z' })).payoutPeriod, '2026-11');
  assert.equal(payoutPeriodOf('2026-12-31'), '2026-12');
});
