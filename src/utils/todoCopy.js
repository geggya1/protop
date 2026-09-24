import { makeSeriesKey } from './dates.js';

const COPY_FIELDS = [
  'title',
  'name',
  'description',
  'rewardType',
  'points',
  'moneyValue',
  'value',
  'category',
  'type',
  'daysOfWeek',
  'dueDate',
  'everyOtherWeek',
  'recurring',
  'recurrenceType',
  'recurrenceInterval',
  'recurrenceByDays',
  'recurrenceUntilKey',
  'assignedParent',
  'iconUrl',
  'iconFile',
  'startKey',
  'endKey',
  'deadline',
  'deadlineTime',
  'order',
];

export function isCopyableChore(todo) {
  if (!todo || typeof todo !== 'object') return false;
  if (todo.deleted === true) return false;
  if (todo.active === false) return false;
  const title = String(todo.title || todo.name || '').trim();
  return title.length > 0;
}

export function choreTitleKey(todo) {
  return String(todo?.title || todo?.name || '').trim().toLowerCase();
}

/**
 * Pick source chores to copy. Existing titles on the target are skipped
 * so a second import does not duplicate the plan.
 */
export function selectChoresToCopy(sourceTodos, targetTodos, { skipDuplicates = true } = {}) {
  const existing = new Set(
    (targetTodos || [])
      .filter(isCopyableChore)
      .map(choreTitleKey)
      .filter(Boolean),
  );
  const selected = [];
  const skipped = [];
  for (const todo of sourceTodos || []) {
    if (!isCopyableChore(todo)) continue;
    const key = choreTitleKey(todo);
    if (skipDuplicates && key && existing.has(key)) {
      skipped.push(todo);
      continue;
    }
    selected.push(todo);
    if (key) existing.add(key);
  }
  return { selected, skipped };
}

/** Independent copy owned by the target child — no live link to the source. */
export function buildCopiedTodoPayload(source, {
  targetChildId,
  createdBy = null,
  seriesKey,
  timestamps = null,
} = {}) {
  const payload = {};
  for (const key of COPY_FIELDS) {
    if (source[key] !== undefined) payload[key] = source[key];
  }
  payload.title = String(source.title || source.name || 'Gjøremål').trim();
  payload.childId = targetChildId || null;
  payload.createdBy = createdBy || null;
  payload.seriesKey = seriesKey || makeSeriesKey(targetChildId);
  payload.active = true;
  payload.deleted = false;
  payload.done = false;
  payload.completedDates = [];
  payload.skipDates = [];
  if (timestamps != null) {
    payload.createdAt = timestamps;
    payload.updatedAt = timestamps;
  }
  return payload;
}
