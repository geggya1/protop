/** Lås av timeliste frem til en dato. Timer venter på kontroll til de er godkjent. */

export function lockThroughDate(locks, employeeId) {
  const id = String(employeeId || '').trim();
  let through = '';
  for (const row of locks || []) {
    if (!row || row.employeeId !== id) continue;
    const date = String(row.throughDate || '');
    if (date && date > through) through = date;
  }
  return through;
}

export function lockRowFor(locks, employeeId) {
  const through = lockThroughDate(locks, employeeId);
  if (!through) return null;
  return (locks || []).find((row) => row.employeeId === employeeId && row.throughDate === through) || null;
}

export function isDateLocked(throughDate, dateKey) {
  const through = String(throughDate || '');
  const date = String(dateKey || '');
  return !!(through && date && date <= through);
}
