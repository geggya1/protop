import assert from 'node:assert/strict';
import {
  addCustomVariable,
  addEmployeeExtra,
  addStandardLine,
  calculateEmployee,
  calculateHired,
  defaultEarningsSettings,
  defaultStandardLines,
  defaultVariables,
  earningsAudience,
  exactHourlyRate,
  hideEmployeeLine,
  projectEarnings,
  removeStandardLine,
  setEmployeeAmount,
  setEmployeeIncome,
  setGrunnbelop,
  setVariable,
  yearCapacity,
} from './earnings.js';
import { fetchGrunnbelop, grunnbelopIsStale, grunnbelopPeriod } from './grunnbelop.js';

const photoAmounts = [950000, 50000, 5400, 37970, 85666, 7777, 1944, 833.33, 1150, 1840, 130160];

const defaults = defaultEarningsSettings();
const storedAmounts = defaultStandardLines()
  .filter((row) => row.kind === 'input')
  .map((row) => row.defaultAmount);
assert.deepEqual(storedAmounts, storedAmounts.map(() => 0), 'standardbeløp starter på 0');
assert.equal(defaults.variables.defaultBillableRate, 0);
assert.equal(defaults.variables.normHours, 0);
assert.equal(defaults.variables.defaultBillablePercent, 0);
assert.equal(defaults.variables.grunnbelop, 136549);
for (const amount of photoAmounts) {
  assert.equal(JSON.stringify(defaults).includes(String(amount)), false, `eksempeltall ${amount} skal ikke ligge i standarden`);
}

function person(partial = {}) {
  return {
    id: 'e1',
    person: { firstName: 'Kari', lastName: 'Nordmann' },
    company: { status: 'active', workPercent: '100', title: 'Rådgiver', ...partial.company },
    ...partial,
    company: { status: 'active', workPercent: '100', title: 'Rådgiver', ...(partial.company || {}) },
  };
}

const salary = [{ employeeId: 'e1', kind: 'actual', annualAmount: 950000, effectiveDate: '2026-01-01', currency: 'NOK' }];

const bare = calculateEmployee({ employee: person(), salaries: salary, settings: defaults });
assert.equal(bare.salary.amount, 950000);
assert.equal(bare.salary.missing, false);
assert.equal(bare.lines.find((row) => row.id === 'bil').amount, 0);
assert.equal(bare.lines.find((row) => row.id === 'kontor').amount, 0);
assert.equal(bare.direct, 950000);
assert.equal(bare.rate, 0);
assert.equal(bare.hours, 0);
assert.equal(bare.revenue, 0);

const missing = calculateEmployee({
  employee: person(),
  salaries: [],
  settings: defaults,
});
assert.equal(missing.salary.missing, true);
assert.equal(missing.direct, 0);
assert.equal(missing.lines.find((row) => row.id === 'feriepenger').amount, 0);

function exampleSettings() {
  const variables = {
    ...defaultVariables(),
    grunnbelop: 130160,
    normHours: 1840,
    defaultBillableRate: 1150,
    defaultBillablePercent: 1,
  };
  const amounts = {
    bil: 50000,
    hjemmekontor: 5400,
    forsikring: 37970,
    edb: 5000,
    mobil: 7500,
    klaer: 3000,
    kontor: 85666,
    kurs: 10000,
    regnskap: 7777,
    revisjon: 1944,
    lunsj: 4000,
    telefon: 4200,
    sosialt: 20000,
    programvare: 24000,
    poolbil: 833.33,
  };
  return {
    ...defaultEarningsSettings(),
    variables,
    standardLines: defaultStandardLines().map((row) => (
      Object.prototype.hasOwnProperty.call(amounts, row.id)
        ? { ...row, defaultAmount: amounts[row.id] }
        : row
    )),
  };
}

const sheet = calculateEmployee({ employee: person(), salaries: salary, settings: exampleSettings() });
const amountOf = (id) => sheet.lines.find((row) => row.id === id).amount;
assert.equal(amountOf('fastlonn'), 950000);
assert.equal(amountOf('feriepenger'), 104500);
assert.equal(amountOf('aga-direkte'), 141761.4);
assert.equal(amountOf('aga-ferie'), 14734.5);
assert.equal(amountOf('pensjon-lav'), 46206.8);
assert.equal(amountOf('pensjon-hoy'), 3103.68);
assert.equal(sheet.direct, 1005400);
assert.equal(sheet.indirect, 348276.38);
assert.equal(sheet.overhead, 173920.33);
assert.equal(sheet.revenue, 2116000);
assert.equal(sheet.billableHours, 1840);
assert.equal(sheet.profit, 2116000 - sheet.totalCost);

const half = calculateEmployee({
  employee: person({ company: { workPercent: '50' } }),
  salaries: salary,
  settings: exampleSettings(),
});
assert.equal(half.lines.find((row) => row.id === 'fastlonn').amount, 950000);
assert.equal(half.hours, 920);
assert.equal(half.revenue, 1058000);

const overridden = calculateEmployee({
  employee: person(),
  salaries: salary,
  settings: setEmployeeAmount(exampleSettings(), 'e1', 'bil', 0),
});
assert.equal(overridden.lines.find((row) => row.id === 'bil').amount, 0);
assert.equal(overridden.lines.find((row) => row.id === 'bil').source, 'override');
assert.equal(overridden.direct, 955400);

const hidden = calculateEmployee({
  employee: person(),
  salaries: salary,
  settings: hideEmployeeLine(exampleSettings(), 'e1', 'bil'),
});
assert.equal(hidden.lines.some((row) => row.id === 'bil'), false);
assert.equal(hidden.direct, 955400);

const holidayOverride = calculateEmployee({
  employee: person(),
  salaries: salary,
  settings: setEmployeeAmount(exampleSettings(), 'e1', 'feriepenger', 100000),
});
assert.equal(holidayOverride.lines.find((row) => row.id === 'feriepenger').amount, 104500);
assert.equal(holidayOverride.lines.find((row) => row.id === 'feriepenger').editable, false);
assert.equal(holidayOverride.lines.find((row) => row.id === 'aga-ferie').amount, 14734.5);

const withExtra = calculateEmployee({
  employee: person(),
  salaries: salary,
  settings: addEmployeeExtra(exampleSettings(), 'e1', { id: 'x1', group: 'direct', label: 'Egen', amount: 1000 }),
});
assert.equal(withExtra.direct, 1006400);
assert.equal(withExtra.lines.find((row) => row.id === 'aga-direkte').amount, Math.round(1006400 * 0.141 * 100) / 100);

const percentSettings = addStandardLine(exampleSettings(), {
  id: 'pct1',
  group: 'indirect',
  label: 'Tillegg',
  kind: 'percent',
  percent: 0.02,
  base: 'direct',
});
const percented = calculateEmployee({ employee: person(), salaries: salary, settings: percentSettings });
assert.equal(percented.lines.find((row) => row.id === 'pct1').amount, 20108);

const custom = setVariable(addCustomVariable(exampleSettings(), {
  id: 'kurs-sats',
  label: 'Kurssats',
  unit: 'amount',
  value: 15000,
}), 'kurs-sats', 15000);
const linked = {
  ...custom,
  standardLines: custom.standardLines.map((row) => (
    row.id === 'kurs' ? { ...row, variableId: 'kurs-sats' } : row
  )),
};
assert.equal(
  calculateEmployee({ employee: person(), salaries: salary, settings: linked }).lines.find((row) => row.id === 'kurs').amount,
  15000,
);

const kept = removeStandardLine(defaults, 'fastlonn');
assert.equal(kept.standardLines.some((row) => row.id === 'fastlonn'), true);
const dropped = removeStandardLine(addStandardLine(defaults, { id: 'egen', label: 'Egen', kind: 'input', defaultAmount: 10 }), 'egen');
assert.equal(dropped.standardLines.some((row) => row.id === 'egen'), false);

const income = calculateEmployee({
  employee: person(),
  salaries: salary,
  settings: setEmployeeIncome(exampleSettings(), 'e1', { billableRate: 1000, billablePercent: 0.5 }),
});
assert.equal(income.rate, 1000);
assert.equal(income.billableHours, 920);
assert.equal(income.revenue, 920000);
assert.equal(income.rateSource, 'override');

const zeroPosition = calculateEmployee({
  employee: person({ company: { workPercent: '0' } }),
  salaries: salary,
  settings: exampleSettings(),
});
assert.equal(zeroPosition.position, 0);
assert.equal(zeroPosition.hours, 0);

const project = { id: 'p1', pricingSettings: { hourlyRate: 2000 } };
const entries = [
  { projectId: 'p1', employeeId: 'e1', employeeName: 'Kari Nordmann', hours: 100, billableHours: 80, date: '2026-03-01', timeType: 'ordinary' },
  { projectId: 'p1', employeeId: 'e1', hours: 10, billableHours: 10, date: '2026-03-02', timeType: 'overtime_50' },
  { projectId: 'annet', employeeId: 'e1', hours: 40, billableHours: 40, date: '2026-03-03', timeType: 'ordinary' },
];
const earned = projectEarnings({
  project,
  entries,
  employees: [person()],
  salaries: salary,
  settings: exampleSettings(),
});
assert.equal(earned.rows.length, 1);
assert.equal(earned.rows[0].hours, 110);
assert.equal(earned.rows[0].billableHours, 90);
assert.equal(earned.rows[0].revenue, 190000);
assert.equal(earned.rows[0].rateExact, true);
assert.equal(earned.rows[0].name, 'Kari Nordmann');
assert.equal(earned.rows[0].cost, Math.round(sheet.totalCost * (110 / 1840) * 100) / 100);

const indexed = projectEarnings({
  project: { id: 'p1', contractId: 'c1', pricingSettings: { hourlyRate: 2000 } },
  entries: [{ projectId: 'p1', employeeId: 'e1', hours: 8, billableHours: 8, date: '2026-04-01', timeType: 'ordinary' }],
  employees: [person()],
  salaries: salary,
  settings: exampleSettings(),
  contracts: [{ id: 'c1', projectId: 'p1', priceVersions: [{ validFrom: '2026-01-01', rateExVat: 1800 }] }],
});
assert.equal(indexed.rows[0].revenue, 14400);
assert.equal(exactHourlyRate({ id: 'p1', pricingSettings: {} }, '2026-04-01', []), null);

const estimated = projectEarnings({
  project: { id: 'p1', pricingSettings: {} },
  entries: [{ projectId: 'p1', employeeId: 'e1', hours: 8, billableHours: 8, date: '2026-04-01', timeType: 'ordinary' }],
  employees: [person()],
  salaries: salary,
  settings: exampleSettings(),
});
assert.equal(estimated.rows[0].revenue, 9200);
assert.equal(estimated.rows[0].rateExact, false);

const unallocated = projectEarnings({
  project,
  entries: [{ projectId: 'p1', employeeId: 'e1', hours: 8, billableHours: 8, date: '2026-04-01', timeType: 'ordinary' }],
  employees: [person()],
  salaries: salary,
  settings: defaults,
});
assert.equal(unallocated.rows[0].cost, null);
assert.equal(unallocated.totals.cost, null);
assert.equal(unallocated.rows[0].revenue, 16000);

const fromCalendar = calculateEmployee({
  employee: person(),
  salaries: salary,
  settings: defaults,
  yearHours: 1600,
});
assert.equal(fromCalendar.hours, 1600);
assert.equal(fromCalendar.lines.find((row) => row.id === 'feriepenger').source, 'formula');

const capacity = yearCapacity(person(), null, { year: 2026 });
assert.equal(capacity.year, 2026);
assert.equal(capacity.vacationDays, 25);
assert.ok(capacity.gross > capacity.hours);
assert.ok(capacity.hours > 1400 && capacity.hours < 1900);
assert.equal(yearCapacity(person({ company: { workPercent: '0' } }), null, { year: 2026 }).hours, 0);

const hiredPerson = person({
  id: 'h1',
  company: { personnelKind: 'innleid', status: 'active', workPercent: '100', title: 'Konsulent' },
});
assert.equal(earningsAudience(person()), 'ansatte');
assert.equal(earningsAudience(person({ company: { status: 'inactive' } })), '');
assert.equal(earningsAudience(hiredPerson), 'innleide');
assert.equal(earningsAudience(person({ company: { personnelKind: 'external', status: 'active' } })), 'innleide');
const hired = calculateHired({
  employee: hiredPerson,
  settings: setEmployeeIncome(defaults, 'h1', { purchaseRate: 800, billableRate: 1200, billablePercent: 1 }),
  yearHours: 100,
});
assert.equal(hired.kind, 'hired');
assert.equal(hired.lines.length, 0);
assert.equal(hired.totalCost, 80000);
assert.equal(hired.revenue, 120000);
assert.equal(hired.profit, 40000);
assert.equal(hired.purchaseRate, 800);

assert.deepEqual(grunnbelopPeriod('2026-05-01'), { from: '2026-05-01', to: '2027-04-30' });
assert.equal(grunnbelopIsStale({ grunnbelopFetchedAt: '', grunnbelopTo: '2027-04-30' }, new Date(2026, 9, 21)), true);
assert.equal(grunnbelopIsStale({ grunnbelopFetchedAt: '2026-05-02', grunnbelopTo: '2027-04-30' }, new Date(2026, 9, 21)), false);
assert.equal(grunnbelopIsStale({ grunnbelopFetchedAt: '2026-05-02', grunnbelopTo: '2027-04-30' }, new Date(2027, 4, 1)), true);
const fetched = await fetchGrunnbelop(async () => ({
  ok: true,
  json: async () => ({ dato: '2026-05-01', grunnbeloep: 140000 }),
}), new Date(2026, 9, 21));
assert.equal(fetched.grunnbelop, 140000);
assert.equal(fetched.grunnbelopFrom, '2026-05-01');
assert.equal(fetched.grunnbelopTo, '2027-04-30');
assert.equal(fetched.grunnbelopFetchedAt, '2026-10-21');
const stamped = setGrunnbelop(defaults, fetched);
assert.equal(stamped.variables.grunnbelop, 140000);
assert.equal(stamped.variables.grunnbelopFetchedAt, '2026-10-21');
assert.equal(stamped.variables.feriepengerRate, defaults.variables.feriepengerRate);

console.log('earnings.test.mjs: ok');
