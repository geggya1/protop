/**
 * Norske helligdager og merkede dager (hele / halve) for timelisten.
 * Påsken regnes med den anonyme gregorianske algoritmen.
 */

import { isWeekend, toDateKey } from './calendar.js';
import { roundHours } from './hours.js';

function addDays(date, delta) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta);
}

/** 1. påskedag. */
export function easterSunday(year) {
  const y = Number(year);
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(y, month - 1, day);
}

function holiday(date, name) {
  return {
    date: toDateKey(date),
    name,
    kind: 'holiday',
    portion: 'full',
  };
}

/** Offisielle norske helligdager for ett år, inkludert de som faller i helg. */
export function norwegianHolidays(year) {
  const y = Number(year);
  const easter = easterSunday(y);
  return [
    holiday(new Date(y, 0, 1), '1. Nyttårsdag'),
    holiday(addDays(easter, -3), 'Skjærtorsdag'),
    holiday(addDays(easter, -2), 'Langfredag'),
    holiday(easter, '1. påskedag'),
    holiday(addDays(easter, 1), '2. påskedag'),
    holiday(new Date(y, 4, 1), 'Offentlig høytidsdag'),
    holiday(new Date(y, 4, 17), 'Grunnlovsdag'),
    holiday(addDays(easter, 39), 'Kristi Himmelfartsdag'),
    holiday(addDays(easter, 49), '1. pinsedag'),
    holiday(addDays(easter, 50), '2. pinsedag'),
    holiday(new Date(y, 11, 25), '1. juledag'),
    holiday(new Date(y, 11, 26), '2. juledag'),
  ];
}

const HOLIDAY_NAME_ALIASES = {
  '1. nyttårsdag': '1. Nyttårsdag',
  'Arbeidernes dag': 'Offentlig høytidsdag',
  'Kristi himmelfartsdag': 'Kristi Himmelfartsdag',
};

/**
 * Fridager selskapet faktisk bruker.
 * Norske helligdager ligger inne for årene som spørres, til de er slettet.
 * En lagret dag med samme dato overstyrer navn og lengde.
 */
export function resolveRedDays(state, years = []) {
  const stored = Array.isArray(state?.redDays)
    ? state.redDays
    : (Array.isArray(state) ? state : []);
  const requested = new Set((years || []).map((year) => Number(year)).filter((year) => year > 1900));
  if (!requested.size) requested.add(new Date().getFullYear());
  const suppressed = new Set(
    stored.filter((row) => row?.suppressed && row.date).map((row) => row.date),
  );
  const byDate = new Map();
  for (const year of requested) {
    for (const row of norwegianHolidays(year)) {
      if (suppressed.has(row.date)) continue;
      byDate.set(row.date, {
        id: `holiday_${row.date}`,
        date: row.date,
        name: row.name,
        kind: 'holiday',
        portion: 'full',
        source: 'system',
        year,
      });
    }
  }
  for (const row of stored) {
    if (!row?.date || row.suppressed) continue;
    const prev = byDate.get(row.date);
    const alias = HOLIDAY_NAME_ALIASES[row.name];
    const name = !row.edited && alias ? alias : (row.name || prev?.name || '');
    byDate.set(row.date, {
      ...prev,
      ...row,
      name,
      source: row.source || prev?.source || 'company',
      portion: row.portion === 'half' ? 'half' : (row.portion || prev?.portion || 'full'),
      kind: row.kind || prev?.kind || 'dayoff',
    });
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function redDayMap(redDays = []) {
  const map = new Map();
  for (const row of redDays || []) {
    if (!row?.date) continue;
    map.set(row.date, row);
  }
  return map;
}

/**
 * Avtalte timer for en dato.
 * Helligdag og hel fridag gir 0. Halv dag gir halvparten av avtalen.
 * scheduleHours overstyrer stillingsbrøk når en tidsplan finnes.
 */
export function agreedHoursForDate(date, {
  fullDayHours = 7.5,
  redDays = [],
  scheduleHours = null,
} = {}) {
  const when = date instanceof Date ? date : new Date(date);
  const key = toDateKey(when);
  const mark = redDayMap(redDays).get(key);
  const fallback = isWeekend(when) ? 0 : fullDayHours;
  const base = scheduleHours == null ? fallback : Number(scheduleHours) || 0;
  if (!mark) {
    return {
      hours: roundHours(base),
      red: isWeekend(when),
      half: false,
      name: '',
      kind: '',
    };
  }
  const half = mark.portion === 'half';
  const closed = !half && (mark.portion === 'full' || mark.kind === 'holiday' || mark.kind === 'dayoff');
  return {
    hours: closed ? 0 : roundHours(base / 2),
    red: true,
    half,
    name: mark.name || '',
    kind: mark.kind || 'dayoff',
  };
}
