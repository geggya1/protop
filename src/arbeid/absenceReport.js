/**
 * Fraværsrapport: kolonner, periode, filter og sortering for dagstabell.
 */
import { absenceTypeById } from './absenceCatalog.js';
import { absenceCategory } from './absenceDashboard.js';
import { formatHours, parseHours, roundHours } from './hours.js';
import { fold, formatDate, parseDate, text } from '../economy/invoices.js';
import { periodBounds } from '../economy/hoursList.js';

export { formatHours };

export const ABSENCE_REPORT_COLUMNS = [
  { key: 'date', label: 'Dato', width: 96 },
  { key: 'employeeName', label: 'Medarbeider', flex: true, minWidth: 150 },
  { key: 'employeeNumber', label: 'Eksternt ansattnummer', width: 120 },
  { key: 'typeLabel', label: 'Type', flex: true, minWidth: 160 },
  { key: 'percent', label: 'Fraværsprosent', width: 100 },
  { key: 'statusLabel', label: 'Status', width: 110 },
  { key: 'assessedBy', label: 'Vurdert av', width: 120 },
  { key: 'description', label: 'Beskrivelse', flex: true, minWidth: 160 },
  { key: 'hours', label: 'Timer', width: 72 },
  { key: 'paidHours', label: 'Timer med lønn', width: 110 },
];

export const ABSENCE_REPORT_COLUMN_KEYS = ABSENCE_REPORT_COLUMNS.map((column) => column.key);

export const DEFAULT_ABSENCE_REPORT_COLUMNS = [
  'date', 'employeeName', 'typeLabel', 'description', 'hours', 'paidHours', 'statusLabel',
];

export const ABSENCE_REPORT_PERIODS = [
  { id: 'all', label: 'Alle' },
  { id: '7', label: 'Siste 7 dager' },
  { id: '30', label: 'Siste 30 dager' },
  { id: '100', label: 'Siste 100 dager' },
  { id: 'year', label: 'I år' },
  { id: 'custom', label: 'Egen periode' },
];

export const ABSENCE_REPORT_SORT_OPTIONS = [
  { id: 'date-desc', label: 'Nyeste dato' },
  { id: 'date-asc', label: 'Eldste dato' },
  { id: 'employee', label: 'Medarbeider A–Å' },
  { id: 'type', label: 'Type' },
  { id: 'hours-desc', label: 'Flest timer' },
  { id: 'hours-asc', label: 'Færrest timer' },
];

export const ABSENCE_REPORT_TYPE_FILTERS = [
  { id: '', label: 'Alle typer' },
  { id: 'ferie', label: 'Ferie' },
  { id: 'sykdom', label: 'Sykdom' },
  { id: 'permisjon', label: 'Permisjon' },
  { id: 'annet', label: 'Annet' },
];

export const ABSENCE_REPORT_STATUS_FILTERS = [
  { id: '', label: 'Alle statuser' },
  { id: 'registrert', label: 'Til behandling' },
  { id: 'godkjent', label: 'Godkjent' },
  { id: 'låst', label: 'Låst' },
];

const STATUS_LABEL = {
  registrert: 'Til behandling',
  godkjent: 'Godkjent',
  låst: 'Låst',
};

export function absenceStatusLabel(status) {
  return STATUS_LABEL[status] || STATUS_LABEL.registrert;
}

export function hydrateAbsenceReportRow(row, { names = {}, employeesById = new Map() } = {}) {
  if (!row) return null;
  const type = absenceTypeById(row.type || 'ferie');
  const hours = roundHours(row.hours);
  const paid = type.paid !== false;
  const employee = employeesById.get(row.employeeId);
  return {
    ...row,
    employeeName: names[row.employeeId]
      || row.employeeName
      || employee?.person?.firstName
      || 'Ansatt',
    employeeNumber: text(row.employeeNumber)
      || text(employee?.company?.externalEmployeeNumber),
    typeLabel: type.label,
    category: absenceCategory(row.type),
    statusLabel: absenceStatusLabel(row.status),
    hours,
    paidHours: paid ? hours : 0,
    percent: row.percent == null ? null : Number(row.percent),
    dateLabel: formatDate(row.date),
    hoursLabel: formatHours(hours),
    paidHoursLabel: formatHours(paid ? hours : 0),
  };
}

export function filterAbsenceReport(rows, {
  query = '',
  employeeId = '',
  category = '',
  typeId = '',
  status = '',
  period = 'all',
  fromDate = '',
  toDate = '',
} = {}, now = new Date()) {
  const q = fold(query);
  const { minDate, maxDate } = periodBounds(period, fromDate, toDate, now);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (employeeId && text(row.employeeId) !== text(employeeId)) return false;
    if (typeId && text(row.type || 'ferie') !== text(typeId)) return false;
    if (category && absenceCategory(row.type) !== category) return false;
    if (status && text(row.status || 'registrert') !== text(status)) return false;
    const date = text(row.date);
    if (minDate && date < minDate) return false;
    if (maxDate && date > maxDate) return false;
    if (!q) return true;
    const hay = fold([
      row.employeeName,
      row.employeeNumber,
      row.typeLabel,
      row.type,
      row.description,
      row.assessedBy,
      row.statusLabel,
      row.date,
    ].join(' '));
    return hay.includes(q);
  });
}

export function sortAbsenceReport(rows, sort = 'date-desc') {
  const list = [...(Array.isArray(rows) ? rows : [])];
  list.sort((a, b) => {
    if (sort === 'date-asc') return text(a.date).localeCompare(text(b.date)) || text(a.employeeName).localeCompare(text(b.employeeName), 'nb');
    if (sort === 'employee') {
      return text(a.employeeName).localeCompare(text(b.employeeName), 'nb') || text(b.date).localeCompare(text(a.date));
    }
    if (sort === 'type') {
      return text(a.typeLabel).localeCompare(text(b.typeLabel), 'nb') || text(b.date).localeCompare(text(a.date));
    }
    if (sort === 'hours-desc') return parseHours(b.hours) - parseHours(a.hours);
    if (sort === 'hours-asc') return parseHours(a.hours) - parseHours(b.hours);
    // date-desc
    return text(b.date).localeCompare(text(a.date)) || text(a.employeeName).localeCompare(text(b.employeeName), 'nb');
  });
  return list;
}

export function absenceReportTotals(rows) {
  let hours = 0;
  let paidHours = 0;
  let ferie = 0;
  let sykdom = 0;
  let annet = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    hours = roundHours(hours + parseHours(row.hours));
    paidHours = roundHours(paidHours + parseHours(row.paidHours));
    const cat = row.category || absenceCategory(row.type);
    if (cat === 'ferie') ferie += 1;
    else if (cat === 'sykdom') sykdom += 1;
    else annet += 1;
  }
  return {
    count: (rows || []).length,
    hours,
    paidHours,
    ferie,
    sykdom,
    annet,
  };
}

export function dayRowAsPeriod(row) {
  if (!row) return null;
  return {
    id: row.id,
    ids: [row.id],
    employeeId: row.employeeId,
    employeeName: row.employeeName,
    type: row.type || 'ferie',
    typeLabel: row.typeLabel || absenceTypeById(row.type).label,
    start: row.date,
    end: row.date,
    hours: roundHours(row.hours),
    status: row.status || 'registrert',
  };
}

export function normalizeReportDateInput(value) {
  return parseDate(value) || text(value);
}
