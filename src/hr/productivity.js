/**
 * Produktivitet: utfakturerbare timer vs ikke-fakturerbare.
 * Bygger på timeEntries.billableHours / hours fra Arbeid/Økonomi.
 */

function text(value) {
  return String(value ?? '').trim();
}

function hoursOf(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

export function entryProductivity(entry) {
  const total = hoursOf(entry?.hours);
  let billable = entry?.billableHours == null ? total : hoursOf(entry.billableHours);
  if (billable > total && total > 0) billable = total;
  const nonBillable = Math.max(0, total - billable);
  return { total, billable, nonBillable };
}

export function summarizeProductivity(entries, { employeeId = '' } = {}) {
  const emp = text(employeeId);
  let total = 0;
  let billable = 0;
  let nonBillable = 0;
  let entryCount = 0;
  for (const entry of entries || []) {
    if (emp && text(entry?.employeeId) !== emp) continue;
    const row = entryProductivity(entry);
    if (!(row.total > 0) && !(row.billable > 0)) continue;
    total += row.total;
    billable += row.billable;
    nonBillable += row.nonBillable;
    entryCount += 1;
  }
  const utilization = total > 0 ? billable / total : 0;
  return {
    entryCount,
    total: round1(total),
    billable: round1(billable),
    nonBillable: round1(nonBillable),
    utilization,
    utilizationPct: Math.round(utilization * 1000) / 10,
  };
}

/**
 * Skala 0–100 for visning. Mål (targetPct) brukes til farge/etikett.
 * Standard mål 75 % er vanlig i rådgivning/konsulentbransjen.
 */
export function utilizationBand(utilizationPct, targetPct = 75) {
  const pct = Number(utilizationPct) || 0;
  const target = Number(targetPct) || 75;
  if (pct >= target + 10) {
    return { id: 'strong', label: 'Sterk utnyttelse', tone: 'good' };
  }
  if (pct >= target) {
    return { id: 'on_target', label: 'På mål', tone: 'good' };
  }
  if (pct >= target - 15) {
    return { id: 'watch', label: 'Under mål', tone: 'warn' };
  }
  return { id: 'low', label: 'Lav utnyttelse', tone: 'bad' };
}

export function productivityByEmployee(entries, employees, { targetPct = 75 } = {}) {
  const ids = new Set();
  for (const emp of employees || []) {
    if (emp?.id) ids.add(text(emp.id));
  }
  for (const entry of entries || []) {
    const id = text(entry?.employeeId);
    if (id) ids.add(id);
  }
  const rows = [];
  for (const id of ids) {
    if (!id) continue;
    const employee = (employees || []).find((row) => text(row.id) === id) || null;
    const summary = summarizeProductivity(entries, { employeeId: id });
    if (!summary.total && !employee) continue;
    const target = Number(employee?.extras?.timeSettings?.utilizationTarget) || targetPct;
    rows.push({
      employeeId: id,
      employee,
      ...summary,
      targetPct: target,
      band: utilizationBand(summary.utilizationPct, target),
    });
  }
  return rows.sort((a, b) => b.utilizationPct - a.utilizationPct
    || String(a.employeeId).localeCompare(String(b.employeeId)));
}

export function companyProductivity(entries, { targetPct = 75 } = {}) {
  const summary = summarizeProductivity(entries);
  return {
    ...summary,
    targetPct,
    band: utilizationBand(summary.utilizationPct, targetPct),
  };
}
