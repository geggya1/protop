/**
 * Fakturagrunnlag fra timer + utlegg + kjørebok + varesalg (PowerOffice-modell).
 */

import {
  buildBillingProposals,
  createInvoiceFromProposal,
  linesFromEntries,
  markEntriesInvoiced,
} from './billingFromHours.js';
import { expenseBillableExVat, expenseInvoiceLine, normalizeExpense } from './expenses.js';
import { normalizeTrip, tripInvoiceLine } from './mileage.js';
import { normalizeSale, saleInvoiceLine } from './products.js';
import { invoiceVatTotals, roundMoney } from './vat.js';
import { emptyInvoice, newInvoiceId, parseDate, text } from './invoices.js';
import { buildKid } from './kid.js';
import { markOperationsInvoiced } from './opsState.js';

function groupKey(row, project = {}) {
  const cust = row.customerId || project.customerId || row.customerNumber || project.customerNumber || 'ukjent';
  return `${cust}|${row.projectId || ''}`;
}

function emptyGroup(row, project = {}) {
  return {
    key: groupKey(row, project),
    customerId: row.customerId || project.customerId || '',
    customerNumber: row.customerNumber || project.customerNumber || '',
    customerName: row.customerName || project.client || '',
    orgnr: project.orgnr || '',
    projectId: row.projectId || '',
    projectNumber: row.projectNumber || project.number || '',
    projectName: row.projectName || project.name || '',
    entries: [],
    expenses: [],
    trips: [],
    sales: [],
    hours: 0,
    amountExVat: 0,
  };
}

function openForBilling(row, onlyApproved) {
  if (row.invoiceId || row.status === 'invoiced') return false;
  if (row.billable === false) return false;
  if (!onlyApproved) return row.status !== 'rejected';
  return row.status === 'approved' || row.status === 'godkjent' || row.status === 'låst';
}

/**
 * Samle alle fakturerbare operasjoner per kunde/prosjekt.
 */
export function buildOperationsProposals(state, opts = {}) {
  const onlyApproved = opts.onlyApproved !== false;
  const projects = new Map((state.projects || []).map((p) => [p.id, p]));
  const groups = new Map();

  const hourProposals = buildBillingProposals(state, opts);
  for (const hour of hourProposals) {
    groups.set(hour.key, {
      ...emptyGroup(hour),
      ...hour,
      expenses: [],
      trips: [],
      sales: [],
    });
  }

  function take(row, projectId) {
    const project = projects.get(projectId || row.projectId) || {};
    const key = groupKey(row, project);
    if (!groups.has(key)) groups.set(key, emptyGroup(row, project));
    return groups.get(key);
  }

  for (const raw of state.expenses || []) {
    const row = normalizeExpense(raw);
    if (!openForBilling(row, onlyApproved)) continue;
    const group = take(row);
    group.expenses.push(row);
    group.amountExVat = roundMoney(group.amountExVat + expenseBillableExVat(row));
  }

  for (const raw of state.mileageTrips || []) {
    const row = normalizeTrip(raw);
    if (!openForBilling(row, onlyApproved) || row.purpose !== 'duty') continue;
    const group = take(row);
    group.trips.push(row);
    const tripEx = roundMoney(row.km * (row.billableRate || row.rate) + row.extras);
    group.amountExVat = roundMoney(group.amountExVat + tripEx);
  }

  for (const raw of state.sales || []) {
    const row = normalizeSale(raw);
    if (!openForBilling(row, onlyApproved)) continue;
    const group = take(row);
    group.sales.push(row);
    group.amountExVat = roundMoney(group.amountExVat + row.amountExVat);
  }

  return [...groups.values()]
    .filter((g) => g.entries.length || g.expenses.length || g.trips.length || g.sales.length)
    .sort((a, b) => (
      String(a.customerName).localeCompare(String(b.customerName), 'nb')
      || String(a.projectNumber).localeCompare(String(b.projectNumber), 'nb')
    ));
}

export function linesFromOperations(proposal, { vatCode = 'HIGH', groupBy = 'activity' } = {}) {
  const hourLines = proposal.entries?.length
    ? linesFromEntries(proposal.entries, { groupBy, vatCode })
    : [];
  const expenseLines = (proposal.expenses || []).map((row) => expenseInvoiceLine(row));
  const tripLines = (proposal.trips || []).flatMap((row) => tripInvoiceLine(row, { vatCode }));
  const saleLines = (proposal.sales || []).map((row) => saleInvoiceLine(row));
  return [...hourLines, ...expenseLines, ...tripLines, ...saleLines];
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextInvoiceNumber(existing = []) {
  let max = 10000;
  for (const row of existing) {
    const n = Number(String(row.invoiceNumber || '').replace(/\D/g, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return String(max + 1);
}

export function createInvoiceFromOperations(proposal, opts = {}) {
  const hasHours = !!proposal?.entries?.length;
  const hasOther = !!(proposal?.expenses?.length || proposal?.trips?.length || proposal?.sales?.length);
  if (!hasHours && !hasOther) {
    return { ok: false, error: 'Ingen poster i forslaget.', invoice: null };
  }
  if (hasHours && !hasOther) {
    return createInvoiceFromProposal(proposal, opts);
  }

  const {
    existingInvoices = [],
    groupBy = 'activity',
    vatCode = 'HIGH',
    creditDays = 14,
    invoiceDate = '',
    bankAccount = '',
    kidMethod = 'mod10',
  } = opts;

  const date = parseDate(invoiceDate) || new Date().toISOString().slice(0, 10);
  const invoiceNumber = nextInvoiceNumber(existingInvoices);
  const lines = linesFromOperations(proposal, { vatCode, groupBy });
  const totals = invoiceVatTotals(lines);
  const dates = [
    ...(proposal.entries || []).map((row) => row.date),
    ...(proposal.expenses || []).map((row) => row.date),
    ...(proposal.trips || []).map((row) => row.date),
    ...(proposal.sales || []).map((row) => row.date),
  ].filter(Boolean).sort();
  const kid = buildKid({
    customerNumber: proposal.customerNumber || '0',
    invoiceNumber,
    method: kidMethod,
  });

  const parts = [];
  if (proposal.entries?.length) parts.push(`${proposal.entries.length} timer`);
  if (proposal.expenses?.length) parts.push(`${proposal.expenses.length} utlegg`);
  if (proposal.trips?.length) parts.push(`${proposal.trips.length} kjøreturer`);
  if (proposal.sales?.length) parts.push(`${proposal.sales.length} varer`);

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
    expensesInclMarkup: (proposal.expenses || []).reduce((s, row) => s + expenseBillableExVat(row), 0),
    products: (proposal.sales || []).reduce((s, row) => s + (row.amountExVat || 0), 0),
    status: 'draft',
    exportStatus: 'utkast',
    timeEntryIds: (proposal.entries || []).map((row) => row.id),
    notes: `Opprettet fra ${parts.join(', ')}.`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: {
      filename: 'fakturagrunnlag',
      importedAt: new Date().toISOString(),
      values: { origin: 'billingFromOperations' },
    },
  });

  return { ok: true, error: null, invoice, lines, totals };
}

export function markProposalInvoiced(state, proposal, invoiceId) {
  let next = markEntriesInvoiced(state, (proposal.entries || []).map((row) => row.id), invoiceId);
  return markOperationsInvoiced(next, {
    expenseIds: (proposal.expenses || []).map((row) => row.id),
    tripIds: (proposal.trips || []).map((row) => row.id),
    saleIds: (proposal.sales || []).map((row) => row.id),
    invoiceId,
  });
}

export function proposalSummary(proposal) {
  return {
    hours: proposal.hours || 0,
    expenseCount: proposal.expenses?.length || 0,
    tripCount: proposal.trips?.length || 0,
    saleCount: proposal.sales?.length || 0,
    entryCount: proposal.entries?.length || 0,
    amountExVat: proposal.amountExVat || 0,
  };
}
