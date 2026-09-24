import { layoutTimedEvents, minutesToTime, parseTimeToMinutes, visibleHourRange } from './timeGrid.js';

export const WEEKPLAN_DAYS = [
  { key: 'mon', short: 'Man', full: 'Mandag' },
  { key: 'tue', short: 'Tir', full: 'Tirsdag' },
  { key: 'wed', short: 'Ons', full: 'Onsdag' },
  { key: 'thu', short: 'Tor', full: 'Torsdag' },
  { key: 'fri', short: 'Fre', full: 'Fredag' },
];

export const WEEKPLAN_DAY_KEYS = WEEKPLAN_DAYS.map((d) => d.key);

const DEFAULT_LESSON_MIN = 45;

export const SCHEDULE_BREAK_RE = /^(friminutt|spising|matpause|lunsj)$/i;

export function isScheduleBreak(title) {
  return SCHEDULE_BREAK_RE.test(String(title || '').trim());
}

function breakDurationMin(title) {
  const t = String(title || '').trim().toLowerCase();
  if (t === 'spising' || t === 'lunsj' || t === 'matpause') return 25;
  return 15;
}

/** Farger for friminutt / spising i ukeplan-rutenettet. */
export function scheduleBreakColors(title) {
  const t = String(title || '').trim().toLowerCase();
  if (t === 'spising' || t === 'lunsj' || t === 'matpause') {
    return { bg: '#ecfdf5', border: '#34d399', time: '#059669', ink: '#065f46' };
  }
  return { bg: '#f1f5f9', border: '#94a3b8', time: '#64748b', ink: '#475569' };
}

export function defaultSlotEndTime(startTime, durationMin = DEFAULT_LESSON_MIN) {
  const start = parseTimeToMinutes(startTime);
  if (start == null) return null;
  return minutesToTime(Math.min(24 * 60, start + durationMin));
}

export function slotTimeRange(slot) {
  const start = String(slot?.time || slot?.startTime || '').slice(0, 5) || null;
  const explicitEnd = String(slot?.endTime || '').slice(0, 5) || null;
  const subject = String(slot?.subject || '').trim();
  const duration = isScheduleBreak(subject) ? breakDurationMin(subject) : DEFAULT_LESSON_MIN;
  const end = explicitEnd || defaultSlotEndTime(start, duration);
  return { start, end };
}

export function formatSlotRange(slot) {
  const { start, end } = slotTimeRange(slot);
  if (!start) return '';
  return end ? `${start}–${end}` : start;
}

export function filledDaySlots(timetable, dayKey) {
  const raw = timetable?.[dayKey];
  const slots = Array.isArray(raw) ? raw : [];
  return slots.filter((s) => s && String(s.subject || '').trim());
}

export function timetableHasLessons(timetable) {
  return WEEKPLAN_DAY_KEYS.some((key) => filledDaySlots(timetable, key).length > 0);
}

/** Timed events for the week-grid (not the family calendar). */
export function timetableToGridEvents(timetable) {
  const events = [];
  WEEKPLAN_DAY_KEYS.forEach((day) => {
    filledDaySlots(timetable, day).forEach((slot, idx) => {
      const { start, end } = slotTimeRange(slot);
      if (!start) return;
      events.push({
        id: `${day}-${start}-${idx}`,
        day,
        title: String(slot.subject || '').trim(),
        startTime: start,
        endTime: end,
        slot,
        slotIndex: idx,
      });
    });
  });
  return events;
}

/** Legg pauser uten kolonne-deling mot fag — rendres over fag med full bredde. */
export function layoutWeekPlanDay(events) {
  const lessons = [];
  const breaks = [];
  for (const event of events || []) {
    (isScheduleBreak(event.title) ? breaks : lessons).push(event);
  }
  const laidLessons = layoutTimedEvents(lessons).map((l) => ({ ...l, isBreak: false }));
  const laidBreaks = layoutTimedEvents(breaks).map((l) => ({
    ...l,
    isBreak: true,
    col: 0,
    colCount: 1,
  }));
  return [...laidLessons, ...laidBreaks];
}

export function weekPlanHourRange(timetable) {
  const events = timetableToGridEvents(timetable);
  return visibleHourRange(events, { minStart: 8, minEnd: 15 });
}

export function emptyWeekTimetable() {
  const t = {};
  WEEKPLAN_DAY_KEYS.forEach((d) => {
    t[d] = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']
      .map((time) => ({ time, endTime: defaultSlotEndTime(time), subject: '' }));
  });
  return t;
}

export function upsertTimetableSlot(timetable, day, { time, endTime, subject }) {
  const next = { ...(timetable || {}) };
  const slots = Array.isArray(next[day]) ? [...next[day]] : [];
  const existing = slots.find((s) => s.time === time);
  if (existing) {
    existing.subject = subject;
    if (endTime) existing.endTime = endTime;
  } else {
    slots.push({ time, endTime: endTime || defaultSlotEndTime(time), subject });
    slots.sort((a, b) => String(a.time).localeCompare(String(b.time)));
  }
  next[day] = slots;
  return next;
}
