import assert from 'node:assert/strict';
import { buildReadyProjects, selectableKeys, selectionFor } from './billingReady.js';
import {
  approvalLines,
  approvalReview,
  approvalSelection,
  approvalTotals,
  entryStatusLabel,
  postsLabel,
} from './billingApproval.js';

const settings = { accountHours: '3000', accountExpenses: '3000', accountMileage: '3000' };
const customers = [{ id: 'c1', name: 'Kunde AS', orgnr: '912345678', address: 'Kundevei 1' }];
const projects = [
  { id: 'p1', number: '100', name: 'Bru', customerId: 'c1', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1000 } },
  { id: 'p2', number: '200', name: 'Kai', customerId: 'c1', pricingModel: 'hourly', pricingSettings: { hourlyRate: 1000 } },
  { id: 'p3', number: '300', name: 'Uten pris', customerId: 'c1', pricingModel: 'hourly' },
];
const timeEntries = [
  { id: 't1', projectId: 'p1', employeeId: 'e1', employeeName: 'Anders', date: '2026-09-03', hours: 7.5, status: 'låst', description: 'Befaring' },
  { id: 't2', projectId: 'p1', employeeId: 'e1', employeeName: 'Anders', date: '2026-09-02', hours: 2, status: 'registrert' },
  { id: 't3', projectId: 'p1', employeeId: 'e1', employeeName: 'Anders', date: '2026-09-04', hours: 4, status: 'godkjent' },
  { id: 't4', projectId: 'p2', employeeId: 'e2', employeeName: 'Berit', date: '2026-09-05', hours: 3, status: 'godkjent' },
  { id: 't5', projectId: 'p3', employeeId: 'e2', employeeName: 'Berit', date: '2026-09-05', hours: 3, status: 'låst' },
];
const expenses = [
  { id: 'x1', projectId: 'p1', date: '2026-09-01', amountExVat: 500, status: 'submitted', description: 'Parkering', employeeName: 'Anders' },
  { id: 'x2', projectId: 'p1', date: '2026-09-01', amountExVat: 300, status: 'approved', description: 'Bompenger' },
];
const ready = buildReadyProjects({
  projects,
  customers,
  timeEntries,
  expenses,
  settingsFor: () => settings,
  periodEnd: '2026-09-30',
  today: '2026-10-29',
});
const byId = Object.fromEntries(ready.map((row) => [row.projectId, row]));
const all = (project) => new Set(selectableKeys(project));

// Bare det som ikke er godkjent: to timer og ett utlegg. Timene først, eldste dato først.
const lines = approvalLines(byId.p1, all(byId.p1));
assert.deepEqual(lines.map((row) => row.key), ['te:t2', 'te:t1', 'e:x1']);
assert.deepEqual(lines.map((row) => row.status), ['Ikke levert', 'Levert', '']);
assert.equal(lines[1].who, 'Anders');
assert.equal(lines[1].what, 'Hovedaktivitet');
assert.equal(lines[1].note, 'Befaring');
assert.equal(lines[1].hours, 7.5);
assert.equal(lines[1].amount, 7500);
assert.equal(lines[2].kindLabel, 'Utlegg');
assert.equal(lines[2].amount, 500);

// Linjer som er tatt ut av utvalget på prosjektet, er ikke med.
const hoursOnly = new Set(byId.p1.hourGroups.map((row) => row.key));
assert.deepEqual(approvalLines(byId.p1, hoursOnly).map((row) => row.kind), ['hours', 'hours']);
assert.deepEqual(approvalLines(byId.p1, new Set()), []);

// Prosjekt uten timepris er stoppet og har ingenting å godkjenne her.
assert.equal(byId.p3.blocked, true);
assert.deepEqual(approvalLines(byId.p3, new Set(byId.p3.hourGroups.map((row) => row.key))), []);

// Utvalget: prosjekter der alt er godkjent, hoppes over.
const review = approvalReview([byId.p1, byId.p2, byId.p3], all);
assert.deepEqual(review.map((row) => row.project.projectId), ['p1']);
assert.deepEqual(approvalReview([byId.p2], all), []);

// Summer og lagring for det som er krysset av.
assert.deepEqual(approvalTotals(lines), { count: 3, hours: 9.5, amount: 10000 });
const picked = new Set(['te:t1', 'e:x1']);
assert.deepEqual(approvalTotals(lines, picked), { count: 2, hours: 7.5, amount: 8000 });
const selection = approvalSelection(lines, picked);
assert.deepEqual(selection.entries.map((row) => row.id), ['t1']);
assert.deepEqual(selection.expenses.map((row) => row.id), ['x1']);
assert.deepEqual(selection.trips, []);
assert.deepEqual(selection.sales, []);

// Samme timer som «Lag fakturautkast» ville godkjent (selectionFor().unapproved).
const unapproved = selectionFor(byId.p1, all(byId.p1)).unapproved;
assert.deepEqual(
  approvalSelection(lines).entries.map((row) => row.id).sort(),
  unapproved.entries.map((row) => row.id).sort(),
);

assert.equal(entryStatusLabel('låst'), 'Levert');
assert.equal(entryStatusLabel('registrert'), 'Ikke levert');
assert.equal(postsLabel(1), '1 post');
assert.equal(postsLabel(4), '4 poster');

console.log('billingApproval.test.mjs ok');
