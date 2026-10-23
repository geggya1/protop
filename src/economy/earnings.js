/**
 * Inntjening per ansatt.
 * Lønn, stillingsprosent og navn kommer fra den ansatte og HR.
 * På prosjekt kommer timer og timepris fra føringene og avtalen.
 * Øvrige kostnader er standardsatser bedriften setter selv. De starter på 0.
 * Et eksempelark er bare modell for feltene, og tallene derfra brukes ikke.
 */

import { toDateKey } from '../arbeid/calendar.js';
import { norwegianHolidays } from '../arbeid/holidays.js';
import { roundHours } from '../arbeid/hours.js';
import { rateWithOvertime } from '../arbeid/overtime.js';
import { scheduledHours } from '../arbeid/schedule.js';
import { emptyVacationPlan, vacationQuota } from '../arbeid/vacationPlan.js';
import { employeeActivityTab, employeeDirectoryBucket, isDeletedEmployee } from '../employees/model.js';
import { currentSalaryFor } from '../hr/model.js';
import { rateOnDate } from '../indeksregulering/cases.js';
import { roundMoney } from './vat.js';

export const EARNINGS_GROUPS = [
  { id: 'direct', label: 'Direkte lønnskostnader' },
  { id: 'indirect', label: 'Indirekte lønnskostnader' },
  { id: 'overhead', label: 'Personalkostnader' },
];

export const VARIABLE_FIELDS = [
  { id: 'grunnbelop', label: 'Grunnbeløp (G)', unit: 'amount', hidden: true },
  { id: 'feriepengerRate', label: 'Feriepengesats', unit: 'percent' },
  { id: 'feriepengerMonths', label: 'Feriepengegrunnlag, måneder', unit: 'number', hint: '11 trekker fra én termin' },
  { id: 'agaRate', label: 'Arbeidsgiveravgift', unit: 'percent' },
  { id: 'pensionFloorG', label: 'Pensjon fra', unit: 'g' },
  { id: 'pensionMidG', label: 'Pensjon lav sats til', unit: 'g' },
  { id: 'pensionTopG', label: 'Pensjon høy sats til', unit: 'g' },
  { id: 'pensionLowRate', label: 'Pensjon lav sats', unit: 'percent' },
  { id: 'pensionHighRate', label: 'Pensjon høy sats', unit: 'percent' },
  { id: 'normHours', label: 'Normtimer per år', unit: 'number', hidden: true },
  { id: 'defaultBillableRate', label: 'Standard timepris', unit: 'amount' },
  { id: 'defaultBillablePercent', label: 'Standard faktureringsgrad', unit: 'percent', hidden: true },
  { id: 'defaultPurchaseRate', label: 'Standard innkjøpspris', unit: 'amount', hired: true },
];

const VARIABLE_IDS = new Set(VARIABLE_FIELDS.map((row) => row.id));

export function defaultVariables() {
  return {
    // Gjeldende grunnbeløp fra 1. mai 2026. Bedriften kan sette et annet.
    grunnbelop: 136549,
    grunnbelopFrom: '2026-05-01',
    grunnbelopTo: '2027-04-30',
    grunnbelopFetchedAt: '',
    feriepengerRate: 0.12,
    feriepengerMonths: 11,
    agaRate: 0.141,
    pensionFloorG: 0,
    pensionMidG: 7.1,
    pensionTopG: 12,
    pensionLowRate: 0.05,
    pensionHighRate: 0.12,
    normHours: 0,
    defaultBillableRate: 0,
    defaultBillablePercent: 0,
    defaultPurchaseRate: 0,
  };
}

function line(partial) {
  return {
    id: '',
    group: 'overhead',
    label: '',
    kind: 'input',
    formula: '',
    defaultAmount: 0,
    percent: null,
    base: 'direct',
    variableId: '',
    enabled: true,
    locked: false,
    ...partial,
  };
}

/** Feltkatalogen. Beløpene er 0 til bedriften lagrer egne satser. */
export function defaultStandardLines() {
  return [
    line({ id: 'fastlonn', group: 'direct', label: 'Fastlønn', kind: 'salary', locked: true }),
    line({ id: 'overtid', group: 'direct', label: 'Overtid', kind: 'input' }),
    line({ id: 'bonus', group: 'direct', label: 'Bonus', kind: 'input' }),
    line({ id: 'bil', group: 'direct', label: 'Fast bil-/reisekostnad', kind: 'input' }),
    line({ id: 'hjemmekontor', group: 'direct', label: 'Hjemmekontor', kind: 'input' }),
    line({ id: 'annen', group: 'direct', label: 'Annen godtgjørelse', kind: 'input' }),
    line({ id: 'bonus2', group: 'direct', label: 'Bonus', kind: 'input' }),
    line({ id: 'feriepenger', group: 'indirect', label: 'Feriepenger', kind: 'formula', formula: 'feriepenger', locked: true }),
    line({ id: 'aga-direkte', group: 'indirect', label: 'Aga. Direkte lønnskostnader', kind: 'formula', formula: 'agaDirect', locked: true }),
    line({ id: 'aga-ferie', group: 'indirect', label: 'Aga. Feriepenger', kind: 'formula', formula: 'agaHoliday', locked: true }),
    line({ id: 'pensjon-lav', group: 'indirect', label: 'Pensjon lav sats', kind: 'formula', formula: 'pensionLow', locked: true }),
    line({ id: 'pensjon-hoy', group: 'indirect', label: 'Pensjon høy sats', kind: 'formula', formula: 'pensionHigh', locked: true }),
    line({ id: 'forsikring', group: 'indirect', label: 'Personal- og yrkeforsikring', kind: 'input' }),
    line({ id: 'edb', group: 'overhead', label: 'EDB', kind: 'input' }),
    line({ id: 'mobil', group: 'overhead', label: 'Mobiltelefon', kind: 'input' }),
    line({ id: 'klaer', group: 'overhead', label: 'Arbeidsklær', kind: 'input' }),
    line({ id: 'kontor', group: 'overhead', label: 'Kontor', kind: 'input' }),
    line({ id: 'kurs', group: 'overhead', label: 'Kurskostnad', kind: 'input' }),
    line({ id: 'regnskap', group: 'overhead', label: 'Regnskapshonorar', kind: 'input' }),
    line({ id: 'revisjon', group: 'overhead', label: 'Revisjonskostnad', kind: 'input' }),
    line({ id: 'lunsj', group: 'overhead', label: 'Lunsjkostnader', kind: 'input' }),
    line({ id: 'telefon', group: 'overhead', label: 'Telefonkostnader', kind: 'input' }),
    line({ id: 'sosialt', group: 'overhead', label: 'Firmabur / sosialt', kind: 'input' }),
    line({ id: 'programvare', group: 'overhead', label: 'Programvare', kind: 'input' }),
    line({ id: 'poolbil', group: 'overhead', label: 'Poolbiler', kind: 'input' }),
  ];
}

function num(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

export function newEarningsId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeLine(row, fallback) {
  const base = fallback || {};
  const kind = ['salary', 'input', 'formula', 'percent'].includes(row?.kind)
    ? row.kind
    : (base.kind || 'input');
  const group = EARNINGS_GROUPS.some((item) => item.id === row?.group)
    ? row.group
    : (base.group || 'overhead');
  return line({
    ...base,
    id: text(row?.id || base.id),
    group,
    label: text(row?.label || base.label) || 'Linje',
    kind: base.locked ? base.kind : kind,
    formula: base.locked ? (base.formula || '') : text(row?.formula || base.formula),
    defaultAmount: roundMoney(num(row?.defaultAmount, base.defaultAmount || 0)),
    percent: row?.percent == null && base.percent == null ? null : num(row?.percent, base.percent || 0),
    base: ['salary', 'direct', 'holiday'].includes(row?.base) ? row.base : (base.base || 'direct'),
    variableId: text(row?.variableId || base.variableId),
    enabled: row?.enabled == null ? base.enabled !== false : !!row.enabled,
    locked: !!base.locked,
  });
}

function normalizeVariable(row) {
  const unit = ['amount', 'percent', 'number'].includes(row?.unit) ? row.unit : 'amount';
  return {
    id: text(row?.id) || newEarningsId('var'),
    label: text(row?.label) || 'Variabel',
    unit,
    value: num(row?.value, 0),
  };
}

function normalizeEmployeeSetup(row) {
  const amounts = {};
  const source = row?.amounts && typeof row.amounts === 'object' ? row.amounts : {};
  for (const [key, value] of Object.entries(source)) {
    if (!text(key)) continue;
    amounts[text(key)] = roundMoney(num(value, 0));
  }
  const extras = (Array.isArray(row?.extras) ? row.extras : []).map((extra) => ({
    id: text(extra?.id) || newEarningsId('extra'),
    group: EARNINGS_GROUPS.some((item) => item.id === extra?.group) ? extra.group : 'overhead',
    label: text(extra?.label) || 'Egen linje',
    amount: roundMoney(num(extra?.amount, 0)),
  })).filter((extra) => extra.id);
  return {
    amounts,
    hidden: (Array.isArray(row?.hidden) ? row.hidden : []).map(text).filter(Boolean),
    extras,
    billableRate: row?.billableRate == null || row?.billableRate === '' ? null : roundMoney(num(row.billableRate, 0)),
    billablePercent: row?.billablePercent == null || row?.billablePercent === '' ? null : num(row.billablePercent, 0),
    purchaseRate: row?.purchaseRate == null || row?.purchaseRate === '' ? null : roundMoney(num(row.purchaseRate, 0)),
    agreedHours: row?.agreedHours == null || row?.agreedHours === '' ? null : roundHours(num(row.agreedHours, 0)),
  };
}

export function defaultEarningsSettings() {
  return {
    version: 1,
    variables: defaultVariables(),
    customVariables: [],
    standardLines: defaultStandardLines(),
    employees: {},
  };
}

export function normalizeEarningsSettings(raw) {
  const defaults = defaultEarningsSettings();
  const source = raw && typeof raw === 'object' ? raw : {};
  const variables = { ...defaults.variables };
  for (const field of VARIABLE_FIELDS) {
    if (source.variables && source.variables[field.id] != null && source.variables[field.id] !== '') {
      variables[field.id] = num(source.variables[field.id], variables[field.id]);
    }
  }
  for (const key of ['grunnbelopFrom', 'grunnbelopTo', 'grunnbelopFetchedAt']) {
    const raw = source.variables?.[key];
    if (raw == null || raw === '') continue;
    variables[key] = String(raw).slice(0, 10);
  }
  const storedLines = new Map((Array.isArray(source.standardLines) ? source.standardLines : []).map((row) => [text(row?.id), row]));
  const standardLines = defaultStandardLines().map((item) => normalizeLine(storedLines.get(item.id) || item, item));
  for (const row of storedLines.values()) {
    if (!row?.id || standardLines.some((item) => item.id === text(row.id))) continue;
    standardLines.push(normalizeLine(row));
  }
  const employees = {};
  const people = source.employees && typeof source.employees === 'object' ? source.employees : {};
  for (const [id, setup] of Object.entries(people)) {
    if (!text(id)) continue;
    employees[text(id)] = normalizeEmployeeSetup(setup);
  }
  return {
    version: 1,
    variables,
    customVariables: (Array.isArray(source.customVariables) ? source.customVariables : []).map(normalizeVariable),
    standardLines,
    employees,
  };
}

/**
 * Intern (ansatte) eller ekstern (innleide) etter samme inndeling som Ansatt-siden og timelisten.
 * Uavhengig av aktiv/deaktivert. Tom for slettede.
 */
export function earningsSection(employee) {
  if (!employee) return '';
  const bucket = employeeDirectoryBucket(employee);
  if (bucket === 'trash') return '';
  return bucket === 'external' ? 'innleide' : 'ansatte';
}

/** Aktive eller deaktiverte, som i timelisten. Tom for slettede. */
export function earningsStatus(employee) {
  const tab = employeeActivityTab(employee);
  return tab === 'trash' ? '' : tab;
}

export function earningsAudience(employee) {
  if (earningsStatus(employee) !== 'active') return '';
  return earningsSection(employee);
}

/**
 * Disponible arbeidstimer i året.
 * Hverdager etter personens tidsplan, minus helligdager og feriedager.
 * Stillingsprosenten ligger allerede i tidsplanen, så timene skal ikke ganges en gang til.
 */
export function availableYearHours(employee, { year, vacationDays = 0, holidayDates } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const rawPercent = String(employee?.company?.workPercent ?? '').replace('%', '').trim();
  const vacation = Math.max(0, Number(vacationDays) || 0);
  if (rawPercent === '0') {
    return { year: y, gross: 0, vacationDays: vacation, vacationHours: 0, hours: 0 };
  }
  const off = new Set(
    holidayDates
      ? [...holidayDates]
      : norwegianHolidays(y).map((row) => row.date),
  );
  let gross = 0;
  let sampled = 0;
  let sampledHours = 0;
  for (let month = 0; month < 12; month += 1) {
    const days = new Date(y, month + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(y, month, day);
      if (off.has(toDateKey(date))) continue;
      const hours = scheduledHours(employee, date);
      gross = roundHours(gross + hours);
      if (hours > 0) {
        sampled += 1;
        sampledHours = roundHours(sampledHours + hours);
      }
    }
  }
  const typical = sampled ? sampledHours / sampled : 0;
  const vacationHours = roundHours(vacation * typical);
  return {
    year: y,
    gross,
    vacationDays: vacation,
    vacationHours,
    hours: roundHours(Math.max(0, gross - vacationHours)),
  };
}

/** Feriedager fra ferieplanen, deretter disponible timer. */
export function yearCapacity(employee, plan, { year, today } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const quota = vacationQuota(employee, plan || emptyVacationPlan(y), { today: today || `${y}-12-31` });
  return availableYearHours(employee, { year: y, vacationDays: quota.total });
}

function hoursFromInput(yearHours) {
  if (yearHours == null || yearHours === '') return null;
  if (typeof yearHours === 'number') return roundHours(yearHours);
  if (typeof yearHours === 'object' && yearHours.hours != null) return roundHours(yearHours.hours);
  return null;
}

export function workFraction(employee) {
  const raw = String(employee?.company?.workPercent ?? '').replace('%', '').trim();
  if (!raw) return 1;
  const n = num(raw, 100);
  if (n <= 0) return 0;
  return n > 1 ? n / 100 : n;
}

export function salaryForEmployee(employeeId, salaries) {
  const row = currentSalaryFor(employeeId, salaries || []);
  return {
    amount: roundMoney(row?.annualAmount || 0),
    from: row?.effectiveDate || '',
    currency: row?.currency || 'NOK',
    missing: !row,
  };
}

function variableValue(settings, id) {
  const custom = (settings?.customVariables || []).find((row) => row.id === id);
  if (custom) return num(custom.value, 0);
  if (VARIABLE_IDS.has(id)) return num(settings?.variables?.[id], 0);
  return null;
}

function lineDefault(lineRow, settings) {
  if (lineRow.variableId) {
    const value = variableValue(settings, lineRow.variableId);
    if (value != null) return value;
  }
  return num(lineRow.defaultAmount, 0);
}

function pensionBand(salary, fromG, toG, grunnbelop) {
  const from = roundMoney(num(fromG, 0) * num(grunnbelop, 0));
  const to = roundMoney(num(toG, 0) * num(grunnbelop, 0));
  return Math.max(0, Math.min(salary, to) - Math.min(salary, from));
}

function formulaAmount(formula, ctx) {
  const { salary, direct, holiday, variables } = ctx;
  if (formula === 'feriepenger') {
    const months = num(variables.feriepengerMonths, 11);
    return roundMoney(salary * (months / 12) * num(variables.feriepengerRate, 0));
  }
  if (formula === 'agaDirect') return roundMoney(direct * num(variables.agaRate, 0));
  if (formula === 'agaHoliday') return roundMoney(holiday * num(variables.agaRate, 0));
  if (formula === 'pensionLow') {
    const base = pensionBand(salary, variables.pensionFloorG, variables.pensionMidG, variables.grunnbelop);
    return roundMoney(base * num(variables.pensionLowRate, 0));
  }
  if (formula === 'pensionHigh') {
    const base = pensionBand(salary, variables.pensionMidG, variables.pensionTopG, variables.grunnbelop);
    return roundMoney(base * num(variables.pensionHighRate, 0));
  }
  return 0;
}

function percentAmount(lineRow, settings, ctx) {
  const percent = lineRow.variableId && variableValue(settings, lineRow.variableId) != null
    ? variableValue(settings, lineRow.variableId)
    : num(lineRow.percent, 0);
  const base = lineRow.base === 'salary'
    ? ctx.salary
    : lineRow.base === 'holiday'
      ? ctx.holiday
      : ctx.direct;
  return roundMoney(base * percent);
}

function pushLine(rows, group, entry) {
  rows.push({ group, ...entry });
}

/**
 * Full kalkyle for én ansatt. Beløp i kroner per år.
 */
export function calculateEmployee({ employee, salaries, settings, yearHours } = {}) {
  const setup = normalizeEarningsSettings(settings);
  const person = normalizeEmployeeSetup(setup.employees?.[employee?.id] || {});
  const salaryInfo = salaryForEmployee(employee?.id, salaries);
  const hidden = new Set(person.hidden);
  const variables = setup.variables;
  const rows = [];
  let salary = 0;
  let direct = 0;

  for (const item of setup.standardLines) {
    if (item.group !== 'direct' || !item.enabled || hidden.has(item.id)) continue;
    let amount = 0;
    let source = item.kind;
    if (item.kind === 'salary') {
      amount = salaryInfo.amount;
      salary = amount;
      source = 'salary';
    } else if (Object.prototype.hasOwnProperty.call(person.amounts, item.id)) {
      amount = person.amounts[item.id];
      source = 'override';
    } else {
      amount = roundMoney(lineDefault(item, setup));
      source = 'standard';
    }
    direct = roundMoney(direct + amount);
    pushLine(rows, 'direct', {
      id: item.id,
      label: item.label,
      amount,
      source,
      kind: item.kind,
      editable: item.kind === 'input',
    });
  }
  for (const extra of person.extras.filter((row) => row.group === 'direct')) {
    direct = roundMoney(direct + extra.amount);
    pushLine(rows, 'direct', {
      id: extra.id,
      label: extra.label,
      amount: extra.amount,
      source: 'extra',
      kind: 'input',
      editable: true,
      extra: true,
    });
  }

  let holiday = 0;
  const later = setup.standardLines.filter((item) => item.group !== 'direct');
  const resolved = { salary, direct, holiday, variables };
  for (const item of later) {
    if (!item.enabled || hidden.has(item.id)) continue;
    let amount = 0;
    let source = item.kind;
    const calculated = item.kind === 'formula' || item.kind === 'percent';
    if (!calculated && Object.prototype.hasOwnProperty.call(person.amounts, item.id)) {
      amount = person.amounts[item.id];
      source = 'override';
    } else if (item.kind === 'formula') {
      amount = formulaAmount(item.formula, resolved);
      source = 'formula';
    } else if (item.kind === 'percent') {
      amount = percentAmount(item, setup, resolved);
      source = 'percent';
    } else {
      amount = roundMoney(lineDefault(item, setup));
      source = 'standard';
    }
    if (item.formula === 'feriepenger') holiday = amount;
    resolved.holiday = holiday;
    pushLine(rows, item.group, {
      id: item.id,
      label: item.label,
      amount,
      source,
      kind: item.kind,
      editable: item.kind === 'input',
      rateLabel: rateLabel(item, variables, source),
    });
  }
  for (const extra of person.extras.filter((row) => row.group !== 'direct')) {
    pushLine(rows, extra.group, {
      id: extra.id,
      label: extra.label,
      amount: extra.amount,
      source: 'extra',
      kind: 'input',
      editable: true,
      extra: true,
    });
  }

  const sum = (group) => roundMoney(rows.filter((row) => row.group === group).reduce((acc, row) => acc + row.amount, 0));
  const directSum = sum('direct');
  const indirectSum = sum('indirect');
  const overheadSum = sum('overhead');
  const totalCost = roundMoney(directSum + indirectSum + overheadSum);
  const position = workFraction(employee);
  const knownHours = hoursFromInput(yearHours);
  const hours = knownHours == null
    ? roundHours(num(variables.normHours, 0) * position)
    : knownHours;
  const billablePercent = person.billablePercent == null
    ? num(variables.defaultBillablePercent, 1)
    : num(person.billablePercent, 0);
  const billableHours = roundHours(hours * billablePercent);
  const rate = person.billableRate == null
    ? roundMoney(num(variables.defaultBillableRate, 0))
    : roundMoney(person.billableRate);
  const revenue = roundMoney(rate * billableHours);
  const profit = roundMoney(revenue - totalCost);
  return {
    kind: 'staff',
    employeeId: employee?.id || '',
    salary: salaryInfo,
    position,
    lines: rows,
    direct: directSum,
    indirect: indirectSum,
    overhead: overheadSum,
    indirectRatio: directSum ? indirectSum / directSum : null,
    overheadRatio: directSum ? overheadSum / directSum : null,
    totalCost,
    hours,
    billablePercent,
    billableHours,
    rate,
    rateSource: person.billableRate == null ? 'standard' : 'override',
    percentSource: person.billablePercent == null ? 'standard' : 'override',
    revenue,
    profit,
    margin: revenue ? profit / revenue : null,
    breakEvenRate: billableHours ? roundMoney(totalCost / billableHours) : null,
  };
}

function rateLabel(item, variables, source) {
  if (source === 'override') return 'Individuell';
  if (item.formula === 'feriepenger') {
    return `${pct(variables.feriepengerRate)} av ${num(variables.feriepengerMonths, 11)}/12`;
  }
  if (item.formula === 'agaDirect' || item.formula === 'agaHoliday') return pct(variables.agaRate);
  if (item.formula === 'pensionLow') {
    return `${pct(variables.pensionLowRate)} · ${num(variables.pensionFloorG)}–${num(variables.pensionMidG)}G`;
  }
  if (item.formula === 'pensionHigh') {
    return `${pct(variables.pensionHighRate)} · ${num(variables.pensionMidG)}–${num(variables.pensionTopG)}G`;
  }
  if (item.kind === 'percent') return pct(item.percent);
  return '';
}

export function pct(value) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(Number(value) * 100)} %`;
}

/** Innleid og eksternt personell kjøpes til avtalt timehonorar. Ingen lønnsformel. */
export function calculateHired({ employee, settings, yearHours } = {}) {
  const setup = normalizeEarningsSettings(settings);
  const person = normalizeEmployeeSetup(setup.employees?.[employee?.id] || {});
  const variables = setup.variables;
  const knownHours = hoursFromInput(yearHours);
  const hours = person.agreedHours == null
    ? roundHours(knownHours == null ? 0 : knownHours)
    : roundHours(person.agreedHours);
  const purchaseRate = person.purchaseRate == null
    ? roundMoney(num(variables.defaultPurchaseRate, 0))
    : roundMoney(person.purchaseRate);
  const billablePercent = person.billablePercent == null
    ? num(variables.defaultBillablePercent, 0)
    : num(person.billablePercent, 0);
  const rate = person.billableRate == null
    ? roundMoney(num(variables.defaultBillableRate, 0))
    : roundMoney(person.billableRate);
  const billableHours = roundHours(hours * billablePercent);
  const totalCost = roundMoney(purchaseRate * hours);
  const revenue = roundMoney(rate * billableHours);
  const profit = roundMoney(revenue - totalCost);
  return {
    kind: 'hired',
    employeeId: employee?.id || '',
    salary: { amount: 0, missing: false, from: '', currency: 'NOK' },
    position: workFraction(employee),
    lines: [],
    direct: totalCost,
    indirect: 0,
    overhead: 0,
    indirectRatio: null,
    overheadRatio: null,
    totalCost,
    hours,
    hoursSource: person.agreedHours == null ? 'calendar' : 'override',
    purchaseRate,
    purchaseSource: person.purchaseRate == null ? 'standard' : 'override',
    billablePercent,
    billableHours,
    rate,
    rateSource: person.billableRate == null ? 'standard' : 'override',
    percentSource: person.billablePercent == null ? 'standard' : 'override',
    revenue,
    profit,
    margin: revenue ? profit / revenue : null,
    breakEvenRate: billableHours ? roundMoney(totalCost / billableHours) : null,
  };
}

export function calculateRoster({ employees, salaries, settings, yearHoursById, audience, status = 'active' } = {}) {
  return (employees || [])
    .filter((row) => {
      if (!row || isDeletedEmployee(row)) return false;
      if (status && status !== 'all' && earningsStatus(row) !== status) return false;
      return !audience || earningsSection(row) === audience;
    })
    .map((employee) => {
      const known = yearHoursById && Object.prototype.hasOwnProperty.call(yearHoursById, employee.id)
        ? yearHoursById[employee.id]
        : undefined;
      if ((audience || earningsSection(employee)) === 'innleide') {
        return calculateHired({ employee, settings, yearHours: known });
      }
      return calculateEmployee({ employee, salaries, settings, yearHours: known });
    })
    .sort((a, b) => String(a.employeeId).localeCompare(String(b.employeeId)));
}

function versionsForProject(project, contracts) {
  return (Array.isArray(contracts) ? contracts : []).flatMap((row) => {
    if (!row) return [];
    const linked = (project?.id && row.projectId === project.id)
      || (project?.contractId && row.id === project.contractId);
    if (!linked) return [];
    return Array.isArray(row.priceVersions) ? row.priceVersions : [];
  });
}

/** Eksakt timepris fra prisversjon eller prosjektets timepris. Null når den mangler. */
export function exactHourlyRate(project, date, contracts = []) {
  const indexed = rateOnDate(versionsForProject(project, contracts), date);
  if (indexed != null && indexed > 0) return indexed;
  const pricing = project?.pricingSettings || {};
  const rate = Number(pricing.hourlyRate ?? pricing.ensTimepris ?? pricing.rate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return null;
}

/**
 * Prosjektets inntjening. Kostnad fordeles med timene mot årsnormen.
 * Honorar bruker eksakt timepris på hver føring.
 */
export function projectEarnings({
  project,
  entries = [],
  employees = [],
  salaries,
  settings,
  contracts = [],
  yearHoursById,
} = {}) {
  const byEmployee = new Map();
  for (const row of entries || []) {
    if (!row || row.projectId !== project?.id) continue;
    const id = text(row.employeeId);
    if (!id) continue;
    if (!byEmployee.has(id)) byEmployee.set(id, []);
    byEmployee.get(id).push(row);
  }
  const people = new Map((employees || []).map((row) => [row.id, row]));
  const ids = new Set([...byEmployee.keys()]);
  const result = [];
  for (const employeeId of ids) {
    const employee = people.get(employeeId) || { id: employeeId, person: { firstName: '' }, company: {} };
    const known = yearHoursById && Object.prototype.hasOwnProperty.call(yearHoursById, employeeId)
      ? yearHoursById[employeeId]
      : undefined;
    const annual = earningsSection(employee) === 'innleide'
      ? calculateHired({ employee, settings, yearHours: known })
      : calculateEmployee({ employee, salaries, settings, yearHours: known });
    let hours = 0;
    let billableHours = 0;
    let revenue = 0;
    let exactHours = 0;
    let fallbackHours = 0;
    for (const row of byEmployee.get(employeeId)) {
      const worked = roundHours(row.hours);
      const billable = roundHours(row.billableHours == null ? row.hours : row.billableHours);
      hours = roundHours(hours + worked);
      billableHours = roundHours(billableHours + billable);
      const exact = exactHourlyRate(project, row.date, contracts);
      const rate = exact == null ? annual.rate : rateWithOvertime(exact, row.timeType || 'ordinary');
      if (exact == null) fallbackHours = roundHours(fallbackHours + billable);
      else exactHours = roundHours(exactHours + billable);
      revenue = roundMoney(revenue + billable * rate);
    }
    const share = annual.kind === 'hired' || !(annual.hours > 0) ? null : hours / annual.hours;
    const cost = annual.kind === 'hired'
      ? roundMoney(annual.purchaseRate * hours)
      : (share == null ? null : roundMoney(annual.totalCost * share));
    const profit = cost == null ? null : roundMoney(revenue - cost);
    result.push({
      employeeId,
      name: text(rowName(employee, byEmployee.get(employeeId)[0])),
      hours,
      billableHours,
      billablePercent: hours ? billableHours / hours : 0,
      rate: billableHours ? roundMoney(revenue / billableHours) : null,
      rateExact: fallbackHours === 0 && exactHours > 0,
      revenue,
      cost,
      profit,
      margin: revenue ? profit / revenue : null,
      annualCost: annual.totalCost,
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const costKnown = result.every((row) => row.cost != null);
  const totals = result.reduce((acc, row) => ({
    hours: roundHours(acc.hours + row.hours),
    billableHours: roundHours(acc.billableHours + row.billableHours),
    revenue: roundMoney(acc.revenue + row.revenue),
    cost: costKnown ? roundMoney(acc.cost + row.cost) : null,
    profit: costKnown ? roundMoney(acc.profit + row.profit) : null,
  }), { hours: 0, billableHours: 0, revenue: 0, cost: 0, profit: 0 });
  totals.margin = totals.revenue && totals.profit != null ? totals.profit / totals.revenue : null;
  totals.rate = totals.billableHours ? roundMoney(totals.revenue / totals.billableHours) : null;
  totals.billablePercent = totals.hours ? totals.billableHours / totals.hours : 0;
  return { rows: result, totals };
}

function rowName(employee, entry) {
  const person = employee?.person || {};
  const named = [person.firstName, person.middleName, person.lastName].map(text).filter(Boolean).join(' ');
  return named || text(entry?.employeeName) || 'Uten navn';
}

export function portfolioProjects({
  projects = [],
  contracts = [],
  entries = [],
  employees = [],
  salaries,
  settings,
  yearHoursById,
} = {}) {
  return (projects || [])
    .filter((project) => project && project.status !== 'arkivert' && !project.deletedAt)
    .map((project) => {
      const earned = projectEarnings({
        project,
        entries,
        employees,
        salaries,
        settings,
        contracts,
        yearHoursById,
      });
      const related = (contracts || []).filter((row) => row && (
        (project.id && row.projectId === project.id)
        || (project.contractId && row.id === project.contractId)
      ));
      const contractValue = related.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
      return {
        id: project.id,
        name: text(project.name || project.title) || 'Prosjekt uten navn',
        customer: text(project.customerName || related[0]?.buyer),
        agreements: related.length,
        contractValue,
        hours: earned.totals.hours,
        revenue: earned.totals.revenue,
        cost: earned.totals.cost,
        profit: earned.totals.profit,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

export function setGrunnbelop(settings, patch = {}) {
  const next = normalizeEarningsSettings(settings);
  next.variables = {
    ...next.variables,
    grunnbelop: num(patch.grunnbelop, next.variables.grunnbelop),
    grunnbelopFrom: text(patch.grunnbelopFrom).slice(0, 10) || next.variables.grunnbelopFrom,
    grunnbelopTo: text(patch.grunnbelopTo).slice(0, 10) || next.variables.grunnbelopTo,
    grunnbelopFetchedAt: text(patch.grunnbelopFetchedAt).slice(0, 10),
  };
  return next;
}

export function setVariable(settings, id, value) {
  const next = normalizeEarningsSettings(settings);
  if (VARIABLE_IDS.has(id)) {
    next.variables = { ...next.variables, [id]: num(value, next.variables[id]) };
    return next;
  }
  next.customVariables = next.customVariables.map((row) => (
    row.id === id ? { ...row, value: num(value, row.value) } : row
  ));
  return next;
}

export function addCustomVariable(settings, variable) {
  const next = normalizeEarningsSettings(settings);
  next.customVariables = [...next.customVariables, normalizeVariable({ ...variable, id: variable?.id || newEarningsId('var') })];
  return next;
}

export function removeCustomVariable(settings, id) {
  const next = normalizeEarningsSettings(settings);
  next.customVariables = next.customVariables.filter((row) => row.id !== id);
  next.standardLines = next.standardLines.map((row) => (
    row.variableId === id ? { ...row, variableId: '' } : row
  ));
  return next;
}

export function addStandardLine(settings, input) {
  const next = normalizeEarningsSettings(settings);
  next.standardLines = [...next.standardLines, normalizeLine({
    ...input,
    id: input?.id || newEarningsId('linje'),
    kind: input?.kind === 'percent' ? 'percent' : 'input',
  })];
  return next;
}

export function updateStandardLine(settings, id, patch) {
  const next = normalizeEarningsSettings(settings);
  next.standardLines = next.standardLines.map((row) => (
    row.id === id ? normalizeLine({ ...row, ...patch, id: row.id }, row.locked ? row : null) : row
  ));
  return next;
}

export function removeStandardLine(settings, id) {
  const next = normalizeEarningsSettings(settings);
  next.standardLines = next.standardLines.filter((row) => row.locked || row.id !== id);
  return next;
}

function employeeMap(settings, employeeId, patch) {
  const next = normalizeEarningsSettings(settings);
  const current = next.employees[employeeId] || normalizeEmployeeSetup({});
  next.employees = {
    ...next.employees,
    [employeeId]: normalizeEmployeeSetup({ ...current, ...patch(current) }),
  };
  return next;
}

export function setEmployeeAmount(settings, employeeId, lineId, amount) {
  return employeeMap(settings, employeeId, (current) => ({
    amounts: { ...current.amounts, [lineId]: roundMoney(num(amount, 0)) },
  }));
}

export function clearEmployeeAmount(settings, employeeId, lineId) {
  return employeeMap(settings, employeeId, (current) => {
    const amounts = { ...current.amounts };
    delete amounts[lineId];
    return { amounts };
  });
}

export function addEmployeeExtra(settings, employeeId, extra) {
  return employeeMap(settings, employeeId, (current) => ({
    extras: [...current.extras, {
      id: extra?.id || newEarningsId('extra'),
      group: extra?.group || 'overhead',
      label: extra?.label || 'Egen linje',
      amount: extra?.amount || 0,
    }],
  }));
}

export function removeEmployeeExtra(settings, employeeId, extraId) {
  return employeeMap(settings, employeeId, (current) => ({
    extras: current.extras.filter((row) => row.id !== extraId),
  }));
}

export function updateEmployeeExtra(settings, employeeId, extraId, patch) {
  return employeeMap(settings, employeeId, (current) => ({
    extras: current.extras.map((row) => (
      row.id === extraId ? { ...row, ...patch, id: row.id } : row
    )),
  }));
}

export function hideEmployeeLine(settings, employeeId, lineId) {
  return employeeMap(settings, employeeId, (current) => ({
    hidden: current.hidden.includes(lineId) ? current.hidden : [...current.hidden, lineId],
  }));
}

export function showEmployeeLine(settings, employeeId, lineId) {
  return employeeMap(settings, employeeId, (current) => ({
    hidden: current.hidden.filter((id) => id !== lineId),
  }));
}

export function updateCustomVariable(settings, id, patch) {
  const next = normalizeEarningsSettings(settings);
  next.customVariables = next.customVariables.map((row) => (
    row.id === id ? normalizeVariable({ ...row, ...patch, id: row.id }) : row
  ));
  return next;
}

export function setEmployeeIncome(settings, employeeId, patch) {
  return employeeMap(settings, employeeId, () => patch);
}
