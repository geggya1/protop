import {
  appliesOnDate, dateKey, onceRangeBounds, parseDateKey,
} from './dates.js';

/** Engangsoppgave med flere dagers arbeidsperiode (typisk lekser). */
export function isRangeOnceTask(task) {
  if (String(task?.type || '').toLowerCase() !== 'once') return false;
  const range = onceRangeBounds(task);
  return !!(range && range.start !== range.end);
}

export function valueForTask(t) {
  if (t?.rewardType === 'none') return 0;
  if (t?.rewardType === 'money') return Math.max(0, Math.round(Number(t.moneyValue || 0)));
  return Math.max(0, Math.round(Number(t.points || t.value || 0)));
}

export function todosOnDate(todos, date) {
  return (todos || []).filter((t) => appliesOnDate(t, date));
}

export function isDoneOn(task, date) {
  const k = typeof date === 'string' ? date : dateKey(date);
  const completed = Array.isArray(task.completedDates) ? task.completedDates : [];
  if (!completed.length) return false;

  if (isRangeOnceTask(task)) {
    const { start, end } = onceRangeBounds(task);
    return completed.some((d) => d >= start && d <= end);
  }
  return completed.includes(k);
}

export function isAttestedOn(task, date) {
  const k = typeof date === 'string' ? date : dateKey(date);
  const ad = task?.attestedDates;
  if (!ad || typeof ad !== 'object') return false;
  if (isRangeOnceTask(task)) {
    const { start, end } = onceRangeBounds(task);
    return Object.keys(ad).some((d) => d >= start && d <= end);
  }
  return !!ad[k];
}

/** Child checked off, waiting for parent confirmation. */
export function isPendingAttestOn(task, date) {
  return isDoneOn(task, date) && !isAttestedOn(task, date);
}

export function scoreInKeys(todos, keys) {
  let earned = 0;
  let possible = 0;
  let done = 0;
  let total = 0;
  const keySet = keys || [];
  (todos || []).forEach((t) => {
    if (isRangeOnceTask(t)) {
      const { start, end } = onceRangeBounds(t);
      const overlaps = keySet.some((k) => k >= start && k <= end);
      if (!overlaps) return;
      total += 1;
      possible += valueForTask(t);
      if (isDoneOn(t, start)) {
        done += 1;
        earned += valueForTask(t);
      }
      return;
    }
    keySet.forEach((k) => {
      const d = new Date(`${k}T12:00:00`);
      if (!appliesOnDate(t, d)) return;
      total += 1;
      possible += valueForTask(t);
      if (isDoneOn(t, k)) {
        done += 1;
        earned += valueForTask(t);
      }
    });
  });
  return { earned, possible, done, total };
}

export { parseDateKey };
