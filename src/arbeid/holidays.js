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
    holiday(new Date(y, 0, 1), '1. nyttårsdag'),
    holiday(addDays(easter, -3), 'Skjærtorsdag'),
    holiday(addDays(easter, -2), 'Langfredag'),
    holiday(easter, '1. påskedag'),
    holiday(addDays(easter, 1), '2. påskedag'),
    holiday(new Date(y, 4, 1), 'Arbeidernes dag'),
    holiday(new Date(y, 4, 17), 'Grunnlovsdag'),
    holiday(addDays(easter, 39), 'Kristi himmelfartsdag'),
    holiday(addDays(easter, 49), '1. pinsedag'),
    holiday(addDays(easter, 50), '2. pinsedag'),
    holiday(new Date(y, 11, 25), '1. juledag'),
    holiday(new Date(y, 11, 26), '2. juledag'),
  ];
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
