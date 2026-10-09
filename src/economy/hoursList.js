/**
 * Filtrering og summering av timeføringer under Økonomi · Timer.
 */
import { formatHours, parseHours, roundHours, sumHours } from '../arbeid/hours.js';
import { formatDate, fold, text } from './invoices.js';

export { formatHours, formatDate, sumHours };

export function filterHours(entries, {
  query = '',
  employeeId = '',
  customerId = '',
  projectId = '',
  period = 'all',
} = {}) {
  const q = fold(query);
  const now = new Date();
  const startOfYear = `${now.getFullYear()}-01-01`;
  let minDate = '';
  if (period === '7' || period === '30' || period === '100') {
    const days = Number(period);
    const from = new Date(now);
    from.setDate(from.getDate() - days);
    minDate = from.toISOString().slice(0, 10);
  } else if (period === 'year') {
    minDate = startOfYear;
  }

  return (Array.isArray(entries) ? entries : []).filter((row) => {
    if (employeeId && text(row.employeeId) !== text(employeeId)) return false;
    if (customerId && text(row.customerId) !== text(customerId)) return false;
    if (projectId && text(row.projectId) !== text(projectId)) return false;
    if (minDate && text(row.date) < minDate) return false;
    if (!q) return true;
    const hay = fold([
      row.employeeName,
      row.employeeNumber,
      row.customerName,
      row.customerNumber,
      row.projectName,
      row.projectNumber,
      row.activityName,
      row.description,
      row.date,
    ].join(' '));
    return hay.includes(q);
  });
}

export function hourTotals(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const hours = sumHours(rows, 'hours');
  const billable = sumHours(rows, 'billableHours');
  return {
    count: rows.length,
    hours,
    billable,
    nonBillable: roundHours(hours - billable),
  };
}

export function employeeHourOptions(entries, employees = []) {
  const byId = new Map();
  for (const row of Array.isArray(entries) ? entries : []) {
    const id = text(row.employeeId);
    if (!id) continue;
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: text(row.employeeName) || id,
        hours: 0,
      });
    }
    byId.get(id).hours = roundHours(byId.get(id).hours + parseHours(row.hours));
  }
  for (const employee of employees) {
    if (!byId.has(employee.id)) continue;
    const label = [employee.person?.firstName, employee.person?.lastName].filter(Boolean).join(' ');
    if (label) byId.get(employee.id).name = label;
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name, 'nb'));
}
