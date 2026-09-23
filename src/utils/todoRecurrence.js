import { mondayKeyOf } from './dates.js';
import {
  REPEAT_PRESETS,
  CUSTOM_FREQS,
  buildRecurrencePayload,
  initRepeatFromEvent,
  repeatSummaryLabel,
  repeatDescriptionText,
} from './events.js';

export { REPEAT_PRESETS, CUSTOM_FREQS, repeatSummaryLabel };

/**
 * Weekly / biweekly patterns are anchored on ISO weeks (Mon–Sun).
 * Snap startKey to that week's Monday so Man/Tor/Søn in the same week all apply.
 */
export function normalizeRecurrenceStartKey(startKey, recurrenceFields) {
  if (!startKey) return startKey || null;
  const type = String(recurrenceFields?.recurrenceType || recurrenceFields?.type || '').toLowerCase();
  const weekly = recurrenceFields?.recurring === true
    ? type === 'weekly'
    : type === 'weekly' || !!recurrenceFields?.everyOtherWeek;
  if (!weekly) return startKey;
  return mondayKeyOf(startKey) || startKey;
}

const EMPTY_REPEAT = {
  preset: 'never',
  customType: 'weekly',
  customInterval: 1,
  recurrenceByDays: [],
  recurrenceUntilKey: '',
};

/**
 * Map chore/todo document → same repeat UI state as calendar events.
 * Supports both new recurrence* fields and legacy type/daysOfWeek/everyOtherWeek.
 */
export function initRepeatFromTodo(todo) {
  if (!todo) return { ...EMPTY_REPEAT };

  if (todo.recurring === true || (todo.recurrenceType && todo.recurring !== false)) {
    return initRepeatFromEvent({
      recurring: true,
      recurrenceType: todo.recurrenceType,
      recurrenceInterval: todo.recurrenceInterval,
      recurrenceByDays: Array.isArray(todo.recurrenceByDays) && todo.recurrenceByDays.length
        ? todo.recurrenceByDays
        : (Array.isArray(todo.daysOfWeek) ? todo.daysOfWeek : []),
      recurrenceUntilKey: todo.recurrenceUntilKey || todo.endKey || '',
    });
  }

  if (todo.recurring === false || todo.type === 'once') {
    return {
      ...EMPTY_REPEAT,
      recurrenceUntilKey: '',
    };
  }

  if (todo.type === 'daily') {
    return {
      preset: 'daily',
      customType: 'daily',
      customInterval: 1,
      recurrenceByDays: [],
      recurrenceUntilKey: todo.endKey || '',
    };
  }

  if (todo.type === 'weekly') {
    const days = Array.isArray(todo.daysOfWeek) ? todo.daysOfWeek : [];
    const bi = !!todo.everyOtherWeek;
    return {
      preset: bi ? 'biweekly' : 'weekly',
      customType: 'weekly',
      customInterval: bi ? 2 : 1,
      recurrenceByDays: days,
      recurrenceUntilKey: todo.endKey || '',
    };
  }

  return { ...EMPTY_REPEAT };
}

/**
 * Map repeat UI → Firestore fields for a chore/todo.
 * Writes both calendar-style recurrence* and legacy type/daysOfWeek/everyOtherWeek
 * so older readers keep working while appliesOnDate uses the new engine.
 */
export function buildTodoRecurrenceFields({
  preset,
  customType,
  customInterval,
  recurrenceByDays,
  recurrenceUntilKey,
  baseDay = 1,
}) {
  const payload = buildRecurrencePayload({
    preset,
    customType,
    customInterval,
    recurrenceByDays,
    recurrenceUntilKey,
    baseDay,
  });

  if (!payload.recurring) {
    return {
      type: 'once',
      daysOfWeek: [],
      everyOtherWeek: false,
      recurring: false,
      recurrenceType: null,
      recurrenceInterval: 1,
      recurrenceByDays: [],
      recurrenceUntilKey: null,
    };
  }

  const isWeekly = payload.recurrenceType === 'weekly';
  const isDaily = payload.recurrenceType === 'daily';
  const interval = Math.max(1, Number(payload.recurrenceInterval || 1));

  return {
    type: isWeekly ? 'weekly' : (isDaily ? 'daily' : 'daily'),
    daysOfWeek: isWeekly ? (payload.recurrenceByDays || []) : [],
    everyOtherWeek: isWeekly && interval === 2,
    recurring: true,
    recurrenceType: payload.recurrenceType,
    recurrenceInterval: interval,
    recurrenceByDays: payload.recurrenceByDays || [],
    recurrenceUntilKey: payload.recurrenceUntilKey || null,
    endKey: payload.recurrenceUntilKey || null,
  };
}

/** Same wording as calendar, but for chores. */
export function choreRepeatDescriptionText(state) {
  return String(repeatDescriptionText(state) || '').replace(/Hendelsen/g, 'Gjøremålet');
}

export function isWeeklyRepeatPreset(preset, customType) {
  return preset === 'weekly'
    || preset === 'biweekly'
    || (preset === 'custom' && customType === 'weekly');
}

/** Approximate weekly budget occurrences from repeat state. */
export function todoWeeklyOccurrenceCount({
  preset, customType, customInterval, recurrenceByDays,
}) {
  if (preset === 'never') return 0;
  if (preset === 'daily' || (preset === 'custom' && customType === 'daily' && Number(customInterval || 1) === 1)) {
    return 7;
  }
  if (preset === 'daily' || (preset === 'custom' && customType === 'daily')) {
    const n = Math.max(1, Number(customInterval || 1));
    return Math.max(1, Math.round(7 / n));
  }
  const days = Array.isArray(recurrenceByDays) ? recurrenceByDays.length : 0;
  if (!days) return 0;
  let interval = 1;
  if (preset === 'biweekly') interval = 2;
  else if (preset === 'custom' && customType === 'weekly') {
    interval = Math.max(1, Number(customInterval || 1));
  }
  return Math.max(1, Math.ceil(days / interval));
}
