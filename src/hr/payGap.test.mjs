/**
 * Lønnskartlegging fordelt på kjønn (likestillings- og diskrimineringsloven § 26 a).
 */
import assert from 'node:assert/strict';
import { PAY_GAP_MIN_GROUP, genderOf, payCategoryOf, payGapReport } from './payGap.js';

function person(id, gender, title, { status = 'active' } = {}) {
  return { id, person: { firstName: id, gender }, company: { status, title } };
}

function salary(employeeId, annualAmount, effectiveDate = '2026-01-01') {
  return { id: `s_${employeeId}_${effectiveDate}`, employeeId, kind: 'actual', annualAmount, effectiveDate };
}

assert.equal(PAY_GAP_MIN_GROUP, 3);
assert.equal(genderOf({ person: { gender: 'Kvinne' } }), 'kvinne');
assert.equal(genderOf({ person: { gender: 'Mann' } }), 'mann');
assert.equal(genderOf({ person: { gender: 'Annet' } }), 'annet');
assert.equal(genderOf({ person: {} }), '');

// Stilling fra aktiv avtale går foran tittelen i ansattregisteret.
assert.equal(payCategoryOf(person('a', 'Kvinne', 'Konsulent'), [{ employeeId: 'a', status: 'active', positionTitle: 'Prosjektleder' }]), 'Prosjektleder');
assert.equal(payCategoryOf(person('a', 'Kvinne', '')), 'Uten stilling');

const employees = [
  person('k1', 'Kvinne', 'Ingeniør'), person('k2', 'Kvinne', 'Ingeniør'), person('k3', 'Kvinne', 'Ingeniør'),
  person('m1', 'Mann', 'Ingeniør'), person('m2', 'Mann', 'Ingeniør'), person('m3', 'Mann', 'Ingeniør'), person('m4', 'Mann', 'Ingeniør'),
  person('k4', 'Kvinne', 'Leder'), person('m5', 'Mann', 'Leder'),
  person('u1', '', 'Ingeniør'),
  person('x1', 'Mann', 'Ingeniør', { status: 'inactive' }),
  person('n1', 'Kvinne', 'Ingeniør'),
];
const salaries = [
  salary('k1', 600000), salary('k2', 650000), salary('k3', 700000),
  salary('m1', 640000), salary('m2', 700000), salary('m3', 720000), salary('m4', 740000),
  salary('k1', 500000, '2025-01-01'),
  salary('k4', 900000), salary('m5', 1000000),
  salary('u1', 600000),
  salary('x1', 2000000),
  salary('m1', 800000, '2027-01-01'),
];

const report = payGapReport({ employees, salaries, onDate: '2026-10-27' });
assert.equal(report.people, 9);
assert.equal(report.missingGender, 1);
assert.equal(report.missingSalary, 1, 'n1 har ingen lønn');

// Ingeniør: tre kvinner og fire menn, gjeldende lønn per dato (ikke framtidig eller gammel).
const engineers = report.categories.find((row) => row.category === 'Ingeniør');
assert.deepEqual(engineers.women, { count: 3, average: 650000, median: 650000 });
assert.deepEqual(engineers.men, { count: 4, average: 700000, median: 710000 });
assert.equal(engineers.ratio, 92.9);
assert.equal(engineers.hidden, false);

// Leder: én av hvert kjønn. Beløpene vises ikke, så ingen kan kjennes igjen.
const leaders = report.categories.find((row) => row.category === 'Leder');
assert.equal(leaders.hidden, true);
assert.deepEqual(leaders.women, { count: 1, average: null, median: null });
assert.equal(leaders.ratio, null);

// Alle: fire kvinner og fem menn.
assert.equal(report.total.women.count, 4);
assert.equal(report.total.men.count, 5);
assert.equal(report.total.women.average, Math.round((600000 + 650000 + 700000 + 900000) / 4));
assert.equal(report.total.ratio, Math.round((712500 / 760000) * 1000) / 10);

// Inaktive og slettede telles ikke. Tom liste gir tom rapport.
assert.equal(report.categories.some((row) => row.men.count > 4), false);
assert.deepEqual(payGapReport({}).categories, []);
assert.equal(payGapReport({ employees, salaries, onDate: '2026-10-27', minGroup: 1 }).categories.find((row) => row.category === 'Leder').ratio, 90);

console.log('payGap.test.mjs: ok');
