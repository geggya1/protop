import test from 'node:test';
import assert from 'node:assert/strict';
import {
  companyPolicyRow,
  employeePolicyRow,
  mileageCompensation,
  tripReimbursement,
} from './compensation.js';
import { KNOWN_MILEAGE_RATES, acceptFetchedRate, mileageRatesFor } from './mileageRates.js';
import { recordDutyTrip } from '../economy/opsState.js';

test('satser: kjente satser per år, hentede går foran, senere år bruker siste kjente', () => {
  assert.deepEqual(KNOWN_MILEAGE_RATES[2026], { state: 5.3, taxFree: 3.5 });
  assert.deepEqual(mileageRatesFor('2026-10-20'), { state: 5.3, taxFree: 3.5, year: 2026, source: 'known' });
  assert.equal(mileageRatesFor('2025-03-01').state, 5);
  assert.equal(mileageRatesFor('2027-02-01').state, 5.3);
  const fetched = { 2027: { state: 5.6, taxFree: 3.5 } };
  assert.deepEqual(mileageRatesFor('2027-02-01', fetched), { state: 5.6, taxFree: 3.5, year: 2027, source: 'fetched' });
  // Feillest sats i hentingen brukes ikke.
  assert.equal(mileageRatesFor('2027-02-01', { 2027: { state: 530, taxFree: 3.5 } }).state, 5.3);
});

test('hentet sats godtas bare når den er rimelig', () => {
  const today = new Date('2026-10-29T12:00:00Z');
  assert.equal(acceptFetchedRate(5.3, { year: 2026, previous: 5.0, today }), true);
  assert.equal(acceptFetchedRate(53, { year: 2026, previous: 5.0, today }), false);
  assert.equal(acceptFetchedRate(9, { year: 2026, previous: 5.0, today }), false);
  assert.equal(acceptFetchedRate(5.3, { year: 2019, previous: 5.0, today }), false);
});

test('bedriften: skattefri sats som før uten valg, statens sats følger året', () => {
  assert.equal(mileageCompensation([], 'e1', { date: '2026-10-20' }).rate, 3.5);
  assert.equal(mileageCompensation([{ id: 'company', ratePerKm: 4.2 }], 'e1').rate, 4.2);
  const state = [companyPolicyRow({}, { compensation: 'state' })];
  assert.equal(mileageCompensation(state, 'e1', { date: '2026-10-20' }).rate, 5.3);
  assert.equal(mileageCompensation(state, 'e1', { date: '2025-10-20' }).rate, 5);
  assert.equal(mileageCompensation(state, 'e1', { date: '2027-01-10', fetched: { 2027: { state: 5.6 } } }).rate, 5.6);
});

test('den ansatte: dekket av lønn eller egen sats', () => {
  const policies = [
    companyPolicyRow({}, { compensation: 'state' }),
    employeePolicyRow('e2', { compensation: 'none' }),
    employeePolicyRow('e3', { compensation: 'custom', ratePerKm: '4,00' }),
  ];
  assert.equal(mileageCompensation(policies, 'e2').reimburse, false);
  assert.equal(mileageCompensation(policies, 'e3').rate, 4);
  assert.equal(mileageCompensation(policies, 'e1').reimburse, true);
  assert.equal(employeePolicyRow('e4', { compensation: 'company' }), null);
});

test('refusjon: trekkfri og skattepliktig del, og bare utlegg når lønnen dekker km', () => {
  assert.deepEqual(tripReimbursement({ km: 100, allowance: 530, extras: 42 }), {
    total: 572, allowance: 530, taxFree: 350, taxable: 180, extras: 42,
  });
  assert.deepEqual(tripReimbursement({ km: 100, allowance: 530, extras: 42, reimburse: false }), {
    total: 42, allowance: 0, taxFree: 0, taxable: 0, extras: 42,
  });
});

const trip = {
  id: 't1', date: '2026-10-20', employeeId: 'e1', from: 'Kontoret', to: 'Forus', km: 100, notes: 'Befaring',
  vehicleKind: 'private', purpose: 'duty',
};

test('kjøretur etter statens sats: utlegget har skattepliktig del', () => {
  const result = recordDutyTrip({ mileageTrips: [], expenses: [] }, { ...trip, rate: 5.3, tolls: 42 });
  assert.equal(result.ok, true);
  const expense = result.state.expenses[0];
  assert.equal(expense.amountInclVat, 572);
  assert.equal(expense.taxableAmount, 180);
  assert.match(expense.notes, /skattepliktig 180\.00/);
});

test('kjøretur dekket av lønn: bare bom refunderes, uten bom ingen utleggsrad', () => {
  const withToll = recordDutyTrip({ mileageTrips: [], expenses: [] }, { ...trip, rate: 3.5, tolls: 42, reimbursable: false });
  assert.equal(withToll.state.expenses[0].amountInclVat, 42);
  assert.match(withToll.state.expenses[0].notes, /dekket av lønn/);
  const plain = recordDutyTrip(withToll.state, { ...withToll.state.mileageTrips[0], tolls: 0, reimbursable: false });
  assert.equal(plain.ok, true);
  assert.equal(plain.state.expenses.length, 0);
  assert.equal(plain.state.mileageTrips[0].expenseId, '');
});

test('utbetaling av utlegg: med lønnen som standard, egen utbetaling for bedrift eller ansatt', async () => {
  const { companyPayout, employeePayout } = await import('./compensation.js');
  assert.equal(companyPayout([]), 'payroll');
  const policies = [
    companyPolicyRow({}, { compensation: 'state', expensePayout: 'direct' }),
    employeePolicyRow('e2', { compensation: 'company', payout: 'payroll' }),
  ];
  assert.equal(employeePayout(policies, 'e1'), 'direct');
  assert.equal(employeePayout(policies, 'e2'), 'payroll');
  // Egen utbetaling uten egen sats: kjøringen følger bedriftens sats.
  assert.equal(mileageCompensation(policies, 'e2', { date: '2026-10-20' }).rate, 5.3);
  assert.equal(employeePolicyRow('e3', { compensation: 'company' }), null);
});
