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

/**
 * Prosjektrader for én dag (Moment-timeliste).
 * Viser medlemsprosjekter + prosjekter med føring den dagen.
 */
export function dayTimesheetRows({
  entries = [],
  projects = [],
  members = [],
  date = '',
  employeeId = '',
} = {}) {
  const day = text(date);
  const emp = text(employeeId);
  if (!day) return { rows: [], totalHours: 0 };

  const projectById = new Map((projects || []).map((row) => [row.id, row]));
  const roleByProject = new Map();
  for (const member of members || []) {
    if (emp && text(member.employeeId) !== emp) continue;
    if (member.active === false) continue;
    roleByProject.set(text(member.projectId), text(member.role) || 'Prosjektmedlem');
  }

  const hoursByProject = new Map();
  const metaByProject = new Map();
  for (const entry of entries || []) {
    if (text(entry.date) !== day) continue;
    if (emp && text(entry.employeeId) !== emp) continue;
    const projectId = text(entry.projectId);
    if (!projectId) continue;
    hoursByProject.set(projectId, roundHours((hoursByProject.get(projectId) || 0) + parseHours(entry.hours)));
    if (!metaByProject.has(projectId)) {
      metaByProject.set(projectId, {
        customer: text(entry.customerName),
        number: text(entry.projectNumber),
        name: text(entry.projectName),
      });
    }
  }

  const ids = new Set([...roleByProject.keys(), ...hoursByProject.keys()]);
  const rows = [...ids].map((projectId) => {
    const project = projectById.get(projectId);
    const meta = metaByProject.get(projectId) || {};
    return {
      id: projectId,
      number: text(project?.number) || meta.number,
      name: text(project?.name) || meta.name || 'Prosjekt',
      customer: text(project?.client) || meta.customer,
      role: roleByProject.get(projectId) || '',
      hours: hoursByProject.get(projectId) || 0,
    };
  }).sort((left, right) => {
    if ((right.hours > 0) !== (left.hours > 0)) return right.hours > 0 ? 1 : -1;
    return String(left.number || left.name).localeCompare(String(right.number || right.name), 'nb');
  });

  const totalHours = roundHours(rows.reduce((sum, row) => sum + row.hours, 0));
  return { rows, totalHours };
}

export function shiftDateKey(dateKey, deltaDays) {
  const raw = text(dateKey);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date();
  base.setDate(base.getDate() + Number(deltaDays || 0));
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, '0');
  const d = String(base.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
