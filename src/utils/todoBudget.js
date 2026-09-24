import { appliesOnDate, dateKey, isoWeekKeys, onceRangeBounds, parseDateKey } from './dates.js';
import { normalizeRewardMode } from './rewardModes.js';

/** Same money/points/none rule as the chore list. */
export function todoRewardMode(t) {
  if (!t) return 'points';
  if (t.rewardType === 'none' || t.rewardType === 'money' || t.rewardType === 'points') {
    return t.rewardType;
  }
  return Number(t.moneyValue || 0) > 0 ? 'money' : 'points';
}

export function valueForTask(t) {
  const mode = todoRewardMode(t);
  if (mode === 'none') return 0;
  if (mode === 'money') {
    return Math.max(0, Math.round(Number(t.moneyValue || t.value || 0)));
  }
  return Math.max(0, Math.round(Number(t.points || t.value || 0)));
}

export function filterTodosByRewardMode(todos, mode) {
  const eff = normalizeRewardMode(mode || 'points');
  return (todos || []).filter((t) => todoRewardMode(t) === eff);
}

/**
 * Yellow-card denominator: settings budget when set, otherwise planned chores.
 */
export function weekRewardCap(weeklyBudget, weekPossible) {
  const budget = Math.max(0, Math.round(Number(weeklyBudget) || 0));
  if (budget > 0) return budget;
  return Math.max(0, Math.round(Number(weekPossible) || 0));
}

export function weekKeysForDateKey(dateKeyStr) {
  if (dateKeyStr && /^\d{4}-\d{2}-\d{2}/.test(String(dateKeyStr))) {
    return isoWeekKeys(parseDateKey(String(dateKeyStr).slice(0, 10)));
  }
  return isoWeekKeys(new Date());
}

/** Which calendar day the money-mode week overview should follow. */
export function budgetAnchorDateKey({ startKey, dueKey, selectedDateKey } = {}) {
  return startKey || dueKey || selectedDateKey || dateKey(new Date());
}

function isRangeOnceTask(task) {
  if (String(task?.type || '').toLowerCase() !== 'once') return false;
  const range = onceRangeBounds(task);
  return !!(range && range.start !== range.end);
}

/** Planned reward for chores that actually apply on these ISO-week days. */
export function possibleInKeys(todos, keys) {
  let possible = 0;
  const keySet = keys || [];
  (todos || []).forEach((t) => {
    if (isRangeOnceTask(t)) {
      const { start, end } = onceRangeBounds(t);
      if (!keySet.some((k) => k >= start && k <= end)) return;
      possible += valueForTask(t);
      return;
    }
    keySet.forEach((k) => {
      const d = new Date(`${k}T12:00:00`);
      if (!appliesOnDate(t, d)) return;
      possible += valueForTask(t);
    });
  });
  return possible;
}

export function weekPossibleInMode(todos, keys, mode) {
  return possibleInKeys(filterTodosByRewardMode(todos, mode), keys);
}

/** Shape a draft chore the same way save() writes it, for ISO-week scoring. */
export function choreDraftForWeekScore({
  rewardMode,
  unitValue,
  recurrenceFields,
  startKey,
  endKey,
  dueKey,
}) {
  const mode = normalizeRewardMode(rewardMode || 'points');
  const val = mode === 'none' ? 0 : Math.max(0, Math.round(Number(unitValue) || 0));
  return {
    rewardType: mode,
    points: mode === 'points' ? val : 0,
    moneyValue: mode === 'money' ? val : 0,
    type: recurrenceFields?.type || 'daily',
    daysOfWeek: recurrenceFields?.daysOfWeek || [],
    everyOtherWeek: !!recurrenceFields?.everyOtherWeek,
    recurring: !!recurrenceFields?.recurring,
    recurrenceType: recurrenceFields?.recurrenceType || null,
    recurrenceInterval: Number(recurrenceFields?.recurrenceInterval || 1),
    recurrenceByDays: recurrenceFields?.recurrenceByDays || [],
    recurrenceUntilKey: recurrenceFields?.recurrenceUntilKey || null,
    startKey: startKey || null,
    endKey: endKey || null,
    dueDate: dueKey || null,
  };
}

export { dateKey };
