/**
 * Aggregeringer til prosjektets Hovedside (KPI, diagram, hurtigkort).
 */

import { parseHours, roundHours } from '../arbeid/hours.js';
import { formatMoney } from '../economy/invoices.js';

function text(value) {
  return String(value ?? '').trim();
}

function monthKey(dateStr) {
  const raw = text(dateStr);
  if (/^\d{4}-\d{2}/.test(raw)) return raw.slice(0, 7);
  return '';
}

function monthLabel(key) {
  if (!key) return '';
  const [y, m] = key.split('-');
  const names = ['jan.', 'feb.', 'mar.', 'apr.', 'mai', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
  const idx = Number(m) - 1;
  return `${names[idx] || m} ${y}`;
}

/** Timer per måned for siste N måneder (inkl. inneværende). */
export function hoursByMonth(timeEntries = [], months = 12, now = new Date()) {
  const keys = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    keys.push(key);
  }
  const map = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of timeEntries) {
    const key = monthKey(row.date);
    if (key in map) map[key] += parseHours(row.hours);
  }
  const max = Math.max(0.01, ...keys.map((key) => map[key]));
  return keys.map((key) => ({
    key,
    label: monthLabel(key),
    hours: roundHours(map[key]),
    pct: Math.round((map[key] / max) * 100),
  }));
}

/** Kalenderår jan–des for ett gitt år. */
export function hoursByCalendarYear(timeEntries = [], year) {
  const y = Number(year);
  const keys = Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`);
  const map = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of timeEntries) {
    const key = monthKey(row.date);
    if (key in map) map[key] += parseHours(row.hours);
  }
  const total = keys.reduce((sum, key) => sum + map[key], 0);
  const max = Math.max(0.01, ...keys.map((key) => map[key]));
  return {
    year: y,
    total: roundHours(total),
    bars: keys.map((key) => ({
      key,
      label: monthLabel(key),
      hours: roundHours(map[key]),
      pct: Math.round((map[key] / max) * 100),
    })),
  };
}

/**
 * Timeforbruk-diagram: inneværende år, eller foregående år hvis inneværende er tomt.
 */
export function hoursChartForOverview(timeEntries = [], now = new Date()) {
  const year = now.getFullYear();
  const current = hoursByCalendarYear(timeEntries, year);
  if (current.total > 0) {
    return { ...current, fallback: false, titleYear: year };
  }
  const prev = hoursByCalendarYear(timeEntries, year - 1);
  if (prev.total > 0) {
    return { ...prev, fallback: true, titleYear: year - 1 };
  }
  return { ...current, fallback: false, titleYear: year };
}

function parseIsoDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return null;
  const [y, m, d] = raw.slice(0, 10).split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Prosjektperiode som fremdriftssøyle.
 * Mangler start eller slutt → ready:false (vis tom tilstand).
 */
export function projectPeriodProgress(start, end, today = new Date()) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) {
    return {
      ready: false,
      pct: 0,
      start: text(start),
      end: text(end),
    };
  }
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();
  if (endMs <= startMs) {
    return { ready: true, pct: 100, start: text(start).slice(0, 10), end: text(end).slice(0, 10) };
  }
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const pct = Math.max(0, Math.min(100, Math.round(((todayMs - startMs) / (endMs - startMs)) * 100)));
  return {
    ready: true,
    pct,
    start: text(start).slice(0, 10),
    end: text(end).slice(0, 10),
  };
}

export function expenseSummaryForProject(expenses = [], projectId) {
  const rows = (expenses || []).filter((row) => text(row.projectId) === text(projectId));
  let total = 0;
  let unbilled = 0;
  let billed = 0;
  let unbilledCount = 0;
  let billedCount = 0;
  for (const row of rows) {
    const amount = Number(row.amountExVat) || 0;
    total += amount;
    if (row.status === 'invoiced') {
      billed += amount;
      billedCount += 1;
    } else {
      unbilled += amount;
      unbilledCount += 1;
    }
  }
  return {
    count: rows.length,
    total,
    unbilled,
    billed,
    unbilledCount,
    billedCount,
    rows,
  };
}

export function salesSummaryForProject(sales = [], projectId) {
  const rows = (sales || []).filter((row) => text(row.projectId) === text(projectId));
  let total = 0;
  let cost = 0;
  let unbilled = 0;
  let billed = 0;
  let unbilledCount = 0;
  let billedCount = 0;
  for (const row of rows) {
    const amount = Number(row.amountExVat) || 0;
    const unitCost = Number(row.purchaseUnitPrice) || Number(row.costExVat) || 0;
    const qty = Number(row.quantity) || 0;
    total += amount;
    cost += unitCost * qty;
    if (row.status === 'invoiced') {
      billed += amount;
      billedCount += 1;
    } else {
      unbilled += amount;
      unbilledCount += 1;
    }
  }
  const margin = total > 0 ? Math.round(((total - cost) / total) * 100) : 0;
  return {
    count: rows.length,
    total,
    cost,
    margin,
    unbilled,
    billed,
    unbilledCount,
    billedCount,
    rows,
  };
}

/** KPI-rad for Hovedside. */
export function projectDashboardKpis({
  cross,
  summary,
  members = [],
  project,
  estimatedHours = 0,
}) {
  const revenue = Number(cross?.honorarAmount)
    || Number(cross?.contractValue)
    || Number(cross?.totals?.amountExVat)
    || 0;
  const invoiced = Number(cross?.totals?.amountExVat) || 0;
  const remaining = Math.max(0, revenue - invoiced);
  const invoicedPct = revenue > 0 ? Math.min(100, Math.round((invoiced / revenue) * 100)) : 0;
  const hours = Number(summary?.hours) || 0;
  const est = Number(estimatedHours) || Number(project?.totalPlanned) || 0;
  const hoursPct = est > 0 ? Math.min(100, Math.round((hours / est) * 100)) : 0;
  const status = project?.projectStatus || project?.phase || 'Under arbeid';
  return {
    revenue,
    revenueLabel: formatMoney(revenue),
    invoiced,
    invoicedLabel: formatMoney(invoiced),
    invoicedPct,
    remaining,
    remainingLabel: formatMoney(remaining),
    hours,
    estimatedHours: est,
    hoursPct,
    memberCount: members.length,
    status,
  };
}

export function memberHoursMap(timeEntries = [], members = []) {
  const map = new Map();
  for (const row of timeEntries) {
    const id = text(row.employeeId);
    if (!id) continue;
    map.set(id, roundHours((map.get(id) || 0) + parseHours(row.hours)));
  }
  return (members || []).map((mem) => ({
    ...mem,
    hours: map.get(text(mem.employeeId)) || 0,
  }));
}
