/**
 * Kundelisten som rapport: én rad per kunde med prosjekter, avtaler og fakturatall,
 * kolonner til rapporttabellen og filtrene over den.
 */
import {
  customerInvoiceGaps,
  formatOrgnr,
  maskPersonnummer,
  normalizeCustomerNumber,
  normalizeOrgnr,
  ownerLabel,
  projectCountsByCustomer,
  relatedContractsForCustomer,
} from './customers.js';
import { filterInvoicesByPeriod, fold, formatDate, formatMoney, parseDate, parseMoney } from '../economy/invoices.js';
import { invoiceOutstanding, invoiceReportStatus } from '../economy/invoiceReport.js';

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Hvilken kunde en faktura hører til: customerId først, så kundenummer, org.nr og eksakt navn.
 * Gir kunde-id eller ''.
 */
export function invoiceCustomerMatcher(customers) {
  const ids = new Set();
  const byNumber = new Map();
  const byOrgnr = new Map();
  const byName = new Map();
  for (const customer of customers || []) {
    if (!customer?.id) continue;
    ids.add(customer.id);
    const number = normalizeCustomerNumber(customer.customerNumber);
    if (number && !byNumber.has(number)) byNumber.set(number, customer.id);
    const orgnr = normalizeOrgnr(customer.orgnr);
    if (orgnr && !byOrgnr.has(orgnr)) byOrgnr.set(orgnr, customer.id);
    const name = fold(customer.name);
    if (name && !byName.has(name)) byName.set(name, customer.id);
  }
  return (invoice) => {
    const id = text(invoice?.customerId);
    if (id) return ids.has(id) ? id : '';
    const number = normalizeCustomerNumber(invoice?.customerNumber);
    if (number && byNumber.has(number)) return byNumber.get(number);
    const orgnr = normalizeOrgnr(invoice?.orgnr);
    if (orgnr && byOrgnr.has(orgnr)) return byOrgnr.get(orgnr);
    const name = fold(invoice?.customerName);
    return name && byName.has(name) ? byName.get(name) : '';
  };
}

/** Fakturatall per kunde i perioden: antall, eks. mva, utestående, forfalt og siste fakturadato. */
export function customerInvoiceStats(customers, invoices, { period = 'all', now = new Date() } = {}) {
  const match = invoiceCustomerMatcher(customers);
  const stats = new Map();
  for (const invoice of filterInvoicesByPeriod(invoices || [], period, now)) {
    const id = match(invoice);
    if (!id) continue;
    const row = stats.get(id) || { count: 0, exVat: 0, outstanding: 0, overdue: 0, lastDate: '' };
    row.count += 1;
    row.exVat += parseMoney(invoice.amountExVat) || 0;
    const open = invoiceOutstanding(invoice) || 0;
    row.outstanding += open;
    if (invoiceReportStatus(invoice) === 'overdue') row.overdue += open || 0;
    const date = parseDate(invoice.invoiceDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date > row.lastDate) row.lastDate = date;
    stats.set(id, row);
  }
  for (const row of stats.values()) {
    row.exVat = Math.round(row.exVat * 100) / 100;
    row.outstanding = Math.round(row.outstanding * 100) / 100;
    row.overdue = Math.round(row.overdue * 100) / 100;
  }
  return stats;
}

/** Én rapportrad per kunde. Uten `invoices` blir fakturatallene tomme. */
export function customerReportRows(customers, {
  projects = [],
  contracts = [],
  invoices = null,
  people = [],
  period = 'all',
  now = new Date(),
} = {}) {
  const list = Array.isArray(customers) ? customers : [];
  const projectCounts = projectCountsByCustomer(projects, list);
  const stats = invoices ? customerInvoiceStats(list, invoices, { period, now }) : null;
  return list.map((customer) => {
    const person = customer.kind === 'person';
    const money = stats ? (stats.get(customer.id) || { count: 0, exVat: 0, outstanding: 0, overdue: 0, lastDate: '' }) : null;
    return {
      ...customer,
      kindLabel: person ? 'Privatkunde' : 'Virksomhet',
      identity: person ? maskPersonnummer(customer.personnummer) : formatOrgnr(customer.orgnr),
      projectCount: projectCounts.get(customer.id) || 0,
      agreementCount: relatedContractsForCustomer(contracts, customer).length,
      owner: ownerLabel(customer, people),
      gaps: customerInvoiceGaps(customer),
      invoiceCount: money ? money.count : null,
      invoiced: money ? money.exVat : null,
      outstanding: money ? money.outstanding : null,
      overdue: money ? money.overdue : null,
      lastInvoice: money ? money.lastDate : '',
    };
  });
}

function moneyText(value) {
  return value == null ? '' : formatMoney(value);
}

function numberText(value) {
  return value == null ? '' : String(value);
}

/** Kolonner med invoice: true vises bare for dem som har tilgang til Faktura. */
export const CUSTOMER_REPORT_COLUMNS = [
  { key: 'customerNumber', label: 'Nr', width: 64, strong: true },
  { key: 'name', label: 'Kunde', width: 180, flex: 2 },
  { key: 'kindLabel', label: 'Type', width: 104, defaultVisible: false },
  { key: 'identity', label: 'Org.nr / personnr', width: 134 },
  { key: 'projectCount', label: 'Prosjekter', width: 92, kind: 'number', text: (row) => numberText(row.projectCount) },
  { key: 'agreementCount', label: 'Avtaler', width: 84, kind: 'number', defaultVisible: false, text: (row) => numberText(row.agreementCount) },
  { key: 'invoiceCount', label: 'Fakturaer', width: 92, kind: 'number', invoice: true, defaultVisible: false, text: (row) => numberText(row.invoiceCount) },
  { key: 'invoiced', label: 'Fakturert eks. mva', width: 150, kind: 'money', invoice: true, text: (row) => moneyText(row.invoiced) },
  { key: 'outstanding', label: 'Utestående', width: 120, kind: 'money', invoice: true, text: (row) => moneyText(row.outstanding) },
  { key: 'overdue', label: 'Forfalt', width: 112, kind: 'money', invoice: true, defaultVisible: false, text: (row) => moneyText(row.overdue) },
  {
    key: 'lastInvoice',
    label: 'Siste faktura',
    width: 108,
    kind: 'date',
    invoice: true,
    defaultVisible: false,
    text: (row) => (row.lastInvoice ? formatDate(row.lastInvoice) : ''),
  },
  { key: 'address', label: 'Adresse', width: 160, flex: 1 },
  { key: 'postalCode', label: 'Postnr', width: 76, defaultVisible: false },
  { key: 'place', label: 'Sted', width: 110 },
  { key: 'contactName', label: 'Kontakt', width: 130 },
  { key: 'email', label: 'E-post', width: 170, flex: 1 },
  { key: 'phone', label: 'Telefon', width: 112 },
  { key: 'owner', label: 'Ansvarlig', width: 130 },
  { key: 'notes', label: 'Notat', width: 220, defaultVisible: false },
  { key: 'gaps', label: 'Mangler for faktura', width: 220, defaultVisible: false, value: (row) => (row.gaps || []).join(' ') },
];

export const CUSTOMER_PROJECT_FILTERS = [
  { id: 'with', label: 'Med prosjekt' },
  { id: 'without', label: 'Uten prosjekt' },
];

export const CUSTOMER_INVOICE_FILTERS = [
  { id: 'invoiced', label: 'Fakturert i perioden' },
  { id: 'notInvoiced', label: 'Ikke fakturert i perioden' },
  { id: 'outstanding', label: 'Har utestående' },
  { id: 'overdue', label: 'Har forfalt' },
];

export const NO_OWNER = '__none__';

/** Ansvarlige som faktisk står på kundene, pluss «Uten ansvarlig». */
export function customerOwnerOptions(rows) {
  const seen = new Map();
  let none = false;
  for (const row of rows || []) {
    if (!row.ownerUid) {
      none = true;
      continue;
    }
    if (!seen.has(row.ownerUid)) seen.set(row.ownerUid, row.owner || row.ownerName || 'Ukjent');
  }
  const people = [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nb'));
  return none ? [{ id: NO_OWNER, label: 'Uten ansvarlig' }, ...people] : people;
}

export function customerKindMatches(row, kind) {
  if (kind === 'person') return row?.kind === 'person';
  if (kind === 'org') return row?.kind !== 'person';
  return true;
}

/** Filtre over tabellen. Type filtreres for seg, så hver typeknapp kan vise sitt antall. */
export function filterCustomerReport(rows, { query = '', owner = '', project = '', invoice = '' } = {}) {
  const needle = fold(query);
  return (rows || []).filter((row) => {
    if (owner === NO_OWNER && row.ownerUid) return false;
    if (owner && owner !== NO_OWNER && row.ownerUid !== owner) return false;
    if (project === 'with' && !row.projectCount) return false;
    if (project === 'without' && row.projectCount) return false;
    if (invoice === 'invoiced' && !(row.invoiceCount > 0)) return false;
    if (invoice === 'notInvoiced' && row.invoiceCount > 0) return false;
    if (invoice === 'outstanding' && !(row.outstanding > 0)) return false;
    if (invoice === 'overdue' && !(row.overdue > 0)) return false;
    if (!needle) return true;
    return fold([
      row.customerNumber, row.name, row.orgnr, row.personnummer, row.place, row.postalCode, row.address,
      row.contactName, row.email, row.phone, row.owner, row.ownerName, row.notes,
    ].join(' ')).includes(needle);
  });
}

export function customerKindCounts(rows) {
  const out = { '': 0, org: 0, person: 0 };
  for (const row of rows || []) {
    out[''] += 1;
    out[row.kind === 'person' ? 'person' : 'org'] += 1;
  }
  return out;
}

export function customerReportSummary(rows) {
  let invoiced = 0;
  let outstanding = 0;
  let projects = 0;
  for (const row of rows || []) {
    invoiced += row.invoiced || 0;
    outstanding += row.outstanding || 0;
    projects += row.projectCount || 0;
  }
  return {
    count: (rows || []).length,
    projects,
    invoiced: Math.round(invoiced * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
  };
}
