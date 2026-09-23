/** Dato-hjelpere brukt av ukeplan, dashboard og gjøremål. */

export const pad = (n) => (n < 10 ? `0${n}` : `${n}`);

export const dateKey = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseDateKey = (k) => {
  const [y, m, d] = String(k || '').split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const prevDayKey = (k) => dateKey(addDays(parseDateKey(k), -1));

export const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

export const isToday = (d, ref = new Date()) => sameDay(d, ref);

/** True when calendar day is after today (local timezone). */
export const isFutureDate = (d, ref = new Date()) => dateKey(d) > dateKey(ref);

export const startOfWeekMonday = (d) => {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  c.setDate(c.getDate() + diff);
  return c;
};

/** Start of reward week given a configurable start day (0=Sun … 6=Sat). Default Saturday. */
export const startOfRewardWeek = (d, weekStartDay = 6) => {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay();
  const diff = ((day - weekStartDay) % 7 + 7) % 7;
  c.setDate(c.getDate() - diff);
  return c;
};

export const rewardWeekKeys = (d, weekStartDay = 6) => {
  const start = startOfRewardWeek(d, weekStartDay);
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
};

/** ISO-uke (mandag–søndag) som dato-nøkler — matcher kalender og ukenummer. */
export const isoWeekKeys = (d) => {
  const start = startOfWeekMonday(d);
  return Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i)));
};

/** Mandag i ISO-uka for en dato eller YYYY-MM-DD-nøkkel. */
export const mondayKeyOf = (dateOrKey) => {
  if (!dateOrKey) return null;
  const d = typeof dateOrKey === 'string' ? parseDateKey(dateOrKey) : dateOrKey;
  if (!d || Number.isNaN(d.getTime())) return null;
  return dateKey(startOfWeekMonday(d));
};

/**
 * Antall hele ISO-uker fra `from` til `to` (mandag-basert).
 * Samme uke ⇒ 0; neste mandag-uke ⇒ 1.
 */
export const isoWeekDiff = (fromDate, toDate) => {
  const a = startOfWeekMonday(fromDate);
  const b = startOfWeekMonday(toDate);
  const aUTC = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const bUTC = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.floor((bUTC - aUTC) / (7 * 86400000));
};

export const chunkWeeks = (days) => {
  const rows = [];
  for (let i = 0; i < (days || []).length; i += 7) {
    rows.push(days.slice(i, i + 7));
  }
  return rows;
};

export const getISOWeek = (date = new Date()) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
};

export const getIsoWeekYear = getISOWeek;

export const getISOWeekBounds = (date = new Date()) => {
  const monday = startOfWeekMonday(date);
  monday.setHours(0, 0, 0, 0);
  const sunday = addDays(monday, 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
};

export const toDateSafe = (v) => {
  if (!v) return null;
  try {
    if (typeof v === 'object' && typeof v.toDate === 'function') return v.toDate();
    if (typeof v === 'number') return new Date(v < 1e12 ? v * 1000 : v);
    if (typeof v === 'string') {
      // Ren dato YYYY-MM-DD → lokal middag (unngå UTC-dagskift)
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        const [y, m, d] = v.split('-').map(Number);
        return new Date(y, m - 1, d, 12, 0, 0);
      }
      return new Date(v);
    }
    const sec = typeof v?.seconds === 'number' ? v.seconds
      : (typeof v?._seconds === 'number' ? v._seconds : null);
    if (sec != null) return new Date(sec * 1000);
    return new Date(v);
  } catch {
    return null;
  }
};

/** Normaliser dueDate (string YYYY-MM-DD, Date eller Timestamp) til dateKey. */
export const dueDateKey = (dueDate) => {
  if (!dueDate) return null;
  if (typeof dueDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(dueDate)) {
    return dueDate.slice(0, 10);
  }
  const d = toDateSafe(dueDate);
  return d ? dateKey(d) : null;
};

/**
 * Engangsoppgave med arbeidsperiode (f.eks. lekser man–fre):
 * vises alle dager fra startKey til endKey/dueDate.
 */
export const onceRangeBounds = (t) => {
  const due = dueDateKey(t?.dueDate);
  const start = t?.startKey || due;
  const end = t?.endKey || due;
  if (!start || !end) return null;
  return { start, end };
};

/** Weekly / biweekly chores — ISO week is the unit, not the weekday of startKey. */
export function isWeeklyTodoPattern(t) {
  if (!t) return false;
  if (t.recurring === true && String(t.recurrenceType || '').toLowerCase() === 'weekly') return true;
  if (String(t.type || '').toLowerCase() === 'weekly') return true;
  if (t.everyOtherWeek) return true;
  return false;
}

/** Earliest dateKey a weekly pattern may appear (Monday of the start week). */
export function weeklyPatternStartKey(t) {
  if (!t?.startKey) return null;
  if (!isWeeklyTodoPattern(t)) return t.startKey;
  return mondayKeyOf(t.startKey) || t.startKey;
}

export const appliesOnDate = (t, d) => {
  try {
    const k = dateKey(d);
    if (Array.isArray(t.skipDates) && t.skipDates.includes(k)) return false;
    // Weekly: startKey means «from this ISO week», so floor at that week's Monday.
    // Otherwise Man before a Thursday startKey is wrongly excluded (3 dager → 6 kr).
    if (t.startKey) {
      const floor = weeklyPatternStartKey(t) || t.startKey;
      if (k < floor) return false;
    }

    // Calendar-style recurrence (same engine as events) — prefer when present
    if (t.recurring === true && t.recurrenceType) {
      const until = t.recurrenceUntilKey || t.endKey || null;
      if (until && k > until) return false;
      const anchorKey = t.startKey || dueDateKey(t.dueDate) || k;
      const rType = String(t.recurrenceType || 'weekly').toLowerCase();
      const startAnchor = rType === 'weekly'
        ? (mondayKeyOf(anchorKey) || anchorKey)
        : anchorKey;
      const start = parseDateKey(startAnchor);
      if (!start) return false;
      const cur = parseDateKey(k);
      const startUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const curUTC = Date.UTC(cur.getFullYear(), cur.getMonth(), cur.getDate());
      const diffDays = Math.floor((curUTC - startUTC) / 86400000);
      if (diffDays < 0) return false;
      const interval = Math.max(1, Number(t.recurrenceInterval || 1));
      if (rType === 'daily') return diffDays % interval === 0;
      if (rType === 'weekly') {
        const byDays = Array.isArray(t.recurrenceByDays) && t.recurrenceByDays.length
          ? t.recurrenceByDays
          : (Array.isArray(t.daysOfWeek) && t.daysOfWeek.length ? t.daysOfWeek : [start.getDay()]);
        if (!byDays.includes(d.getDay())) return false;
        // Annenhver/hver N. uke følger ISO-uker (man–søn), ikke «7 dager fra startdato».
        if (interval <= 1) return true;
        const weeksDiff = isoWeekDiff(start, cur);
        return weeksDiff >= 0 && weeksDiff % interval === 0;
      }
      if (rType === 'monthly') {
        const monthsDiff = (cur.getFullYear() - start.getFullYear()) * 12 + (cur.getMonth() - start.getMonth());
        if (monthsDiff < 0 || monthsDiff % interval !== 0) return false;
        return cur.getDate() === start.getDate();
      }
      if (rType === 'yearly') {
        const yearsDiff = cur.getFullYear() - start.getFullYear();
        if (yearsDiff < 0 || yearsDiff % interval !== 0) return false;
        return cur.getMonth() === start.getMonth() && cur.getDate() === start.getDate();
      }
      return false;
    }

    if (t.endKey && k > t.endKey) return false;

    const type = String(t.type || 'daily').toLowerCase();
    if (type === 'once') {
      const range = onceRangeBounds(t);
      if (range) {
        // Periode (lekser): vis alle dager i intervallet
        if (range.start !== range.end) return k >= range.start && k <= range.end;
        return k === range.start;
      }
      if (!t.dueDate) return false;
      const due = toDateSafe(t.dueDate);
      return !!(due && sameDay(due, d));
    }
    if (type === 'weekly') {
      const days = Array.isArray(t.daysOfWeek) ? t.daysOfWeek : [];
      if (!days.includes(d.getDay())) return false;
      if (t.everyOtherWeek && t.startKey) {
        const start = parseDateKey(mondayKeyOf(t.startKey) || t.startKey);
        if (!start) return false;
        const weeksDiff = isoWeekDiff(start, d);
        if (weeksDiff < 0 || weeksDiff % 2 !== 0) return false;
      }
      return true;
    }
    return true;
  } catch {
    return true;
  }
};

export const weeklyOccurrences = (type, daysLen) => (
  type === 'daily' ? 7 : type === 'weekly' ? (daysLen || 0) : 0
);

export const makeSeriesKey = (childId) =>
  `ser_${childId || 'x'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

export const WEEKDAYS_SHORT = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
export const WEEKDAYS_LONG = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];

/** «Man 24.8» from a YYYY-MM-DD meal dateKey. */
export function formatMealDateLabel(dateKeyStr) {
  if (!dateKeyStr) return '';
  const [y, m, d] = String(dateKeyStr).split('-').map(Number);
  if (!y || !m || !d) return String(dateKeyStr);
  const dt = new Date(y, m - 1, d);
  return `${WEEKDAYS_SHORT[(dt.getDay() + 6) % 7]} ${d}.${m}`;
}
export const MONTHS_NO = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
];

export const monthGrid = (date = new Date()) => {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeekMonday(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};

export const isSameMonth = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
