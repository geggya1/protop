/**
 * Fakturalisten som rapport: kolonner, status med forfall, filtre og eksport.
 * Tabellen selv ligger i components/table/ReportTable.
 */
import {
  filterInvoicesByPeriod,
  fold,
  formatDate,
  formatMoney,
  invoiceSearchHay,
  isInvoiceOverdue,
  isInvoiceSent,
  parseDate,
  parseMoney,
  statusLabel,
  text,
} from './invoices.js';
import { displayStatus } from './invoiceFlow.js';

export const INVOICE_PERIODS = [
  { id: 'all', label: 'Alle perioder' },
  { id: '7', label: 'Siste 7 dager' },
  { id: '30', label: 'Siste 30 dager' },
  { id: '100', label: 'Siste 100 dager' },
  { id: '365', label: 'Siste 12 måneder' },
  { id: 'year', label: 'I år' },
  { id: 'lastYear', label: 'I fjor' },
];

function todayKey(today) {
  return text(today) || new Date().toISOString().slice(0, 10);
}

/** Statusene i listen, i den rekkefølgen filtrene vises. Flere enn de lagrede statusene. */
export const INVOICE_REPORT_STATUSES = [
  { id: 'registered', label: 'Registrert' },
  { id: 'issued', label: 'Ferdigstilt' },
  { id: 'sent', label: 'Sendt' },
  { id: 'partly_paid', label: 'Delbetalt' },
  { id: 'overdue', label: 'Forfalt' },
  { id: 'paid', label: 'Betalt' },
  { id: 'partly_credited', label: 'Delvis kreditert' },
  { id: 'credited', label: 'Kreditert' },
  { id: 'credit_note', label: 'Kreditnota' },
  { id: 'written_off', label: 'Tap' },
  { id: 'draft', label: 'Utkast' },
  { id: 'approved', label: 'Godkjent utkast' },
  { id: 'transferred', label: 'I PowerOffice' },
];

export function reportStatusLabel(status) {
  return INVOICE_REPORT_STATUSES.find((row) => row.id === status)?.label || statusLabel(status);
}

/**
 * Status slik den vises: utkast og godkjent utkast, ferdigstilt, sendt, delbetalt, forfalt,
 * betalt, kreditert, kreditnota og tap. Faktura som har passert forfall uten betaling er forfalt.
 */
export function invoiceReportStatus(invoice, today) {
  const row = invoice || {};
  const day = todayKey(today);
  const shown = displayStatus(row, day).id;
  if (shown === 'overdue' && !isInvoiceOverdue(row, day)) {
    return isInvoiceSent(row) ? 'sent' : (text(row.status) || 'registered');
  }
  return shown;
}

export function invoiceDaysOverdue(invoice, today) {
  if (invoiceReportStatus(invoice, today) !== 'overdue') return null;
  const due = parseDate(invoice?.dueDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  const days = Math.round((Date.parse(`${todayKey(today)}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
  return days > 0 ? days : null;
}

function money(row, key) {
  return parseMoney(row?.[key]);
}

function moneyText(row, value) {
  return value == null ? '' : formatMoney(value, row?.currency);
}

export function invoiceOutstanding(row) {
  return parseMoney(row?.outstandingAmount ?? row?.outstanding);
}

function dateText(value) {
  const shown = formatDate(value);
  return shown === '—' ? '' : shown;
}

function dateColumn(key, label, extra = {}) {
  return {
    key,
    label,
    width: 108,
    kind: 'date',
    value: (row) => parseDate(row?.[key]),
    text: (row) => dateText(row?.[key]),
    ...extra,
  };
}

function moneyColumn(key, label, width, extra = {}) {
  return {
    key,
    label,
    width,
    kind: 'money',
    value: (row) => money(row, key),
    text: (row) => moneyText(row, money(row, key)),
    ...extra,
  };
}

/** Rekkefølgen er rekkefølgen i tabellen. defaultVisible: false ligger under «Kolonner». */
export const INVOICE_REPORT_COLUMNS = [
  { key: 'invoiceNumber', label: 'Fakturanr', width: 96, strong: true },
  {
    key: 'docs',
    label: 'PDF',
    width: 48,
    filter: false,
    export: false,
    value: (row) => (row?.previewReady || row?.attachment?.url ? 1 : 0),
    text: (row) => (row?.previewReady || row?.attachment?.url ? 'PDF' : ''),
  },
  dateColumn('invoiceDate', 'Fakturadato'),
  dateColumn('dueDate', 'Forfall'),
  { key: 'customerNumber', label: 'Kundenr', width: 80 },
  { key: 'customerName', label: 'Kunde', width: 150, flex: 1.4 },
  { key: 'orgnr', label: 'Org.nr', width: 110, defaultVisible: false },
  { key: 'projectNumber', label: 'Prosjektnr', width: 88 },
  { key: 'projectName', label: 'Prosjekt', width: 150, flex: 1.4 },
  { key: 'department', label: 'Avdeling', width: 120, defaultVisible: false },
  {
    key: 'status',
    label: 'Status',
    width: 104,
    value: (row) => reportStatusLabel(invoiceReportStatus(row)),
  },
  {
    key: 'sent',
    label: 'Sendt',
    width: 64,
    filter: false,
    defaultVisible: false,
    value: (row) => (isInvoiceSent(row) ? 'Ja' : ''),
  },
  dateColumn('sentAt', 'Sendt dato', { defaultVisible: false }),
  { key: 'deliveryMethod', label: 'Forsendelse', width: 120, defaultVisible: false },
  { key: 'kid', label: 'KID', width: 140, defaultVisible: false },
  { key: 'currency', label: 'Valuta', width: 64, defaultVisible: false, value: (row) => text(row?.currency) || 'NOK' },
  moneyColumn('amountExVat', 'Eks. mva', 128),
  moneyColumn('vat', 'MVA', 120),
  moneyColumn('amountInclVat', 'Ink. mva', 128),
  {
    key: 'outstanding',
    label: 'Utestående',
    width: 128,
    kind: 'money',
    value: (row) => invoiceOutstanding(row),
    text: (row) => moneyText(row, invoiceOutstanding(row)),
  },
  {
    key: 'daysOverdue',
    label: 'Dager forfalt',
    width: 104,
    kind: 'number',
    defaultVisible: false,
    value: (row) => invoiceDaysOverdue(row),
  },
  dateColumn('paidAt', 'Betalt', { defaultVisible: false }),
  moneyColumn('loss', 'Tap', 104, { defaultVisible: false }),
];

export function invoiceCustomerKey(row) {
  if (text(row?.customerId)) return `id:${text(row.customerId)}`;
  if (text(row?.customerNumber)) return `nr:${text(row.customerNumber)}`;
  const name = fold(row?.customerName);
  return name ? `navn:${name}` : '';
}

export function invoiceProjectKey(row) {
  if (text(row?.projectId)) return `id:${text(row.projectId)}`;
  if (text(row?.projectNumber)) return `nr:${text(row.projectNumber)}`;
  const name = fold(row?.projectName);
  return name ? `navn:${name}` : '';
}

function optionList(rows, keyOf, labelOf) {
  const seen = new Map();
  for (const row of rows || []) {
    const id = keyOf(row);
    if (!id || seen.has(id)) continue;
    const label = labelOf(row);
    if (label) seen.set(id, label);
  }
  return [...seen.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nb', { numeric: true, sensitivity: 'base' }));
}

/** Valg til kunde- og prosjektfilteret, hentet fra fakturaene selv. */
export function invoiceFilterOptions(rows) {
  return {
    customers: optionList(rows, invoiceCustomerKey, (row) => [text(row.customerNumber), text(row.customerName)].filter(Boolean).join(' · ')),
    projects: optionList(rows, invoiceProjectKey, (row) => [text(row.projectNumber), text(row.projectName)].filter(Boolean).join(' · ')),
  };
}

/** «16700-16720» i søket betyr fakturanummer fra og med til og med. */
export function invoiceNumberRange(query) {
  const match = text(query).match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (!match) return null;
  const a = Number(match[1]);
  const b = Number(match[2]);
  return { from: Math.min(a, b), to: Math.max(a, b) };
}

/** Søk, periode, kunde og prosjekt. Status filtreres for seg, så tellingen per status kan vises. */
export function filterInvoiceReport(rows, { query = '', period = 'all', customer = '', project = '' } = {}, now = new Date()) {
  const range = invoiceNumberRange(query);
  const needle = range ? '' : fold(query);
  return filterInvoicesByPeriod(rows, period, now).filter((row) => {
    if (customer && invoiceCustomerKey(row) !== customer) return false;
    if (project && invoiceProjectKey(row) !== project) return false;
    if (range) {
      const number = Number(text(row.invoiceNumber));
      return Number.isFinite(number) && text(row.invoiceNumber) !== '' && number >= range.from && number <= range.to;
    }
    if (!needle) return true;
    return invoiceSearchHay(row).includes(needle);
  });
}

/** Antall per status, med forfalte regnet ut fra dagens dato. Statuser uten fakturaer utelates. */
export function invoiceStatusChoices(rows, today) {
  const counts = new Map();
  for (const row of rows || []) {
    const status = invoiceReportStatus(row, today);
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const known = INVOICE_REPORT_STATUSES
    .filter((status) => counts.get(status.id))
    .map((status) => ({ id: status.id, label: status.label, count: counts.get(status.id) }));
  return [{ id: '', label: 'Alle', count: (rows || []).length }, ...known];
}

/** Tall til linjen over tabellen: beløp, utestående og forfalt. */
export function invoiceReportSummary(rows, today) {
  let exVat = 0;
  let inclVat = 0;
  let outstanding = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  for (const row of rows || []) {
    exVat += money(row, 'amountExVat') || 0;
    inclVat += money(row, 'amountInclVat') || 0;
    const open = invoiceOutstanding(row) || 0;
    outstanding += open;
    if (invoiceReportStatus(row, today) === 'overdue') {
      overdueCount += 1;
      overdueAmount += open;
    }
  }
  return { count: (rows || []).length, exVat, inclVat, outstanding, overdueCount, overdueAmount };
}
