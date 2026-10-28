/**
 * Filter og sortering for prosjektutlegg.
 */
import { EXPENSE_STATUSES } from './expenses.js';
import { fold, parseDate, text } from './invoices.js';
import { periodBounds } from './hoursList.js';

export const EXPENSE_PERIODS = [
  { id: 'all', label: 'Alle' },
  { id: '30', label: 'Siste 30 dager' },
  { id: 'year', label: 'I år' },
  { id: 'custom', label: 'Egen periode' },
];

export const EXPENSE_SORT_OPTIONS = [
  { id: 'date-desc', label: 'Nyeste dato' },
  { id: 'date-asc', label: 'Eldste dato' },
  { id: 'employee', label: 'Medarbeider A–Å' },
  { id: 'customer', label: 'Kunde A–Å' },
  { id: 'project', label: 'Prosjekt' },
  { id: 'amount-desc', label: 'Høyeste beløp' },
  { id: 'amount-asc', label: 'Laveste beløp' },
  { id: 'status', label: 'Status' },
];

/**
 * Status slik den vises. Et utlegg som ikke er godkjent ennå, venter på godkjenning
 * (det kommer ikke med i Til fakturering før det er godkjent).
 */
export function expenseStatusLabel(status) {
  const id = text(status) || 'draft';
  if (id === 'draft' || id === 'submitted') return 'Venter på godkjenning';
  return EXPENSE_STATUSES.find((row) => row.id === id)?.label || text(status);
}

/**
 * Utlegg for én medarbeider (Prosjektutlegg på ansattsiden).
 * Rader uten kobling følger eksternt ansattnummer eller navn, som ved import.
 */
export function expensesForEmployee(rows, employee) {
  const id = text(employee?.id);
  if (!id) return [];
  const first = text(employee?.person?.firstName);
  const last = text(employee?.person?.lastName);
  const names = new Set([fold(`${first} ${last}`), fold(`${last} ${first}`)].filter(Boolean));
  const number = text(employee?.company?.externalEmployeeNumber);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    const owner = text(row?.employeeId);
    if (owner) return owner === id;
    if (number && text(row?.employeeNumber) === number) return true;
    return names.size > 0 && names.has(fold(row?.employeeName));
  });
}

export function filterExpenses(rows, {
  query = '',
  employeeId = '',
  employeeQuery = '',
  customerId = '',
  customerQuery = '',
  projectId = '',
  projectQuery = '',
  status = '',
  period = 'all',
  fromDate = '',
  toDate = '',
} = {}, now = new Date()) {
  const q = fold(query);
  const employeeQ = fold(employeeQuery);
  const customerQ = fold(customerQuery);
  const projectQ = fold(projectQuery);
  const { minDate, maxDate } = periodBounds(period, fromDate, toDate, now);
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (employeeId && text(row.employeeId) !== text(employeeId)) return false;
    if (customerId && text(row.customerId) !== text(customerId)) return false;
    if (projectId && text(row.projectId) !== text(projectId)) return false;
    if (status && text(row.status) !== text(status)) return false;
    if (minDate && text(row.date) < minDate) return false;
    if (maxDate && text(row.date) > maxDate) return false;
    if (employeeQ) {
      const hay = fold([row.employeeName, row.employeeNumber].join(' '));
      if (!hay.includes(employeeQ)) return false;
    }
    if (customerQ) {
      const hay = fold([row.customerName, row.customerNumber].join(' '));
      if (!hay.includes(customerQ)) return false;
    }
    if (projectQ) {
      const hay = fold([row.projectName, row.projectNumber].join(' '));
      if (!hay.includes(projectQ)) return false;
    }
    if (!q) return true;
    const blob = fold([
      row.date,
      row.employeeName,
      row.customerName,
      row.customerNumber,
      row.projectName,
      row.projectNumber,
      row.description,
      row.purpose,
      row.vendor,
      row.status,
      row.externalInvoiceNumber,
    ].join(' '));
    return blob.includes(q);
  });
}

export function sortExpenses(rows, sort = 'date-desc') {
  const list = (Array.isArray(rows) ? rows : []).slice();
  const byText = (key) => (left, right) => (
    String(left[key] || '').localeCompare(String(right[key] || ''), 'nb')
    || String(right.date || '').localeCompare(String(left.date || ''))
  );
  if (sort === 'date-asc') {
    return list.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  }
  if (sort === 'employee') return list.sort(byText('employeeName'));
  if (sort === 'customer') return list.sort(byText('customerName'));
  if (sort === 'project') {
    return list.sort((a, b) => String(a.projectNumber || a.projectName || '').localeCompare(
      String(b.projectNumber || b.projectName || ''),
      'nb',
    ));
  }
  if (sort === 'amount-desc') {
    return list.sort((a, b) => (Number(b.amountInclVat) || 0) - (Number(a.amountInclVat) || 0));
  }
  if (sort === 'amount-asc') {
    return list.sort((a, b) => (Number(a.amountInclVat) || 0) - (Number(b.amountInclVat) || 0));
  }
  if (sort === 'status') return list.sort(byText('status'));
  return list.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export function expenseFacets(rows = []) {
  const employees = new Map();
  const customers = new Map();
  const projects = new Map();
  for (const row of rows) {
    if (row.employeeId && !employees.has(row.employeeId)) {
      employees.set(row.employeeId, row.employeeName || row.employeeId);
    }
    if (row.customerId && !customers.has(row.customerId)) {
      customers.set(row.customerId, row.customerName || row.customerNumber || row.customerId);
    }
    if (row.projectId && !projects.has(row.projectId)) {
      projects.set(row.projectId, [row.projectNumber, row.projectName].filter(Boolean).join(' '));
    }
  }
  const asList = (map) => [...map.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'nb'));
  return {
    employees: asList(employees),
    customers: asList(customers),
    projects: asList(projects),
  };
}

export function normalizeFilterDate(value) {
  return parseDate(value) || text(value);
}
