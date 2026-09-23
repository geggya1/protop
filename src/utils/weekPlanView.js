/** Dags-/ukesvisning, fagfarger og voksen-tilgang for barnets ukeplan. */
import { PREP_RULES } from './schedulePrepTasks.js';
import {
  WEEKPLAN_DAYS,
  WEEKPLAN_DAY_KEYS,
  filledDaySlots,
  slotTimeRange,
  formatSlotRange,
  isScheduleBreak,
} from './weekPlanGrid.js';
import { parseTimeToMinutes } from './timeGrid.js';
import { addDays, startOfWeekMonday, getISOWeek } from './dates.js';

const JS_TO_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS_SHORT = [
  'jan.', 'feb.', 'mar.', 'apr.', 'mai', 'jun.',
  'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'des.',
];
const MONTHS_FULL = [
  'januar', 'februar', 'mars', 'april', 'mai', 'juni',
  'juli', 'august', 'september', 'oktober', 'november', 'desember',
];
const WEEKDAYS_FULL = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];

const SUBJECT_STYLES = [
  { match: /friminutt/i, icon: 'cafe-outline', color: '#64748b', soft: '#f1f5f9', kind: 'break' },
  { match: /matpause|lunsj|spising/i, icon: 'restaurant-outline', color: '#ea580c', soft: '#fff7ed', kind: 'break' },
  { match: /norsk/i, icon: 'book-outline', color: '#16a34a', soft: '#ecfdf3' },
  { match: /matt|matematikk/i, icon: 'calculator-outline', color: '#2563eb', soft: '#eff6ff' },
  { match: /natur/i, icon: 'flask-outline', color: '#7c3aed', soft: '#f5f3ff' },
  { match: /engelsk/i, icon: 'chatbubbles-outline', color: '#0284c7', soft: '#f0f9ff' },
  { match: /kroppsøving|kroppsoving|\bgym\b|idrett/i, icon: 'walk-outline', color: '#0d9488', soft: '#f0fdfa' },
  { match: /kunst|håndverk|handverk/i, icon: 'color-palette-outline', color: '#db2777', soft: '#fdf2f8' },
  { match: /musikk/i, icon: 'musical-notes-outline', color: '#7c3aed', soft: '#f5f3ff' },
  { match: /samfunn|krle|\brle\b|religion/i, icon: 'people-outline', color: '#b45309', soft: '#fffbeb' },
  { match: /mat og helse|mat&helse/i, icon: 'nutrition-outline', color: '#d97706', soft: '#fffbeb' },
];

const DEFAULT_SUBJECT = { icon: 'book-outline', color: '#2563eb', soft: '#eff6ff', kind: 'lesson' };

/** Voksne (foresatt/admin) kan redigere timeplanen, også i barnets mobilvisning. Innlogget barn kan ikke. */
export function canAdultEditSchedule({ isParent, isChild, isAdmin } = {}) {
  if (isChild) return false;
  return !!(isParent || isAdmin);
}

export function planDayKeyFromDate(date) {
  if (!date || Number.isNaN(date.getTime?.() ?? date.getTime())) return null;
  const key = JS_TO_DAY[date.getDay()];
  return WEEKPLAN_DAY_KEYS.includes(key) ? key : null;
}

/** Helg → mandag, ellers ukedagen. */
export function defaultPlanDayKey(date = new Date()) {
  return planDayKeyFromDate(date) || 'mon';
}

export function schoolMonday(date = new Date(), weekOffset = 0) {
  return addDays(startOfWeekMonday(date), weekOffset * 7);
}

export function dateForPlanDay(monday, dayKey) {
  const idx = WEEKPLAN_DAY_KEYS.indexOf(dayKey);
  if (idx < 0) return monday;
  return addDays(monday, idx);
}

export function schoolWeekDays(monday) {
  return WEEKPLAN_DAYS.map((d, i) => ({
    ...d,
    date: addDays(monday, i),
  }));
}

export function formatWeekRange(monday) {
  const fri = addDays(monday, 4);
  const a = `${monday.getDate()}. ${MONTHS_SHORT[monday.getMonth()]}`;
  const b = `${fri.getDate()}. ${MONTHS_SHORT[fri.getMonth()]}`;
  return `${a} – ${b}`;
}

export function formatDayHeading(date) {
  const wd = WEEKDAYS_FULL[date.getDay()] || '';
  const cap = wd ? wd.charAt(0).toUpperCase() + wd.slice(1) : '';
  return `${cap} ${date.getDate()}. ${MONTHS_FULL[date.getMonth()]}`;
}

export function weekNumberLabel(date = new Date()) {
  const { week } = getISOWeek(date);
  return `Uke ${week}`;
}

export function subjectStyle(title) {
  const text = String(title || '');
  const found = SUBJECT_STYLES.find((s) => s.match.test(text));
  if (!found) return { ...DEFAULT_SUBJECT };
  return {
    icon: found.icon,
    color: found.color,
    soft: found.soft,
    kind: found.kind || 'lesson',
  };
}

export function minutesNow(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function lessonStatus(slot, { viewingToday = false, nowMin = 0 } = {}) {
  if (!viewingToday) return 'upcoming';
  const { start, end } = slotTimeRange(slot);
  const s = parseTimeToMinutes(start);
  if (s == null) return 'upcoming';
  const e = parseTimeToMinutes(end);
  const endMin = e == null || e <= s ? s + 45 : e;
  if (nowMin >= endMin) return 'done';
  if (nowMin >= s && nowMin < endMin) return 'now';
  return 'upcoming';
}

export function buildDayTimeline(timetable, dayKey, { now = new Date(), viewingToday = false } = {}) {
  const nowMin = minutesNow(now);
  const items = filledDaySlots(timetable, dayKey).map((slot, index) => {
    const title = String(slot.subject || '').trim();
    return {
      id: `${dayKey}-${slot.time || slot.startTime || index}-${index}`,
      title,
      timeLabel: formatSlotRange(slot),
      startTime: slot.time || slot.startTime || '',
      endTime: slot.endTime || '',
      slot,
      slotIndex: index,
      status: lessonStatus(slot, { viewingToday, nowMin }),
      isBreak: isScheduleBreak(title),
      style: subjectStyle(title),
    };
  }).sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

  if (viewingToday) {
    const current = items.find((it) => !it.isBreak && it.status === 'now');
    if (!current) {
      const next = items.find((it) => !it.isBreak && it.status === 'upcoming');
      if (next) next.status = 'next';
    }
  }
  return items;
}

export function schoolDayEnd(timetable, dayKey) {
  let end = null;
  let endMin = -1;
  filledDaySlots(timetable, dayKey).forEach((slot) => {
    if (isScheduleBreak(slot.subject)) return;
    const range = slotTimeRange(slot);
    const m = parseTimeToMinutes(range.end);
    if (m != null && m > endMin) {
      endMin = m;
      end = range.end;
    }
  });
  return end;
}

/** True når siste time (uten friminutt) er ferdig for dagen. */
export function schoolDayHasPassed(timetable, dayKey, now = new Date()) {
  const end = schoolDayEnd(timetable, dayKey);
  if (!end) return false;
  const endMin = parseTimeToMinutes(end);
  if (endMin == null) return false;
  return minutesNow(now) >= endMin;
}

/**
 * Velg hvilken skoledag ukeplan-widgeten skal vise:
 * dagens program — eller morgendagens når dagen er over / helg / tom.
 */
export function resolveWeekProgramFocus(timetable, now = new Date()) {
  const todayKey = planDayKeyFromDate(now);
  const todaySlots = todayKey ? filledDaySlots(timetable, todayKey) : [];
  const todayPassed = !!(todayKey && todaySlots.length && schoolDayHasPassed(timetable, todayKey, now));

  let dayKey = todayKey;
  let date = now;
  let focusTomorrow = false;
  let reason = 'today';

  const shouldAdvance = !todayKey || todayPassed || todaySlots.length === 0;
  if (shouldAdvance) {
    let fallback = null;
    for (let i = 1; i <= 7; i += 1) {
      const next = addDays(now, i);
      const key = planDayKeyFromDate(next);
      if (!key) continue;
      const slots = filledDaySlots(timetable, key);
      if (!fallback) fallback = { dayKey: key, date: next, offset: i };
      if (slots.length) {
        dayKey = key;
        date = next;
        focusTomorrow = i === 1;
        reason = todayPassed ? 'passed' : (!todayKey ? 'weekend' : 'empty');
        fallback = null;
        break;
      }
    }
    if (fallback) {
      dayKey = fallback.dayKey;
      date = fallback.date;
      focusTomorrow = fallback.offset === 1;
      reason = todayPassed ? 'passed' : (!todayKey ? 'weekend' : 'empty');
    }
  }

  if (!dayKey) {
    dayKey = 'mon';
    date = addDays(schoolMonday(now, todayKey ? 0 : 1), 0);
    focusTomorrow = false;
    reason = 'weekend';
  }

  const viewingToday = reason === 'today' && dayKey === todayKey;
  const lessons = buildDayTimeline(timetable, dayKey, { now, viewingToday })
    .filter((item) => !item.isBreak)
    .map((item) => ({
      id: item.id,
      time: item.timeLabel || item.startTime || '',
      title: item.title,
      status: item.status,
      color: item.style?.color || '#2F80ED',
    }));

  const weekDays = WEEKPLAN_DAYS.map((d) => {
    const slots = filledDaySlots(timetable, d.key);
    const first = slots.find((s) => !isScheduleBreak(s.subject));
    return {
      id: d.key,
      label: d.short,
      count: slots.filter((s) => !isScheduleBreak(s.subject)).length,
      first: first ? String(first.subject || '').trim() : '',
      active: d.key === dayKey,
    };
  });

  const dayHeading = formatDayHeading(date);
  let programTitle = 'Dagens program';
  if (reason === 'passed' || focusTomorrow) programTitle = 'I morgen';
  else if (reason === 'weekend' || reason === 'empty') {
    programTitle = focusTomorrow ? 'I morgen' : dayHeading.split(' ')[0] || 'Program';
  }

  return {
    dayKey,
    date,
    focusTomorrow: reason !== 'today',
    reason,
    programTitle,
    dayHeading,
    weekLabel: weekNumberLabel(date),
    lessons,
    weekDays,
    empty: lessons.length === 0,
  };
}

export function remindersForDay(timetable, dayKey) {
  const slots = filledDaySlots(timetable, dayKey);
  const blob = slots.map((s) => s.subject || '').join(' ');
  const items = [];
  const seen = new Set();
  PREP_RULES.forEach((rule) => {
    if (!rule.match.test(blob)) return;
    let label = rule.morningTitle.replace(/^Pakk\s+/i, '');
    if (rule.id === 'gym') label = 'Gymtøy';
    if (rule.id === 'swim') label = 'Svømmetøy';
    if (seen.has(label)) return;
    seen.add(label);
    items.push({
      id: rule.id,
      label,
      icon: rule.id === 'swim' ? 'water-outline' : 'shirt-outline',
    });
  });
  if (slots.length) {
    items.push({ id: 'bottle', label: 'Drikkeflaske', icon: 'water-outline' });
  }
  return items;
}

export function statusLabel(status) {
  if (status === 'done') return 'Ferdig';
  if (status === 'now') return 'Nå';
  if (status === 'next') return 'Neste time';
  return null;
}
