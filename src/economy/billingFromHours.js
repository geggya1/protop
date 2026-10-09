/**
 * Fakturagrunnlag: godkjente fakturerbare timer → fakturalinjer / fakturautkast.
 */

import { parseHours, roundHours } from '../arbeid/hours.js';
import { rateWithOvertime, timeTypeById } from '../arbeid/overtime.js';
import { calcLineVat, defaultVatCode, invoiceVatTotals, roundMoney } from './vat.js';
import { buildKid } from './kid.js';
import { incomeAccountForHours } from './accountsChart.js';
import { emptyInvoice, newInvoiceId, parseDate, text } from './invoices.js';

function projectHourlyRate(project) {
  const settings = project?.pricingSettings || {};
  const rate = Number(settings.hourlyRate ?? settings.ensTimepris ?? settings.rate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  return 1000; // fallback slik at utkast kan opprettes og redigeres
}

function entryBillable(row) {
  if (row.status === 'låst' && row.invoiceId) return false;
  if (row.invoiceId) return false;
  const hours = parseHours(row.billableHours != null ? row.billableHours : row.hours);
  if (!(hours > 0)) return false;
  // Godkjente eller registrerte — PowerOffice lar ofte «fakturerbare» gå i forslag
  return row.status === 'godkjent' || row.status === 'registrert' || row.status === 'låst';
}

/**
 * Grupper fakturerbare timer til fakturaforslag per kunde/prosjekt.
 */
export function buildBillingProposals(state, {
  fromDate = '',
  toDate = '',
  onlyApproved = true,
  customerId = '',
  projectId = '',
} = {}) {
  const projects = new Map((state.projects || []).map((p) => [p.id, p]));
  const rows = (state.timeEntries || []).filter((row) => {
    if (!entryBillable(row)) return false;
    if (onlyApproved && row.status !== 'godkjent' && row.status !== 'låst') return false;
    if (fromDate && row.date < fromDate) return false;
    if (toDate && row.date > toDate) return false;
    if (customerId && row.customerId !== customerId) return false;
    if (projectId && row.projectId !== projectId) return false;
    const project = projects.get(row.projectId);
    if (project?.pricingModel === 'not_billable') return false;
    return true;
  });

  const groups = new Map();
  for (const row of rows) {
    const project = projects.get(row.projectId) || {};
    const custKey = row.customerId || project.customerId || row.customerNumber || project.customerNumber || 'ukjent';
    const key = `${custKey}|${row.projectId || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        customerId: row.customerId || project.customerId || '',
        customerNumber: row.customerNumber || project.customerNumber || '',
        customerName: row.customerName || project.client || '',
        orgnr: project.orgnr || '',
        projectId: row.projectId || '',
        projectNumber: row.projectNumber || project.number || '',
        projectName: row.projectName || project.name || '',
        entries: [],
        hours: 0,
        amountExVat: 0,
      });
    }
    const group = groups.get(key);
    const hours = roundHours(row.billableHours != null ? row.billableHours : row.hours);
    const rate = rateWithOvertime(projectHourlyRate(project), row.timeType || 'ordinary');
    group.entries.push({ ...row, _rate: rate, _hours: hours });
    group.hours = roundHours(group.hours + hours);
    group.amountExVat = roundMoney(group.amountExVat + hours * rate);
  }

  return [...groups.values()].sort((a, b) => (
    String(a.customerName).localeCompare(String(b.customerName), 'nb')
    || String(a.projectNumber).localeCompare(String(b.projectNumber), 'nb')
  ));
}

/**
 * Bygg fakturalinjer fra timeposter (gruppering: per aktivitet eller per ansatt).
 */
export function linesFromEntries(entries, {
  groupBy = 'activity', // activity | employee | total
  vatCode = 'HIGH',
  descriptionPrefix = '',
} = {}) {
  const buckets = new Map();
  for (const row of entries) {
    const hours = row._hours != null ? row._hours : roundHours(row.billableHours ?? row.hours);
    const rate = row._rate != null ? row._rate : 0;
    let key = 'total';
    let label = 'Konsulenttimer';
    if (groupBy === 'activity') {
      key = row.activityId || row.activityName || 'akt';
      label = row.activityName || 'Hovedaktivitet';
    } else if (groupBy === 'employee') {
      key = row.employeeId || row.employeeName || 'ans';
      label = row.employeeName || 'Medarbeider';
    }
    const type = timeTypeById(row.timeType || 'ordinary');
    if (type.id !== 'ordinary') label = `${label} (${type.label})`;
    // Timeart i nøkkelen — ellers blandes ordinær/overtid og siste sats overskriver beløpet.
    key = `${key}|${type.id}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        id: `line_${key.replace(/\|/g, '_')}`,
        description: descriptionPrefix ? `${descriptionPrefix}${label}` : label,
        quantity: 0,
        unit: 't',
        unitPrice: rate,
        vatCode,
        account: incomeAccountForHours(),
        timeEntryIds: [],
      });
    }
    const bucket = buckets.get(key);
    bucket.quantity = roundHours(bucket.quantity + hours);
    bucket.unitPrice = rate;
    bucket.timeEntryIds.push(row.id);
  }

  return [...buckets.values()].map((row) => {
    const calc = calcLineVat({
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      vatCode: row.vatCode,
    });
    return {
      ...row,
      ...calc,
    };
  });
}

function nextInvoiceNumber(existing = []) {
  let max = 10000;
  for (const row of existing) {
    const n = Number(String(row.invoiceNumber || '').replace(/\D/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Opprett fakturautkast fra et fakturaforslag.
 */
export function createInvoiceFromProposal(proposal, {
  existingInvoices = [],
  groupBy = 'activity',
  vatCode = 'HIGH',
  creditDays = 14,
  invoiceDate = '',
  bankAccount = '',
  kidMethod = 'mod10',
} = {}) {
  if (!proposal?.entries?.length) {
    return { ok: false, error: 'Ingen timer i forslaget.', invoice: null };
  }
  const date = parseDate(invoiceDate) || new Date().toISOString().slice(0, 10);
  const invoiceNumber = nextInvoiceNumber(existingInvoices);
  const lines = linesFromEntries(proposal.entries, { groupBy, vatCode });
  const totals = invoiceVatTotals(lines);
  const dates = proposal.entries.map((row) => row.date).filter(Boolean).sort();
  const kid = buildKid({
    customerNumber: proposal.customerNumber || '0',
    invoiceNumber,
    method: kidMethod,
  });

  const invoice = emptyInvoice({
    id: newInvoiceId(invoiceNumber),
    invoiceNumber,
    invoiceDate: date,
    dueDate: addDaysIso(date, creditDays),
    periodStart: dates[0] || '',
    periodEnd: dates[dates.length - 1] || '',
    customerId: proposal.customerId,
    customerNumber: proposal.customerNumber,
    customerName: proposal.customerName,
    orgnr: proposal.orgnr,
    projectId: proposal.projectId,
    projectNumber: proposal.projectNumber,
    projectName: proposal.projectName,
    kid,
    deliveryMethod: 'ehf',
    currency: 'NOK',
    creditDays,
    bankAccount: text(bankAccount),
    vatCode,
    lines,
    amountExVat: totals.amountExVat,
    vat: totals.vat,
    amountInclVat: totals.amountInclVat,
    outstanding: String(totals.amountInclVat),
    outstandingAmount: totals.amountInclVat,
    feesInclMarkup: totals.amountExVat,
    status: 'draft',
    exportStatus: 'utkast',
    timeEntryIds: proposal.entries.map((row) => row.id),
    accounts: { [incomeAccountForHours()]: totals.amountExVat },
    notes: `Opprettet fra ${proposal.entries.length} timeføringer.`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      filename: 'fakturagrunnlag',
      importedAt: new Date().toISOString(),
      values: { origin: 'billingFromHours' },
    },
  });

  return { ok: true, error: null, invoice, lines, totals };
}

/**
 * Marker timeEntries som fakturert (invoiceId + status låst).
 */
export function markEntriesInvoiced(state, entryIds, invoiceId) {
  const wanted = new Set(entryIds || []);
  if (!wanted.size) return state;
  let changed = false;
  const timeEntries = (state.timeEntries || []).map((row) => {
    if (!wanted.has(row.id)) return row;
    if (row.invoiceId === invoiceId && row.status === 'låst') return row;
    changed = true;
    return {
      ...row,
      invoiceId,
      status: 'låst',
      updatedAt: new Date().toISOString(),
    };
  });
  return changed ? { ...state, timeEntries } : state;
}
