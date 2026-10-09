/**
 * Timerapporter: ansatt, prosjekt, periode, overtid.
 */

import { parseHours, roundHours, formatHours, sumHours } from './hours.js';
import { isOvertime, timeTypeById } from './overtime.js';

export function filterTimeEntries(entries, {
  fromDate = '',
  toDate = '',
  employeeId = '',
  projectId = '',
  status = '',
  timeType = '',
} = {}) {
  return (entries || []).filter((row) => {
    if (fromDate && row.date < fromDate) return false;
    if (toDate && row.date > toDate) return false;
    if (employeeId && row.employeeId !== employeeId) return false;
    if (projectId && row.projectId !== projectId) return false;
    if (status && row.status !== status) return false;
    if (timeType && (row.timeType || 'ordinary') !== timeType) return false;
    return true;
  });
}

export function reportByEmployee(entries) {
  const map = new Map();
  for (const row of entries) {
    const key = row.employeeId || row.employeeName || 'ukjent';
    if (!map.has(key)) {
      map.set(key, {
        employeeId: row.employeeId,
        employeeName: row.employeeName || 'Uten navn',
        hours: 0,
        billableHours: 0,
        overtimeHours: 0,
        count: 0,
      });
    }
    const agg = map.get(key);
    const h = parseHours(row.hours);
    const b = parseHours(row.billableHours ?? row.hours);
    agg.hours = roundHours(agg.hours + h);
    agg.billableHours = roundHours(agg.billableHours + b);
    if (isOvertime(row.timeType)) agg.overtimeHours = roundHours(agg.overtimeHours + h);
    agg.count += 1;
  }
  return [...map.values()].sort((a, b) => String(a.employeeName).localeCompare(String(b.employeeName), 'nb'));
}

export function reportByProject(entries) {
  const map = new Map();
  for (const row of entries) {
    const key = row.projectId || row.projectNumber || 'ukjent';
    if (!map.has(key)) {
      map.set(key, {
        projectId: row.projectId,
        projectNumber: row.projectNumber || '',
        projectName: row.projectName || 'Prosjekt',
        hours: 0,
        billableHours: 0,
        count: 0,
      });
    }
    const agg = map.get(key);
    agg.hours = roundHours(agg.hours + parseHours(row.hours));
    agg.billableHours = roundHours(agg.billableHours + parseHours(row.billableHours ?? row.hours));
    agg.count += 1;
  }
  return [...map.values()].sort((a, b) => String(a.projectNumber).localeCompare(String(b.projectNumber), 'nb'));
}

export function reportSummary(entries) {
  const hours = sumHours(entries, 'hours');
  const billable = roundHours(entries.reduce((s, r) => s + parseHours(r.billableHours ?? r.hours), 0));
  const overtime = roundHours(entries.filter((r) => isOvertime(r.timeType)).reduce((s, r) => s + parseHours(r.hours), 0));
  const approved = entries.filter((r) => r.status === 'godkjent' || r.status === 'låst').length;
  return {
    count: entries.length,
    hours,
    billableHours: billable,
    overtimeHours: overtime,
    approvedCount: approved,
    utilization: hours > 0 ? Math.round((billable / hours) * 100) : 0,
  };
}

/** CSV for eksport til lønn/fakturering. */
export function entriesToCsv(entries) {
  const header = [
    'Dato', 'Medarbeider', 'Prosjektnr', 'Prosjekt', 'Aktivitet', 'Timeart',
    'Timer', 'Fakturerbart', 'Status', 'Beskrivelse',
  ];
  const rows = entries.map((row) => [
    row.date,
    row.employeeName,
    row.projectNumber || '',
    row.projectName || '',
    row.activityName || '',
    timeTypeById(row.timeType || 'ordinary').label,
    formatHours(row.hours),
    formatHours(row.billableHours ?? row.hours),
    row.status,
    String(row.description || '').replace(/"/g, '""'),
  ].map((cell) => `"${cell ?? ''}"`).join(';'));
  return [header.join(';'), ...rows].join('\n');
}
