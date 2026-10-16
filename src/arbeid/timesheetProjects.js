/** Synlige prosjekter i timelisten: timer siste to måneder, eller stjernemerket. */

import { parseHours } from './hours.js';
import { monthDateRange, pad2, toDateKey } from './calendar.js';

/**
 * Aktivitetsvindu: fra 1. i måneden to måneder tilbake, til i dag.
 * (f.eks. 14. okt → 2026-08-01 … 2026-10-14)
 */
export function timesheetActivityRange(today = new Date()) {
  const base = today instanceof Date ? today : new Date(today);
  const from = new Date(base.getFullYear(), base.getMonth() - 2, 1);
  return {
    fromDate: `${from.getFullYear()}-${pad2(from.getMonth() + 1)}-01`,
    toDate: toDateKey(base),
  };
}

/** Union av aktivitetsvindu og synlig måned (for lasting av timer). */
export function timesheetHoursLoadRange(activity, monthRange) {
  const fromDate = [activity?.fromDate, monthRange?.fromDate]
    .filter(Boolean)
    .sort()[0] || '';
  const toDate = [activity?.toDate, monthRange?.toDate]
    .filter(Boolean)
    .sort()
    .at(-1) || '';
  return { fromDate, toDate };
}

/**
 * Vinduer timelisten faktisk skal hente.
 * Overlapp med aktivitetsperioden blir ett vindu.
 * En eldre måned hentes for seg, så januar ikke drar med hele året frem til i dag.
 */
export function timesheetHourWindows(today, year, monthIndex) {
  const activity = timesheetActivityRange(today);
  const month = monthDateRange(year, monthIndex);
  const monthInside = month.fromDate >= activity.fromDate && month.toDate <= activity.toDate;
  if (monthInside) return [activity];
  const overlaps = month.fromDate <= activity.toDate && month.toDate >= activity.fromDate;
  if (overlaps) {
    return [{
      fromDate: month.fromDate < activity.fromDate ? month.fromDate : activity.fromDate,
      toDate: month.toDate > activity.toDate ? month.toDate : activity.toDate,
    }];
  }
  return [activity, month];
}

function hasHoursInWindow(entries, employeeId, projectId, fromDate, toDate) {
  const emp = String(employeeId || '');
  const pid = String(projectId || '');
  const from = String(fromDate || '');
  const to = String(toDate || '');
  for (const row of entries || []) {
    if (String(row.employeeId || '') !== emp) continue;
    if (String(row.projectId || '') !== pid) continue;
    if (parseHours(row.hours) <= 0) continue;
    const date = String(row.date || '');
    if (from && date < from) continue;
    if (to && date > to) continue;
    return true;
  }
  return false;
}

/**
 * Behold prosjekt med timer i aktivitetsvinduet, eller som er stjernemerket.
 * Medlemskap eller «nylig lagt til» er ikke nok — uten timer siste to måneder
 * skjules raden til den stjernes.
 * Synlig måned utenfor vinduet (eldre historikk) viser likevel prosjekt med timer der.
 * Ved søk (keepAll) hoppes filteret over.
 */
export function isTimesheetProjectVisible(row, {
  timeEntries = [],
  employeeId = '',
  activityFrom = '',
  activityTo = '',
  viewFrom = '',
  viewTo = '',
  keepAll = false,
} = {}) {
  if (keepAll) return true;
  if (row?.starred) return true;
  const projectId = row?.project?.id || row?.id;
  if (hasHoursInWindow(timeEntries, employeeId, projectId, activityFrom, activityTo)) return true;
  const outsideActivity = Boolean(
    viewFrom && viewTo && activityFrom && (viewFrom < activityFrom || viewTo > activityTo),
  );
  if (outsideActivity && hasHoursInWindow(timeEntries, employeeId, projectId, viewFrom, viewTo)) {
    return true;
  }
  return false;
}

export function filterTimesheetProjects(rows, options = {}) {
  return (Array.isArray(rows) ? rows : []).filter((row) => isTimesheetProjectVisible(row, options));
}

const MIN_DAY_W = 40;
const MIN_LABEL_W = 200;
const MAX_LABEL_W = 360;
const MIN_TOTAL_W = 56;
const MAX_TOTAL_W = 80;

/** Dynamiske kolonnebredder som fyller disponibel plass. */
export function timesheetColumnMetrics(availableWidth, dayCount) {
  const width = Math.max(0, Number(availableWidth) || 0);
  const days = Math.max(1, Number(dayCount) || 1);
  const labelW = width
    ? Math.min(MAX_LABEL_W, Math.max(MIN_LABEL_W, Math.round(width * 0.24)))
    : MIN_LABEL_W;
  const totalW = width
    ? Math.min(MAX_TOTAL_W, Math.max(MIN_TOTAL_W, Math.round(width * 0.06)))
    : MIN_TOTAL_W;
  const remaining = width ? Math.max(0, width - labelW - totalW) : days * MIN_DAY_W;
  const dayW = Math.max(MIN_DAY_W, Math.floor(remaining / days));
  const gridWidth = labelW + dayW * days + totalW;
  return { labelW, dayW, totalW, gridWidth, daysWidth: dayW * days };
}
