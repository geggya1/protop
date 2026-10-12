/**
 * Filtrering, sortering og summering av timeføringer under Arbeid · Timerapport.
 */
import { formatHours, parseHours, roundHours, sumHours } from '../arbeid/hours.js';
import { displayName } from '../employees/model.js';
import { formatDate, fold, parseDate, text } from './invoices.js';

export { formatHours, formatDate, sumHours };

const NAME_FACET_PREFIX = 'name:';
const NUMBER_FACET_PREFIX = 'number:';

function facetMatches(filterId, rowId, { name = '', number = '' } = {}) {
  const wanted = text(filterId);
  if (!wanted) return true;
  if (wanted.startsWith(NAME_FACET_PREFIX)) {
    return fold(name) === wanted.slice(NAME_FACET_PREFIX.length);
  }
  if (wanted.startsWith(NUMBER_FACET_PREFIX)) {
    return text(number) === wanted.slice(NUMBER_FACET_PREFIX.length);
  }
  return text(rowId) === wanted;
}

export const HOUR_COLUMNS = [
  { key: 'date', label: 'Dato', width: 96 },
  { key: 'employeeName', label: 'Medarbeider', flex: true, minWidth: 140 },
  { key: 'customerName', label: 'Kunde', flex: true, minWidth: 140 },
  { key: 'projectName', label: 'Prosjekt', flex: true, minWidth: 160 },
  { key: 'activityName', label: 'Aktivitet', width: 120 },
  { key: 'hours', label: 'Timer', width: 72 },
  { key: 'billableHours', label: 'Fakt.', width: 72 },
  { key: 'description', label: 'Beskrivelse', flex: true, minWidth: 160 },
  { key: 'status', label: 'Status', width: 100 },
  { key: 'internalNote', label: 'Internt notat', flex: true, minWidth: 140 },
];

export const HOUR_COLUMN_KEYS = HOUR_COLUMNS.map((column) => column.key);
export const DEFAULT_HOUR_COLUMNS = [
  'date', 'employeeName', 'customerName', 'projectName', 'activityName', 'hours', 'billableHours', 'description',
];

export const HOUR_PERIODS = [
  { id: 'all', label: 'Alle' },
  { id: '7', label: 'Siste 7 dager' },
  { id: '30', label: 'Siste 30 dager' },
  { id: '100', label: 'Siste 100 dager' },
  { id: 'year', label: 'I år' },
  { id: 'custom', label: 'Egen periode' },
];

export const HOUR_GROUP_OPTIONS = [
  { id: 'none', label: 'Ingen gruppering' },
  { id: 'date', label: 'Dato' },
  { id: 'employee', label: 'Medarbeider' },
  { id: 'customer', label: 'Kunde' },
  { id: 'project', label: 'Prosjekt' },
  { id: 'activity', label: 'Aktivitet' },
];

export const HOUR_SORT_OPTIONS = [
  { id: 'date-desc', label: 'Nyeste dato' },
  { id: 'date-asc', label: 'Eldste dato' },
  { id: 'employee', label: 'Medarbeider A–Å' },
  { id: 'customer', label: 'Kunde A–Å' },
  { id: 'project', label: 'Prosjekt' },
  { id: 'hours-desc', label: 'Flest timer' },
  { id: 'hours-asc', label: 'Færrest timer' },
];

export function periodBounds(period = 'all', fromDate = '', toDate = '', now = new Date()) {
  const startOfYear = `${now.getFullYear()}-01-01`;
  if (period === 'custom') {
    // Støtt både ISO og dd.mm.åååå — ellers blir «01.01.2016» sammenlignet
    // leksikografisk mot ISO-datoer og filteret slipper gjennom alt.
    return {
      minDate: parseDate(fromDate) || text(fromDate),
      maxDate: parseDate(toDate) || text(toDate),
    };
  }
  if (period === '7' || period === '30' || period === '100') {
    const from = new Date(now);
    from.setDate(from.getDate() - Number(period));
    return { minDate: from.toISOString().slice(0, 10), maxDate: '' };
  }
  if (period === 'year') return { minDate: startOfYear, maxDate: '' };
  return { minDate: '', maxDate: '' };
}

export function filterHours(entries, {
  query = '',
  employeeId = '',
  customerId = '',
  projectId = '',
  activityName = '',
  period = 'all',
  fromDate = '',
  toDate = '',
  billable = '',
} = {}, now = new Date()) {
  const q = fold(query);
  const { minDate, maxDate } = periodBounds(period, fromDate, toDate, now);

  return (Array.isArray(entries) ? entries : []).filter((row) => {
    if (employeeId && text(row.employeeId) !== text(employeeId)) return false;
    if (customerId && !facetMatches(customerId, row.customerId, { name: row.customerName })) return false;
    if (projectId && !facetMatches(projectId, row.projectId, {
      name: row.projectName,
      number: row.projectNumber,
    })) {
      return false;
    }
    if (activityName && fold(row.activityName) !== fold(activityName)) return false;
    if (minDate && text(row.date) < minDate) return false;
    if (maxDate && text(row.date) > maxDate) return false;
    if (billable === 'billable' && !(parseHours(row.billableHours ?? row.hours) > 0)) return false;
    if (billable === 'nonbillable' && parseHours(row.billableHours ?? 0) > 0) return false;
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
      row.internalNote,
      row.date,
    ].join(' '));
    return hay.includes(q);
  });
}

export function sortHours(entries, sort = 'date-desc') {
  const rows = (Array.isArray(entries) ? entries : []).slice();
  const byText = (key) => (left, right) => (
    String(left[key] || '').localeCompare(String(right[key] || ''), 'nb')
    || String(left.date || '').localeCompare(String(right.date || ''))
  );
  if (sort === 'date-asc') {
    return rows.sort((left, right) => String(left.date || '').localeCompare(String(right.date || ''))
      || String(left.employeeName || '').localeCompare(String(right.employeeName || ''), 'nb'));
  }
  if (sort === 'employee') return rows.sort(byText('employeeName'));
  if (sort === 'customer') return rows.sort(byText('customerName'));
  if (sort === 'project') {
    return rows.sort((left, right) => (
      String(left.projectNumber || left.projectName || '').localeCompare(
        String(right.projectNumber || right.projectName || ''),
        'nb',
      )
    ));
  }
  if (sort === 'hours-desc') {
    return rows.sort((left, right) => parseHours(right.hours) - parseHours(left.hours));
  }
  if (sort === 'hours-asc') {
    return rows.sort((left, right) => parseHours(left.hours) - parseHours(right.hours));
  }
  return rows.sort((left, right) => (
    String(right.date || '').localeCompare(String(left.date || ''))
    || String(left.employeeName || '').localeCompare(String(right.employeeName || ''), 'nb')
  ));
}

function groupLabel(row, groupBy) {
  if (groupBy === 'date') return formatDate(row.date);
  if (groupBy === 'employee') return text(row.employeeName) || 'Uten medarbeider';
  if (groupBy === 'customer') return text(row.customerName) || 'Uten kunde';
  if (groupBy === 'project') {
    return row.projectNumber
      ? `${row.projectNumber} ${row.projectName || ''}`.trim()
      : (text(row.projectName) || 'Uten prosjekt');
  }
  if (groupBy === 'activity') return text(row.activityName) || 'Uten aktivitet';
  return '';
}

function groupKey(row, groupBy) {
  if (groupBy === 'date') return text(row.date) || 'uten-dato';
  if (groupBy === 'employee') return text(row.employeeId) || fold(row.employeeName) || 'uten-ansatt';
  if (groupBy === 'customer') return text(row.customerId) || fold(row.customerName) || 'uten-kunde';
  if (groupBy === 'project') return text(row.projectId) || text(row.projectNumber) || fold(row.projectName) || 'uten-prosjekt';
  if (groupBy === 'activity') return fold(row.activityName) || 'uten-aktivitet';
  return 'all';
}

export function groupHours(entries, groupBy = 'none') {
  const rows = Array.isArray(entries) ? entries : [];
  if (!groupBy || groupBy === 'none') {
    return [{ id: 'all', label: '', rows, hours: sumHours(rows, 'hours') }];
  }
  const map = new Map();
  for (const row of rows) {
    const id = groupKey(row, groupBy);
    if (!map.has(id)) {
      map.set(id, { id, label: groupLabel(row, groupBy), rows: [], hours: 0 });
    }
    const group = map.get(id);
    group.rows.push(row);
    group.hours = roundHours(group.hours + parseHours(row.hours));
  }
  return [...map.values()];
}

export function hourFacets(entries) {
  const customers = new Map();
  const projects = new Map();
  const activities = new Map();
  for (const row of Array.isArray(entries) ? entries : []) {
    if (text(row.customerId) || text(row.customerName)) {
      const id = text(row.customerId) || `${NAME_FACET_PREFIX}${fold(row.customerName)}`;
      if (!customers.has(id)) {
        customers.set(id, { id, name: text(row.customerName) || id });
      }
    }
    if (text(row.projectId) || text(row.projectNumber) || text(row.projectName)) {
      const id = text(row.projectId)
        || (text(row.projectNumber)
          ? `${NUMBER_FACET_PREFIX}${text(row.projectNumber)}`
          : `${NAME_FACET_PREFIX}${fold(row.projectName)}`);
      if (!projects.has(id)) {
        projects.set(id, {
          id,
          name: row.projectNumber
            ? `${row.projectNumber} ${row.projectName || ''}`.trim()
            : (text(row.projectName) || id),
        });
      }
    }
    const activity = text(row.activityName);
    if (activity && !activities.has(fold(activity))) {
      activities.set(fold(activity), { id: activity, name: activity });
    }
  }
  const byName = (left, right) => String(left.name).localeCompare(String(right.name), 'nb');
  return {
    customers: [...customers.values()].sort(byName),
    projects: [...projects.values()].sort(byName),
    activities: [...activities.values()].sort(byName),
  };
}

/**
 * Visningsnavn fra register når id finnes — unngår at chip og tabell
 * viser ulike personer for samme employeeId (f.eks. Tom vs Geir).
 */
export function hydrateHourEntry(row, {
  employeesById = null,
  projectsById = null,
  customersById = null,
} = {}) {
  if (!row || typeof row !== 'object') return row;
  let employeeName = text(row.employeeName);
  let customerName = text(row.customerName);
  let customerNumber = text(row.customerNumber);
  let projectNumber = text(row.projectNumber);
  let projectName = text(row.projectName);
  const employeeId = text(row.employeeId);
  const projectId = text(row.projectId);
  const customerId = text(row.customerId);

  if (employeeId && employeesById) {
    const employee = employeesById.get(employeeId);
    if (employee) employeeName = displayName(employee) || employeeName;
  }
  if (projectId && projectsById) {
    const project = projectsById.get(projectId);
    if (project) {
      projectNumber = text(project.number) || projectNumber;
      projectName = text(project.name) || projectName;
      if (!customerId && project.customerId && customersById) {
        const fromProject = customersById.get(project.customerId);
        if (fromProject) {
          customerName = text(fromProject.name) || customerName;
          customerNumber = text(fromProject.customerNumber) || customerNumber;
        } else if (project.client) {
          customerName = text(project.client) || customerName;
        }
      } else if (!customerName && project.client) {
        customerName = text(project.client);
      }
    }
  }
  if (customerId && customersById) {
    const customer = customersById.get(customerId);
    if (customer) {
      customerName = text(customer.name) || customerName;
      customerNumber = text(customer.customerNumber) || customerNumber;
    }
  }

  if (
    employeeName === text(row.employeeName)
    && customerName === text(row.customerName)
    && customerNumber === text(row.customerNumber)
    && projectNumber === text(row.projectNumber)
    && projectName === text(row.projectName)
  ) {
    return row;
  }
  return {
    ...row,
    employeeName,
    customerName,
    customerNumber,
    projectNumber,
    projectName,
  };
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
    const label = displayName(employee);
    if (label && label !== 'Uten navn') byId.get(employee.id).name = label;
  }
  return [...byId.values()]
    .filter((row) => row.hours > 0)
    .sort((left, right) => left.name.localeCompare(right.name, 'nb'));
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
