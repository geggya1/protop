/**
 * Økonomi → Utlegg (DRIFT-24): ansatt, prosjekt og kunde fra registrene, sletting med
 * bekreftelse og status på norsk.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { expenseRegistryPatch } from './expenseRegistry.js';
import { expenseStatusLabel } from './expenses.js';
import { deleteExpense, upsertExpense } from './opsState.js';
import { emptyProjectState } from '../project/engine.js';

const people = [{ id: 'emp-anne', label: 'Anne Ansatt' }];
const projects = [
  { id: 'prj-100', number: '100', name: 'Rehab Kundeveien', customerId: 'cust-k1', client: 'Kunde En AS' },
  { id: 'prj-200', number: '200', name: 'Uten kunde' },
];
const customers = [
  { id: 'cust-k1', customerNumber: '10001', name: 'Kunde En AS' },
  { id: 'cust-k2', customerNumber: '10002', name: 'Kunde To AS' },
];
const ctx = { people, projects, customers };

test('prosjektet tar med seg kunden sin, og en annen kunde fjerner prosjektet', () => {
  assert.deepEqual(expenseRegistryPatch('employee', 'emp-anne', ctx), { employeeId: 'emp-anne', employeeName: 'Anne Ansatt' });
  const project = expenseRegistryPatch('project', 'prj-100', ctx);
  assert.deepEqual(project, {
    projectId: 'prj-100',
    projectNumber: '100',
    projectName: 'Rehab Kundeveien',
    customerId: 'cust-k1',
    customerNumber: '10001',
    customerName: 'Kunde En AS',
  });
  // Prosjekt uten kunde rører ikke kundevalget.
  assert.deepEqual(Object.keys(expenseRegistryPatch('project', 'prj-200', ctx)).sort(), ['projectId', 'projectName', 'projectNumber']);
  const other = expenseRegistryPatch('customer', 'cust-k2', { ...ctx, current: { projectId: 'prj-100' } });
  assert.equal(other.customerName, 'Kunde To AS');
  assert.equal(other.projectId, '', 'prosjektet hører til en annen kunde');
  const same = expenseRegistryPatch('customer', 'cust-k1', { ...ctx, current: { projectId: 'prj-100' } });
  assert.equal(same.projectId, undefined, 'samme kunde beholder prosjektet');
  assert.deepEqual(expenseRegistryPatch('project', '', ctx), { projectId: '', projectNumber: '', projectName: '' });
});

test('status vises på norsk, og et utlegg som ikke er godkjent venter på godkjenning', () => {
  assert.equal(expenseStatusLabel('draft'), 'Venter på godkjenning');
  assert.equal(expenseStatusLabel(''), 'Venter på godkjenning');
  assert.equal(expenseStatusLabel('approved'), 'Godkjent');
  assert.equal(expenseStatusLabel('invoiced'), 'Fakturert');
});

test('utlegget lagres koblet og kan slettes (ikke når det er fakturert)', () => {
  const saved = upsertExpense(emptyProjectState(), {
    date: '2026-10-28',
    description: 'Parkering',
    amountExVat: 200,
    ...expenseRegistryPatch('employee', 'emp-anne', ctx),
    ...expenseRegistryPatch('project', 'prj-100', ctx),
  });
  assert.equal(saved.ok, true, saved.error);
  const row = saved.state.expenses[0];
  assert.equal(row.employeeId, 'emp-anne');
  assert.equal(row.projectId, 'prj-100');
  assert.equal(row.customerId, 'cust-k1');
  const removed = deleteExpense(saved.state, row.id);
  assert.equal(removed.ok, true);
  assert.equal(removed.state.expenses.length, 0);
  assert.deepEqual(removed.state.deletedRows.map((item) => `${item.key}:${item.id}`), [`expenses:${row.id}`]);
  const invoiced = { ...saved.state, expenses: [{ ...row, status: 'invoiced' }] };
  assert.equal(deleteExpense(invoiced, row.id).ok, false);
});

test('Økonomi → Utlegg bruker registrene, bekrefter sletting og viser status på norsk', () => {
  const src = readFileSync(new URL('../../screens/economy/EconomyOps.jsx', import.meta.url), 'utf8');
  assert.equal(/label="Kunde" value=\{draft\.customerName/.test(src), false, 'kunde er ikke fritekst');
  assert.equal(/label="Prosjekt" value=\{draft\.projectName/.test(src), false, 'prosjekt er ikke fritekst');
  assert.match(src, /pickInDraft\('employee'/);
  assert.match(src, /pickInDraft\('project'/);
  assert.match(src, /pickInDraft\('customer'/);
  assert.match(src, /expenseStatusLabel\(row\.status\)/);
  assert.equal(/\{row\.status\} ·/.test(src), false, 'rå status vises ikke');
  const remove = src.slice(src.indexOf('function removeExpense'), src.indexOf('if (!ready)'));
  assert.ok(remove.indexOf('setPendingDelete(row.id)') < remove.indexOf('deleteExpense('), 'første trykk ber om bekreftelse');
});

test('Til fakturering sier fra om utlegg og kjøring som venter på godkjenning', async () => {
  const { pendingOperations } = await import('./billingReady.js');
  const expenses = [
    { id: 'a', date: '2026-10-20', status: 'draft' },
    { id: 'b', date: '2026-10-21', status: 'approved' },
    { id: 'c', date: '2026-10-22', status: 'draft', invoiceId: 'F-1' },
    { id: 'd', date: '2026-11-02', status: 'draft' },
    { id: 'e', date: '2026-10-23', status: 'draft', billable: false },
  ];
  const trips = [{ id: 't', date: '2026-10-01', status: 'draft' }, { id: 'u', date: '2026-10-01', status: 'submitted' }];
  assert.deepEqual(pendingOperations({ expenses, trips, until: '2026-10-31' }), { expenses: 1, trips: 1 });
  assert.deepEqual(pendingOperations({ expenses, trips }), { expenses: 2, trips: 1 });
  const src = readFileSync(new URL('../../screens/economy/EconomyBilling.jsx', import.meta.url), 'utf8');
  assert.match(src, /nativeID="billing-pending-operations"/);
});
