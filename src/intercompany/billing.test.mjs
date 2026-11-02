/**
 * Til fakturering med konsernintegrasjon: speilede timer og salg fra et tilknyttet selskap
 * kommer med først når de er godkjent der. Utleie bruker rabatten på raden.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadyProjects, isOpenEntry } from '../economy/billingReady.js';
import { normalizeTimeEntryRow } from '../project/engine.js';
import { normalizeSale } from '../economy/products.js';
import { mirrorSale, mirrorTimeEntry, rentalSaleFromBooking } from './model.js';

const SUPPLIER = { id: 'famDatter', name: 'Datter AS' };
const CLONE = { id: 'prjic_icl-1_prjA', intercompany: { linkId: 'icl-1', ownerProjectId: 'prjA', ownerProjectNumber: '24017', ownerProjectName: 'Skole' } };
const PROJECT = { id: 'prjA', number: '24017', name: 'Skole', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1000 } };

function mirrored(status) {
  return mirrorTimeEntry({
    source: { id: 't1', projectId: CLONE.id, employeeId: 'emp7', employeeName: 'Ola', date: '2026-10-10', hours: 5, status },
    clone: CLONE,
    supplier: SUPPLIER,
    ownerEmployeeId: 'ic_famDatter_emp7',
  }).row;
}

test('speilede felt overlever normaliseringen i appen', () => {
  const row = normalizeTimeEntryRow(mirrored('godkjent'));
  assert.equal(row.icMirror, true);
  assert.equal(row.intercompany.supplierApproved, true);
  const sale = normalizeSale(mirrorSale({ source: { id: 's', projectId: CLONE.id, name: 'Gips', kind: 'rental', status: 'approved' }, clone: CLONE, supplier: SUPPLIER }).row);
  assert.equal(sale.kind, 'rental');
  assert.equal(sale.icMirror, true);
});

test('timer fra datter faktureres hos mor først når datter har godkjent', () => {
  const waiting = normalizeTimeEntryRow(mirrored('registrert'));
  const ready = normalizeTimeEntryRow(mirrored('godkjent'));
  assert.equal(isOpenEntry(waiting), false);
  assert.equal(isOpenEntry(ready), true);
  const built = buildReadyProjects({ projects: [PROJECT], timeEntries: [waiting], periodEnd: '2026-10-31', today: '2026-11-02' });
  assert.equal(built.length, 0);
  const withReady = buildReadyProjects({ projects: [PROJECT], timeEntries: [ready], periodEnd: '2026-10-31', today: '2026-11-02' });
  assert.equal(withReady[0].hourGroups[0].hours, 5);
  assert.equal(withReady[0].hourGroups[0].amount, 5000);
  assert.equal(withReady[0].hourGroups[0].supplierName, 'Datter AS');
  assert.equal(withReady[0].hourGroups[0].approvedCount, 1, 'godkjent hos arbeidsgiveren teller som godkjent');
});

test('salg fra datter venter til det er klart der', () => {
  const draft = mirrorSale({ source: { id: 's1', projectId: CLONE.id, date: '2026-10-05', name: 'Gips', quantity: 2, unitPrice: 100, status: 'draft' }, clone: CLONE, supplier: SUPPLIER }).row;
  const ready = mirrorSale({ source: { id: 's1', projectId: CLONE.id, date: '2026-10-05', name: 'Gips', quantity: 2, unitPrice: 100, status: 'approved' }, clone: CLONE, supplier: SUPPLIER }).row;
  assert.equal(buildReadyProjects({ projects: [PROJECT], sales: [draft], periodEnd: '2026-10-31', today: '2026-11-02' }).length, 0);
  const built = buildReadyProjects({ projects: [PROJECT], sales: [ready], periodEnd: '2026-10-31', today: '2026-11-02' });
  assert.equal(built[0].sales.length, 1);
  assert.equal(built[0].sales[0].approved, true, 'klar hos arbeidsgiveren = klar hos mor');
  assert.equal(built[0].sales[0].intercompany.sourceCompanyName, 'Datter AS');
});

test('utleie på kopien får avtalt rabatt, ikke produktrabatten', () => {
  const clone = { ...CLONE, number: '24017', pricingModel: 'hourly', intercompany: { ...CLONE.intercompany, role: 'supplier', rentalDiscountPercent: 20 } };
  const row = rentalSaleFromBooking({
    booking: { id: 'b1', equipmentId: 'eq', projectId: clone.id, date: '2026-10-01', endDate: '2026-10-02' },
    equipment: { id: 'eq', name: 'Lift', rental: { enabled: true, price: 500, unit: 'dag' } },
    project: clone,
  });
  const built = buildReadyProjects({
    projects: [clone], sales: [row], periodEnd: '2026-10-31', today: '2026-11-02',
    settingsFor: () => ({ discountProducts: 5 }),
  });
  assert.equal(built[0].sales[0].kind, 'rental');
  assert.equal(built[0].sales[0].discountPercent, 20);
  assert.equal(built[0].sales[0].quantity, 2);
});

test('reservasjon av utleieutstyr på prosjekt blir salgsrad i prosjektstate', async () => {
  const { upsertBooking, cancelBooking } = await import('../equipment/state.js');
  const state = {
    projects: [PROJECT],
    sales: [],
    equipment: [{ id: 'eq1', name: 'Minigraver', scope: 'company', group: 'utstyr', rental: { enabled: true, price: 1500, unit: 'dag' } }],
    equipmentBookings: [],
  };
  const booked = upsertBooking(state, {
    equipmentId: 'eq1', employeeId: 'emp1', employeeName: 'Kari', projectId: 'prjA', projectName: '#24017 Skole',
    date: '2026-10-12', startTime: '07:00', endTime: '15:00', purpose: 'Graving',
  });
  assert.equal(booked.ok, true, booked.error);
  assert.equal(booked.state.sales.length, 1);
  assert.equal(booked.state.sales[0].kind, 'rental');
  assert.equal(booked.state.sales[0].unitPrice, 1500);
  const ready = buildReadyProjects({ projects: [PROJECT], sales: booked.state.sales, periodEnd: '2026-10-31', today: '2026-11-02' });
  assert.equal(ready[0].sales[0].amount, 1500, 'én dag à 1500 eks. mva');
  const cancelled = cancelBooking(booked.state, booked.state.equipmentBookings[0].id);
  assert.equal(cancelled.state.sales.length, 0);
});

test('utlegg fra datter faktureres hos mor når datter har godkjent', async () => {
  const { mirrorExpense } = await import('./model.js');
  const src = { id: 'e1', projectId: CLONE.id, date: '2026-10-03', description: 'Hotell', amountExVat: 1000, amountInclVat: 1120, status: 'submitted' };
  const waiting = mirrorExpense({ source: src, clone: CLONE, supplier: SUPPLIER }).row;
  const ready = mirrorExpense({ source: { ...src, status: 'approved' }, clone: CLONE, supplier: SUPPLIER }).row;
  assert.equal(buildReadyProjects({ projects: [PROJECT], expenses: [waiting], periodEnd: '2026-10-31', today: '2026-11-02' }).length, 0);
  const built = buildReadyProjects({ projects: [PROJECT], expenses: [ready], periodEnd: '2026-10-31', today: '2026-11-02' });
  assert.equal(built[0].expenses.length, 1);
  assert.equal(built[0].expenses[0].intercompany.sourceCompanyName, 'Datter AS');
});

test('timer fra datter regnes som levert i Til fakturering (ingen «Timeliste ikke levert»)', () => {
  const ready = normalizeTimeEntryRow(mirrored('godkjent'));
  const built = buildReadyProjects({ projects: [PROJECT], timeEntries: [ready], periodEnd: '2026-10-31', today: '2026-11-02' });
  const group = built[0].hourGroups[0];
  assert.equal(group.fromSupplier, true);
  assert.equal(group.lockBehind, false);
  assert.ok(!(built[0].warnings || []).some((w) => /ikke levert/.test(w.message || w.text || '')));
});
