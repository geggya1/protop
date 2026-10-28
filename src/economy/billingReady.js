/**
 * Til fakturering: åpne poster per prosjekt (timer, fastpris, utlegg, kjøring, salg),
 * med godkjenningsstatus, lås-dato, varsler og hittil fakturert.
 * Prosjektfanen og Økonomi bruker den samme funksjonen, så tallene er like.
 */
import { parseHours, roundHours } from '../arbeid/hours.js';
import { rateWithOvertime, timeTypeById } from '../arbeid/overtime.js';
import { resolveHourlyRate } from './hourlyRate.js';
import { normalizeExpense } from './expenses.js';
import { normalizeTrip } from './mileage.js';
import { normalizeSale } from './products.js';
import { fold, parseMoney, text } from './invoices.js';
import { round2 } from './invoiceLines.js';
import { isCreditNote, isDraftInvoice, issueDeadline } from './invoiceFlow.js';
import { pricingModelLabel } from '../project/projectFields.js';
import { ACCOUNT_SLOTS, accountsFrom, isForeignCustomer } from './invoiceDraft.js';

export const PERIOD_OPTIONS = [
  { id: 'lastMonth', label: 'T.o.m. forrige måned' },
  { id: 'today', label: 'T.o.m. i dag' },
  { id: 'custom', label: 'T.o.m. dato' },
];

function iso(date) {
  return date.toISOString().slice(0, 10);
}

/** Siste dag som tas med. Forrige måned følger fristen i bokføringsforskriften § 5-2-2. */
export function periodEndFor(id, today = '', custom = '') {
  const day = text(today) || iso(new Date());
  if (id === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(text(custom))) return text(custom);
  if (id === 'today') return day;
  const date = new Date(`${day}T12:00:00Z`);
  return iso(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)));
}

/** Trinnene i resolveHourlyRate som Til fakturering bruker: avtalen, så prosjektet. */
const BILLING_RATE_STEPS = ['contract', 'project'];

/** Timepris på datoen med kilde: prisversjon fra avtalen, ellers prosjektets timepris. */
export function billingRateFor(project, date = '', contracts = []) {
  return resolveHourlyRate({ project, contracts, date, steps: BILLING_RATE_STEPS });
}

/** Timepris på datoen: prisversjon fra avtalen, ellers prosjektets timepris. Null når den mangler. */
export function hourlyRateFor(project, date = '', contracts = []) {
  return billingRateFor(project, date, contracts).rate;
}

function entryHours(row) {
  return roundHours(parseHours(row.billableHours != null ? row.billableHours : row.hours));
}

/** Time som kan faktureres: fakturerbar, ikke på faktura, ført eller levert eller godkjent. */
export function isOpenEntry(row) {
  if (!row || row.billable === false) return false;
  if (text(row.invoiceId)) return false;
  if (!(entryHours(row) > 0)) return false;
  return row.status === 'godkjent' || row.status === 'registrert' || row.status === 'låst';
}

export function isApprovedEntry(row) {
  return row?.status === 'godkjent';
}

/** Utlegg, tur eller salg som kan faktureres. Utkast og avviste tas ikke med. */
export function isOpenOperation(row) {
  if (!row || row.billable === false) return false;
  if (text(row.invoiceId) || row.status === 'invoiced') return false;
  return row.status === 'approved' || row.status === 'submitted';
}

export function isApprovedOperation(row) {
  return row?.status === 'approved';
}

function monthOf(day) {
  return text(day).slice(0, 7);
}

function projectKeyOf(row) {
  return text(row?.projectId);
}

/** Finn kunden til prosjektet: id, kundenummer, org.nr. eller navn. */
export function customerForProject(project, customers = []) {
  const list = Array.isArray(customers) ? customers : [];
  const byId = text(project?.customerId);
  if (byId) {
    const hit = list.find((row) => row.id === byId);
    if (hit) return hit;
  }
  const number = text(project?.customerNumber);
  if (number) {
    const hit = list.find((row) => text(row.customerNumber) === number);
    if (hit) return hit;
  }
  const org = text(project?.orgnr).replace(/\s/g, '');
  if (org) {
    const hit = list.find((row) => text(row.orgnr).replace(/\s/g, '') === org);
    if (hit) return hit;
  }
  const name = fold(project?.client || project?.customerName);
  if (name) return list.find((row) => fold(row.name) === name) || null;
  return null;
}

/** Fakturert beløp eks. mva på prosjektet (utstedte fakturaer minus kreditnotaer). */
export function invoicedOnProject(invoices = [], projectId = '') {
  let total = 0;
  let fees = 0;
  let count = 0;
  for (const row of invoices || []) {
    if (row?.projectId !== projectId || isDraftInvoice(row)) continue;
    const amount = parseMoney(row.amountExVat) || 0;
    total += amount;
    if (!isCreditNote(row)) count += 1;
    const lines = Array.isArray(row.lines) ? row.lines : [];
    if (lines.length) {
      fees += lines
        .filter((line) => line.section === 'fixed' || line.section === 'hours')
        .reduce((sum, line) => sum + (parseMoney(line.amountExVat) || 0), 0);
    } else {
      fees += parseMoney(row.feesInclMarkup ?? row.feesExMarkup) ?? amount;
    }
  }
  return { total: round2(total), fees: round2(fees), count };
}

function lastInvoiceDate(invoices, projectId) {
  let last = '';
  for (const row of invoices || []) {
    if (row?.projectId !== projectId || isDraftInvoice(row) || isCreditNote(row)) continue;
    const day = text(row.invoiceDate);
    if (day > last) last = day;
  }
  return last;
}

function lockFor(locks, employeeId) {
  return (Array.isArray(locks) ? locks : []).find((row) => row?.employeeId === employeeId) || null;
}

function expenseMarkup(row, project, settings) {
  if (Number(row.markupPercent) > 0) return Number(row.markupPercent);
  const pricing = project?.pricingSettings || {};
  if (pricing.markupExpenses != null && pricing.markupExpenses !== '') return Number(pricing.markupExpenses) || 0;
  const fixed = project?.pricingModel === 'fixed' || project?.pricingModel === 'retainer';
  return Number(fixed ? settings.markupExpenseFixed : settings.markupExpenseHourly) || 0;
}

function hoursMarkup(project, settings) {
  const pricing = project?.pricingSettings || {};
  if (Number(pricing.markupHours) > 0) return Number(pricing.markupHours);
  return Number(settings.markupHourly) || 0;
}

function emptyProject(project, customer, settings) {
  return {
    key: project.id,
    projectId: project.id,
    project,
    customer,
    settings,
    number: text(project.number),
    name: text(project.name),
    customerName: text(customer?.name || project.client || project.customerName),
    customerNumber: text(customer?.customerNumber || project.customerNumber),
    pricingModel: project.pricingModel || 'hourly',
    pricingLabel: pricingModelLabel(project.pricingModel || 'hourly') || 'Timepris',
    hourGroups: [],
    expenses: [],
    trips: [],
    sales: [],
    fixed: null,
    totals: { hours: 0, hoursAmount: 0, expenses: 0, trips: 0, sales: 0, fixed: 0, total: 0, approvedTotal: 0 },
    invoiced: { total: 0, fees: 0, count: 0 },
    drafts: [],
    warnings: [],
    blocked: false,
    blockReasons: [],
    missingAccounts: [],
    oldestDate: '',
    open: 0,
    approved: 0,
  };
}

function warn(target, level, id, message) {
  if (target.warnings.some((row) => row.id === id)) return;
  target.warnings.push({ level, id, text: message });
}

/**
 * Bygg Til fakturering.
 * settingsFor(project) gir effektive fakturainnstillinger (resolveProjectInvoiceSettings().effective).
 */
export function buildReadyProjects({
  projects = [],
  customers = [],
  timeEntries = [],
  expenses = [],
  trips = [],
  sales = [],
  invoices = [],
  timesheetLocks = [],
  contracts = [],
  settingsFor = () => ({}),
  chart = [],
  periodEnd = '',
  today = '',
  includeEmpty = false,
} = {}) {
  const until = text(periodEnd) || periodEndFor('lastMonth', today);
  const now = text(today) || iso(new Date());
  const byId = new Map((projects || []).filter((row) => row?.id).map((row) => [row.id, row]));
  const out = new Map();

  function slot(projectId) {
    if (!projectId || !byId.has(projectId)) return null;
    if (!out.has(projectId)) {
      const project = byId.get(projectId);
      out.set(projectId, emptyProject(project, customerForProject(project, customers), settingsFor(project) || {}));
    }
    return out.get(projectId);
  }

  // Timer: én rad per medarbeider, aktivitet, timeart og timepris.
  const hourGroups = new Map();
  for (const row of timeEntries || []) {
    if (!isOpenEntry(row) || text(row.date) > until) continue;
    const target = slot(projectKeyOf(row));
    if (!target) continue;
    const model = target.pricingModel;
    if (model === 'not_billable' || model === 'fixed' || model === 'retainer' || model === 'unit') continue;
    const type = timeTypeById(row.timeType || 'ordinary');
    const priced = billingRateFor(target.project, row.date, contracts);
    const base = priced.rate;
    const rate = base == null ? null : rateWithOvertime(base, type.id);
    const key = [target.projectId, row.employeeId || row.employeeName, row.activityId || row.activityName, type.id, rate ?? 'x'].join('|');
    if (!hourGroups.has(key)) {
      const lock = lockFor(timesheetLocks, row.employeeId);
      hourGroups.set(key, {
        key: `h:${key}`,
        projectId: target.projectId,
        employeeId: text(row.employeeId),
        employeeName: text(row.employeeName) || 'Medarbeider',
        activityName: text(row.activityName) || 'Hovedaktivitet',
        timeType: type.id,
        timeTypeLabel: type.id === 'ordinary' ? '' : type.label,
        rate,
        rateSource: priced.source,
        rateMissing: rate == null,
        markupPercent: hoursMarkup(target.project, target.settings),
        discountPercent: Number(target.settings.discountHours) || 0,
        lockThrough: text(lock?.throughDate),
        periodStart: row.date,
        periodEnd: row.date,
        hours: 0,
        count: 0,
        approvedCount: 0,
        entries: [],
      });
    }
    const group = hourGroups.get(key);
    const hours = entryHours(row);
    group.entries.push({ ...row, _hours: hours, _rate: rate });
    group.hours = roundHours(group.hours + hours);
    group.count += 1;
    if (isApprovedEntry(row)) group.approvedCount += 1;
    if (row.date < group.periodStart) group.periodStart = row.date;
    if (row.date > group.periodEnd) group.periodEnd = row.date;
  }
  for (const group of hourGroups.values()) {
    const target = out.get(group.projectId);
    const base = group.rate == null ? 0 : round2(group.hours * group.rate);
    const markup = round2(base * (group.markupPercent / 100));
    const discount = round2((base + markup) * (group.discountPercent / 100));
    group.base = base;
    group.markupAmount = markup;
    group.amount = round2(base + markup - discount);
    group.lockBehind = !group.lockThrough || group.lockThrough < group.periodEnd;
    group.entries.sort((a, b) => text(a.date).localeCompare(text(b.date)));
    target.hourGroups.push(group);
  }

  // Utlegg, kjøring og salg: én rad per post.
  for (const raw of expenses || []) {
    const row = normalizeExpense(raw);
    if (!isOpenOperation(row) || text(row.date) > until) continue;
    const target = slot(row.projectId);
    if (!target) continue;
    // Utlegg i kundens navn går videre med bruttobeløpet, uten påslag og mva.
    // Viderefakturerte utlegg faktureres eks. mva med påslag, og får mva på fakturaen.
    const outlay = row.chargeType === 'outlay';
    const markupPercent = outlay ? 0 : expenseMarkup(row, target.project, target.settings);
    const gross = Math.abs(row.amountInclVat) ? row.amountInclVat : row.amountExVat;
    const base = outlay ? (gross || 0) : (Math.abs(row.amountExVat) ? row.amountExVat : 0);
    const markup = round2(base * (markupPercent / 100));
    target.expenses.push({
      key: `e:${row.id}`,
      id: row.id,
      row,
      chargeType: outlay ? 'outlay' : 'reinvoice',
      date: row.date,
      description: row.description || row.purpose || row.vendor || 'Utlegg',
      employeeName: row.employeeName,
      activityName: row.activityName || '',
      approved: isApprovedOperation(row),
      quantity: 1,
      unitPrice: base,
      markupPercent,
      discountPercent: 0,
      amount: round2(base + markup),
      hasReceipt: !!row.receiptUri,
    });
  }
  for (const raw of trips || []) {
    const row = normalizeTrip(raw);
    if (!isOpenOperation(row) || row.purpose !== 'duty' || text(row.date) > until) continue;
    const target = slot(row.projectId);
    if (!target) continue;
    const rate = row.billableRate || row.rate;
    const amount = round2(row.km * rate + (row.extras || 0));
    target.trips.push({
      key: `t:${row.id}`,
      id: row.id,
      row,
      date: row.date,
      description: `Kjøring ${row.from} – ${row.to}`.trim(),
      employeeName: row.employeeName || '',
      approved: isApprovedOperation(row),
      quantity: row.km,
      unitPrice: rate,
      extras: row.extras || 0,
      amount,
    });
  }
  for (const raw of sales || []) {
    const row = normalizeSale(raw);
    if (!row.billable || text(row.invoiceId) || row.status === 'invoiced' || row.status === 'rejected') continue;
    if (text(row.date) > until) continue;
    if (text(row.postponedUntil) && text(row.postponedUntil) > now) continue;
    const target = slot(row.projectId);
    if (!target) continue;
    target.sales.push({
      key: `s:${row.id}`,
      id: row.id,
      row,
      date: row.date,
      description: row.sku ? `${row.sku} ${row.name}` : (row.name || 'Vare'),
      employeeName: row.employeeName || '',
      approved: row.status === 'approved',
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      unit: row.unit,
      markupPercent: Number(row.surchargePercent) || 0,
      discountPercent: Number(row.discountPercent) || Number(target.settings.discountProducts) || 0,
      amount: row.amountExVat,
    });
  }

  // Fastpris, fast avtale og enhetspris: forslag som brukeren bekrefter og justerer.
  for (const project of projects || []) {
    const model = project?.pricingModel;
    if (!['fixed', 'retainer', 'unit'].includes(model)) continue;
    if (project.status === 'arkivert') continue;
    const pricing = project.pricingSettings || {};
    const invoiced = invoicedOnProject(invoices, project.id);
    // Fastpris med rest vises alltid. Fast avtale vises når perioden ikke er fakturert.
    const due = (model === 'fixed' && (Number(pricing.fixedFee) || 0) - invoiced.fees > 0.5)
      || (model === 'retainer' && (Number(pricing.retainerFee) || 0) > 0 && lastInvoiceDate(invoices, project.id) < `${monthOf(until)}-01`);
    const target = includeEmpty || due ? slot(project.id) : out.get(project.id);
    if (!target) continue;
    if (model === 'fixed') {
      const agreed = Number(pricing.fixedFee) || 0;
      target.fixed = {
        key: `f:${project.id}`,
        model,
        description: 'Fastpris',
        agreed,
        invoiced: invoiced.fees,
        remaining: Math.max(0, round2(agreed - invoiced.fees)),
        amount: Math.max(0, round2(agreed - invoiced.fees)),
        quantity: 1,
      };
    } else if (model === 'retainer') {
      const fee = Number(pricing.retainerFee) || 0;
      target.fixed = {
        key: `f:${project.id}`,
        model,
        description: 'Fast avtale',
        agreed: fee,
        invoiced: invoiced.fees,
        remaining: fee,
        amount: fee,
        quantity: 1,
      };
    } else {
      const price = Number(pricing.unitPrice) || 0;
      target.fixed = {
        key: `f:${project.id}`,
        model,
        description: text(pricing.unitLabel) || 'Enhet',
        agreed: price,
        invoiced: invoiced.fees,
        remaining: price,
        amount: price,
        quantity: 1,
        unitPrice: price,
      };
    }
  }

  const list = [];
  for (const target of out.values()) {
    target.invoiced = invoicedOnProject(invoices, target.projectId);
    target.drafts = (invoices || []).filter((row) => row?.projectId === target.projectId && isDraftInvoice(row));
    const hoursAmount = round2(target.hourGroups.reduce((sum, row) => sum + row.amount, 0));
    const hours = roundHours(target.hourGroups.reduce((sum, row) => sum + row.hours, 0));
    const expenseSum = round2(target.expenses.reduce((sum, row) => sum + row.amount, 0));
    const tripSum = round2(target.trips.reduce((sum, row) => sum + row.amount, 0));
    const saleSum = round2(target.sales.reduce((sum, row) => sum + row.amount, 0));
    const approvedTotal = round2(
      target.hourGroups.reduce((sum, row) => sum + (row.count ? row.amount * (row.approvedCount / row.count) : 0), 0)
      + target.expenses.filter((row) => row.approved).reduce((sum, row) => sum + row.amount, 0)
      + target.trips.filter((row) => row.approved).reduce((sum, row) => sum + row.amount, 0)
      + target.sales.filter((row) => row.approved).reduce((sum, row) => sum + row.amount, 0),
    );
    target.totals = {
      hours,
      hoursAmount,
      expenses: expenseSum,
      trips: tripSum,
      sales: saleSum,
      fixed: 0,
      total: round2(hoursAmount + expenseSum + tripSum + saleSum),
      approvedTotal,
    };
    const dates = [
      ...target.hourGroups.map((row) => row.periodStart),
      ...target.expenses.map((row) => row.date),
      ...target.trips.map((row) => row.date),
      ...target.sales.map((row) => row.date),
    ].filter(Boolean).sort();
    target.oldestDate = dates[0] || '';
    const count = target.hourGroups.reduce((sum, row) => sum + row.count, 0)
      + target.expenses.length + target.trips.length + target.sales.length;
    const approved = target.hourGroups.reduce((sum, row) => sum + row.approvedCount, 0)
      + target.expenses.filter((row) => row.approved).length
      + target.trips.filter((row) => row.approved).length
      + target.sales.filter((row) => row.approved).length;
    target.open = count;
    target.approved = approved;

    if (target.hourGroups.some((row) => row.rateMissing)) {
      warn(target, 'block', 'rate', 'Timepris mangler');
    }
    if (!target.customerName) warn(target, 'block', 'customer', 'Prosjektet har ingen kunde');
    else if (!text(target.customer?.orgnr) && !text(target.customer?.address)) {
      warn(target, 'warn', 'party', 'Kunden mangler org.nr. og adresse');
    }
    if (count && approved < count) warn(target, 'warn', 'approval', `Godkjent ${approved} av ${count}`);
    const behind = target.hourGroups.filter((row) => row.lockBehind);
    if (behind.length) {
      const names = [...new Set(behind.map((row) => row.employeeName))];
      warn(target, 'warn', 'lock', `Timeliste ikke levert for ${names.length === 1 ? names[0] : `${names.length} medarbeidere`}`);
    }
    const deadline = issueDeadline(target.oldestDate);
    if (deadline && deadline < now) warn(target, 'warn', 'late', 'Eldste post er over fristen for fakturering');
    if (target.fixed && target.fixed.model === 'fixed' && !target.fixed.agreed) {
      warn(target, 'warn', 'fixed', 'Fastprisen er ikke satt på prosjektet');
    }
    // Kontoene kommer fra innstillingene. Mangler en konto for noe som skal faktureres, stoppes prosjektet.
    const accounts = accountsFrom(target.settings, { foreign: isForeignCustomer(target.customer) });
    const needed = new Set();
    if (target.hourGroups.length) needed.add('hours');
    if (target.fixed) needed.add('fees');
    for (const row of target.expenses) needed.add(row.chargeType === 'outlay' ? 'outlays' : 'expenses');
    if (target.trips.length) needed.add('mileage');
    if (target.sales.some((row) => !text(row.row?.account) || text(row.row?.account) === '3000')) needed.add('products');
    if (needed.size && (Number(target.settings.adminAmount) || Number(target.settings.adminMarkupPercent))) needed.add('admin');
    const known = new Set((chart || []).map((row) => row.code));
    const missingAccounts = ACCOUNT_SLOTS.filter((row) => needed.has(row.id) && !accounts[row.id]);
    const unknownAccounts = ACCOUNT_SLOTS.filter((row) => needed.has(row.id) && accounts[row.id] && known.size && !known.has(accounts[row.id]));
    if (missingAccounts.length) {
      warn(target, 'block', 'account', `Konto mangler for ${missingAccounts.map((row) => row.label.toLowerCase()).join(', ')}`);
    }
    if (unknownAccounts.length) {
      warn(target, 'block', 'account_unknown', `Konto ${[...new Set(unknownAccounts.map((row) => accounts[row.id]))].join(', ')} finnes ikke i kontoplanen`);
    }
    target.missingAccounts = missingAccounts.map((row) => row.id);
    // Et prosjekt med noe som stopper, kan ikke faktureres før det er rettet.
    target.blockReasons = target.warnings.filter((row) => row.level === 'block').map((row) => row.text);
    target.blocked = target.blockReasons.length > 0;
    if (count || target.fixed || includeEmpty) list.push(target);
  }
  return list.sort((a, b) => (
    String(a.customerName).localeCompare(String(b.customerName), 'nb')
    || String(a.number).localeCompare(String(b.number), 'nb', { numeric: true })
  ));
}

/** Alle nøkler som kan krysses av på prosjektet. Fastpris er ikke valgt fra start. Ingen når prosjektet er stoppet. */
export function selectableKeys(project, { includeFixed = false } = {}) {
  if (project?.blocked) return [];
  const keys = [
    ...(project?.hourGroups || []).filter((row) => !row.rateMissing).map((row) => row.key),
    ...(project?.expenses || []).map((row) => row.key),
    ...(project?.trips || []).map((row) => row.key),
    ...(project?.sales || []).map((row) => row.key),
  ];
  if (includeFixed && project?.fixed) keys.push(project.fixed.key);
  return keys;
}

/**
 * Utvalget som blir et utkast. selected er et Set med nøkler.
 * fixedAmount overstyrer forslaget for fastpris.
 */
export function selectionFor(project, selected, { fixedAmount = null, fixedQuantity = null, fixedDescription = '' } = {}) {
  const has = (key) => !project?.blocked && selected?.has?.(key);
  const groups = (project?.hourGroups || []).filter((row) => has(row.key) && !row.rateMissing);
  const entries = groups.flatMap((row) => row.entries);
  const pickedExpenses = (project?.expenses || []).filter((row) => has(row.key));
  const pickedTrips = (project?.trips || []).filter((row) => has(row.key));
  const pickedSales = (project?.sales || []).filter((row) => has(row.key));
  const fixed = project?.fixed && has(project.fixed.key)
    ? {
      ...project.fixed,
      amount: fixedAmount == null ? project.fixed.amount : round2(Number(fixedAmount) || 0),
      quantity: fixedQuantity == null ? project.fixed.quantity : Number(fixedQuantity) || 0,
      description: text(fixedDescription) || project.fixed.description,
    }
    : null;
  const unapproved = {
    entries: entries.filter((row) => !isApprovedEntry(row)),
    expenses: pickedExpenses.filter((row) => !row.approved).map((row) => row.row),
    trips: pickedTrips.filter((row) => !row.approved).map((row) => row.row),
    sales: pickedSales.filter((row) => !row.approved).map((row) => row.row),
  };
  const unapprovedCount = unapproved.entries.length + unapproved.expenses.length
    + unapproved.trips.length + unapproved.sales.length;
  return {
    key: project?.projectId || '',
    projectId: project?.projectId || '',
    projectNumber: project?.number || '',
    projectName: project?.name || '',
    project: project?.project || null,
    customer: project?.customer || null,
    customerId: text(project?.customer?.id || project?.project?.customerId),
    customerNumber: project?.customerNumber || '',
    customerName: project?.customerName || '',
    orgnr: text(project?.customer?.orgnr || project?.project?.orgnr),
    pricingModel: project?.pricingModel || 'hourly',
    settings: project?.settings || {},
    hourGroups: groups,
    entries,
    expenses: pickedExpenses.map((row) => row.row),
    expenseRows: pickedExpenses,
    trips: pickedTrips.map((row) => row.row),
    sales: pickedSales.map((row) => row.row),
    saleRows: pickedSales,
    fixed,
    unapproved,
    unapprovedCount,
    empty: !entries.length && !pickedExpenses.length && !pickedTrips.length && !pickedSales.length && !(fixed && fixed.amount),
  };
}

/** Summen for et utvalg, eks. mva. */
export function selectionAmount(project, selected, fixedAmount = null) {
  const sel = selectionFor(project, selected, { fixedAmount });
  const hours = sel.hourGroups.reduce((sum, row) => sum + row.amount, 0);
  const exp = (project?.expenses || []).filter((row) => selected?.has?.(row.key)).reduce((sum, row) => sum + row.amount, 0);
  const trips = (project?.trips || []).filter((row) => selected?.has?.(row.key)).reduce((sum, row) => sum + row.amount, 0);
  const salesSum = (project?.sales || []).filter((row) => selected?.has?.(row.key)).reduce((sum, row) => sum + row.amount, 0);
  const fixed = sel.fixed ? round2((sel.fixed.amount || 0) * (sel.fixed.quantity || 1)) : 0;
  return round2(hours + exp + trips + salesSum + fixed);
}

/** Utvalget uten poster som ikke er godkjent. */
export function approvedOnly(selection) {
  const entries = (selection.entries || []).filter((row) => isApprovedEntry(row));
  const ids = new Set(entries.map((row) => row.id));
  const hourGroups = (selection.hourGroups || [])
    .map((group) => ({ ...group, entries: group.entries.filter((row) => ids.has(row.id)) }))
    .filter((group) => group.entries.length);
  const expenseRows = (selection.expenseRows || []).filter((row) => row.approved);
  const saleRows = (selection.saleRows || []).filter((row) => row.approved);
  const trips = (selection.trips || []).filter((row) => row.status === 'approved');
  return {
    ...selection,
    entries,
    hourGroups,
    expenseRows,
    expenses: expenseRows.map((row) => row.row),
    saleRows,
    sales: saleRows.map((row) => row.row),
    trips,
    unapprovedCount: 0,
    empty: !entries.length && !expenseRows.length && !saleRows.length && !trips.length && !(selection.fixed && selection.fixed.amount),
  };
}
