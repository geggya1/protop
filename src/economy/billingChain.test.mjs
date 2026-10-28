import assert from 'node:assert/strict';
import {
  BILLING_CHAIN,
  approvalsBackLabel,
  billingChainCounts,
  billingChainStepFor,
  billingChainSteps,
  billingReadyLabel,
  mergeEntries,
  readyProjectIds,
} from './billingChain.js';

// Rekkefølgen og sidene i kjeden.
assert.deepEqual(BILLING_CHAIN.map((row) => row.id), ['timer', 'godkjenn', 'fakturering', 'faktura']);
assert.equal(billingChainStepFor('arbeid', 'timeliste'), 'timer');
assert.equal(billingChainStepFor('arbeid', null), 'timer', 'Arbeid åpner timelisten');
assert.equal(billingChainStepFor('arbeid', 'godkjenning'), 'godkjenn');
assert.equal(billingChainStepFor('okonomi', 'fakturagrunnlag'), 'fakturering');
assert.equal(billingChainStepFor('okonomi', 'faktura'), 'faktura');
assert.equal(billingChainStepFor('okonomi', 'oversikt'), '');
assert.equal(billingChainStepFor('timeliste', null), '', 'personlig timeliste er ikke en del av kjeden');

const entries = [
  { id: 'a1', employeeId: 'anders', projectId: 'p1', status: 'låst', hours: 7.5 },
  { id: 'b1', employeeId: 'berit', projectId: 'p2', status: 'godkjent', hours: 7.5 },
  { id: 'b2', employeeId: 'berit', projectId: 'p3', status: 'godkjent', hours: 7.5 },
  { id: 'b3', employeeId: 'berit', projectId: 'p4', status: 'godkjent', hours: 7.5, invoiceId: 'inv1' },
  { id: 'b4', employeeId: 'berit', projectId: 'p5', status: 'godkjent', hours: 2, billableHours: 0 },
  { id: 'c1', employeeId: 'carl', projectId: 'p1', status: 'registrert', hours: 7.5 },
];
assert.deepEqual([...readyProjectIds(entries)].sort(), ['p2', 'p3'], 'fakturert og ikke fakturerbart teller ikke');

const locks = [
  { employeeId: 'anders', throughDate: '2026-09-30', approvedAt: '' },
  { employeeId: 'berit', throughDate: '2026-09-30', approvedAt: '2026-10-02T09:00:00Z' },
  { employeeId: 'berit', throughDate: '2026-08-31', approvedAt: '' },
  { employeeId: 'dina', throughDate: '2026-09-30', approvedAt: '' },
];
const employees = [{ id: 'anders' }, { id: 'berit' }, { id: 'carl' }, { id: 'eier' }];
const invoices = [
  { id: 'i1', status: 'draft' },
  { id: 'i2', status: 'sent' },
  { id: 'i3', status: 'draft', deleted: true },
];
const counts = billingChainCounts({ employees, locks, entries, invoices });
assert.deepEqual(counts, { timer: 2, godkjenn: 1, fakturering: 2, faktura: 1 },
  'siste lås per ansatt; lås uten timer (dina) venter ikke');
assert.deepEqual(billingChainCounts({ locks }), { timer: null, godkjenn: 2, fakturering: null, faktura: null },
  'uten timer telles alle låste lister som ikke er godkjent');
assert.deepEqual(billingChainCounts(), { timer: null, godkjenn: null, fakturering: null, faktura: null });

// Sidens egne rader vinner over skyens (godkjenning vises før lagringen er ferdig).
const merged = mergeEntries(
  [{ id: 'a1', status: 'låst', projectId: 'p1', hours: 7.5 }],
  [{ id: 'a1', status: 'godkjent', projectId: 'p1', hours: 7.5 }],
);
assert.equal(merged.length, 1);
assert.equal(readyProjectIds(merged).size, 1);

const steps = billingChainSteps(counts, 'godkjenn');
assert.deepEqual(steps.map((row) => row.number), [1, 2, 3, 4]);
assert.deepEqual(steps.map((row) => row.detail), ['2 ikke låst', '1 venter', '2 prosjekter klare', '1 utkast']);
assert.deepEqual(steps.map((row) => row.current), [false, true, false, false]);
assert.deepEqual(steps.map((row) => row.attention), [true, false, true, true]);
assert.equal(billingChainSteps({ fakturering: 1 }, 'faktura')[2].detail, '1 prosjekt klart');
assert.equal(billingChainSteps({}, 'timer')[1].detail, '', 'ukjent tall gir ingen tekst');
assert.equal(billingChainSteps({ godkjenn: 0 }, 'timer')[1].detail, 'Ingen venter');

assert.equal(billingReadyLabel(3), 'Gå til fakturering (3 klare)');
assert.equal(billingReadyLabel(0), 'Gå til fakturering');
assert.equal(approvalsBackLabel(2), 'Til godkjenninger (2 venter)');
assert.equal(approvalsBackLabel(null), 'Til godkjenninger');

console.log('billingChain.test.mjs ok');
