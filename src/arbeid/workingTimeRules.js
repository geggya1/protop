/**
 * Arbeidstid og hviletid etter arbeidsmiljøloven kapittel 10, regnet ut fra timelisten.
 * Gir varsler, ikke sperrer: timene lagres som før.
 *
 * - § 10-4 (1): alminnelig arbeidstid er høyst 9 timer per døgn og 40 timer per uke.
 * - § 10-6 (1): arbeid utover dette er overtid. Overtiden regnes per kalenderuke (mandag–søndag):
 *   timer over 9 på en dag, og timer over 40 i uken som ikke allerede er telt.
 * - § 10-6 (4): overtid høyst 10 timer på sju dager, 25 timer på fire uker og 200 timer på 52 uker.
 *   (5): etter skriftlig avtale med tillitsvalgte 20, 50 og 300 timer (AGREED_OVERTIME_LIMITS).
 * - § 10-6 (8): samlet arbeidstid høyst 13 timer på 24 timer og 48 timer på sju dager.
 * - § 10-8 (1) og (2): 11 timer sammenhengende fri i løpet av 24 timer og 35 timer i løpet av sju dager.
 *   Hviletiden kan bare kontrolleres for føringer med fra- og til-klokkeslett.
 *
 * Dato er «ÅÅÅÅ-MM-DD». Klokkeslett er «TT:MM» i lokal tid. Regnes uten tidssoner.
 */

export const WORKING_TIME_LIMITS = {
  dayNormal: 9,
  weekNormal: 40,
  overtime7d: 10,
  overtime4w: 25,
  overtime52w: 200,
  dayTotal: 13,
  weekTotal: 48,
  dailyRest: 11,
  weeklyRest: 35,
};

/** Utvidede overtidsgrenser etter skriftlig avtale med tillitsvalgte (§ 10-6 (5)). */
export const AGREED_OVERTIME_LIMITS = { overtime7d: 20, overtime4w: 50, overtime52w: 300 };

const DAY_MS = 86400000;
const DAY_MIN = 1440;

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function hoursOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? '').trim().replace(',', '.');
  if (raw.includes(':')) {
    const [h, m = '0'] = raw.split(':');
    return (Number(h) || 0) + (Number(m) || 0) / 60;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function dayIndex(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS);
}

function dayKey(index) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

/** Mandag = 0. */
function weekday(index) {
  return (new Date(index * DAY_MS).getUTCDay() + 6) % 7;
}

function clockMinutes(value) {
  const m = String(value || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

export function formatDateNb(key) {
  const m = String(key || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

function formatH(hours) {
  const abs = Math.abs(round2(hours));
  let h = Math.floor(abs + 1e-9);
  let min = Math.round((abs - h) * 60);
  if (min === 60) { h += 1; min = 0; }
  return `${h}:${String(min).padStart(2, '0')}`;
}

/** Grensene med selskapets avtalte endringer. Ugyldige verdier gir lovens grense. */
export function workingTimeLimits(overrides = {}) {
  const next = { ...WORKING_TIME_LIMITS };
  for (const key of Object.keys(WORKING_TIME_LIMITS)) {
    const value = Number(overrides?.[key]);
    if (Number.isFinite(value) && value > 0) next[key] = value;
  }
  return next;
}

function forEmployee(entries, employeeId) {
  const id = String(employeeId || '').trim();
  return (Array.isArray(entries) ? entries : []).filter((row) => (
    row && (!id || String(row.employeeId || '') === id) && dayIndex(row.date) != null
  ));
}

/**
 * Timer per dag, med overtid etter § 10-4/10-6 fordelt på dagene.
 * [{ date, index, hours, overtime }] sortert på dato.
 */
export function overtimeByDay(entries, { employeeId = '', limits = WORKING_TIME_LIMITS } = {}) {
  const byDay = new Map();
  for (const row of forEmployee(entries, employeeId)) {
    const index = dayIndex(row.date);
    byDay.set(index, (byDay.get(index) || 0) + Math.max(0, hoursOf(row.hours)));
  }
  const days = [...byDay.entries()]
    .map(([index, hours]) => ({ date: dayKey(index), index, hours: round2(hours), overtime: 0 }))
    .sort((a, b) => a.index - b.index);
  let week = null;
  let normal = 0;
  for (const day of days) {
    const monday = day.index - weekday(day.index);
    if (monday !== week) {
      week = monday;
      normal = 0;
    }
    const withinDay = Math.min(day.hours, limits.dayNormal);
    const overDay = day.hours - withinDay;
    const overWeek = Math.max(0, normal + withinDay - limits.weekNormal);
    normal = Math.min(limits.weekNormal, normal + withinDay);
    day.overtime = round2(overDay + overWeek);
  }
  return days;
}

/**
 * Glidende sum over size dager. Gir én rad per sammenhengende strekning over grensen,
 * med toppen: { from, to, value }.
 */
function rollingRuns(days, size, pick, limit) {
  if (!days.length) return [];
  const values = new Map(days.map((day) => [day.index, pick(day)]));
  const first = days[0].index;
  const last = days[days.length - 1].index;
  const runs = [];
  let sum = 0;
  let current = null;
  for (let index = first; index <= last; index += 1) {
    sum += values.get(index) || 0;
    if (index - size >= first) sum -= values.get(index - size) || 0;
    const value = round2(sum);
    if (value > limit + 1e-9) {
      if (!current) {
        current = { peak: index, value };
        runs.push(current);
      } else if (value > current.value) {
        current.peak = index;
        current.value = value;
      }
    } else {
      current = null;
    }
  }
  return runs.map((run) => ({ from: dayKey(run.peak - size + 1), to: dayKey(run.peak), value: run.value }));
}

/**
 * Arbeidsperioder fra føringer med klokkeslett, slått sammen der de overlapper.
 * unknownDays er dager med timer uten fra–til, der hviletiden ikke kan kontrolleres.
 */
export function workIntervals(entries, { employeeId = '' } = {}) {
  const rows = forEmployee(entries, employeeId).filter((row) => hoursOf(row.hours) > 0 || (row.clockIn && row.clockOut));
  const raw = [];
  const unknown = new Set();
  for (const row of rows) {
    const index = dayIndex(row.date);
    const start = clockMinutes(row.clockIn);
    const end = clockMinutes(row.clockOut);
    if (start == null || end == null) {
      unknown.add(index);
      continue;
    }
    const from = index * DAY_MIN + start;
    const to = index * DAY_MIN + end + (end <= start ? DAY_MIN : 0);
    raw.push({ start: from, end: to });
  }
  raw.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const span of raw) {
    const prev = merged[merged.length - 1];
    if (prev && span.start <= prev.end) prev.end = Math.max(prev.end, span.end);
    else merged.push({ ...span });
  }
  return { intervals: merged, unknownDays: [...unknown].sort((a, b) => a - b).map(dayKey) };
}

/** Lengste sammenhengende fri (minutter) i [from, to) gitt arbeidsperiodene. */
function longestRest(intervals, from, to) {
  let cursor = from;
  let best = 0;
  for (const span of intervals) {
    if (span.end <= from) continue;
    if (span.start >= to) break;
    best = Math.max(best, Math.max(0, span.start - cursor));
    cursor = Math.max(cursor, span.end);
  }
  return Math.max(best, Math.max(0, to - cursor));
}

function touchesUnknown(unknown, from, to) {
  const first = Math.floor(from / DAY_MIN);
  const last = Math.floor((to - 1) / DAY_MIN);
  for (let index = first; index <= last; index += 1) {
    if (unknown.has(index)) return true;
  }
  return false;
}

/**
 * Hviletid § 10-8. Hvert vindu starter når en arbeidsperiode starter: 24 timer for døgnhvile
 * og sju dager for ukehvile. Vinduer som går inn i dager uten klokkeslett, hoppes over.
 * [{ rule: 'dailyRest' | 'weeklyRest', date, rest }] der rest er lengste fri i timer.
 */
export function restBreaches(intervals, { unknownDays = [], limits = WORKING_TIME_LIMITS } = {}) {
  const unknown = new Set(unknownDays.map(dayIndex));
  const out = [];
  const seenDay = new Set();
  const seenWeek = new Set();
  for (const span of intervals) {
    const startDay = Math.floor(span.start / DAY_MIN);
    const dayEnd = span.start + DAY_MIN;
    if (!seenDay.has(startDay) && !touchesUnknown(unknown, span.start, dayEnd)) {
      const rest = longestRest(intervals, span.start, dayEnd) / 60;
      if (rest < limits.dailyRest - 1e-9) {
        seenDay.add(startDay);
        out.push({ rule: 'dailyRest', date: dayKey(startDay), rest: round2(rest) });
      }
    }
    const weekKey = startDay - weekday(startDay);
    const weekEnd = span.start + 7 * DAY_MIN;
    if (!seenWeek.has(weekKey) && !touchesUnknown(unknown, span.start, weekEnd)) {
      const rest = longestRest(intervals, span.start, weekEnd) / 60;
      if (rest < limits.weeklyRest - 1e-9) {
        seenWeek.add(weekKey);
        out.push({ rule: 'weeklyRest', date: dayKey(startDay), rest: round2(rest) });
      }
    }
  }
  return out;
}

const REF = {
  weekOvertime: 'AML §§ 10-4 og 10-6 (1)',
  overtime7d: 'AML § 10-6 (4)',
  overtime4w: 'AML § 10-6 (4)',
  overtime52w: 'AML § 10-6 (4)',
  dayTotal: 'AML § 10-6 (8)',
  weekTotal: 'AML § 10-6 (8)',
  dailyRest: 'AML § 10-8 (1)',
  weeklyRest: 'AML § 10-8 (2)',
};

/**
 * Alle varsler for én ansatt. from/to avgrenser hvilke varsler som vises (etter sluttdatoen
 * i vinduet). Beregningen bruker alle føringene som er med, så 52-ukersgrensen blir riktig
 * når et helt år er lastet.
 * { days, warnings, totals, restChecked, unknownDays }
 * Varsel: { id, rule, level: 'info' | 'warn', ref, from, to, value, limit, text }.
 */
export function checkWorkingTime(entries, { employeeId = '', limits: overrides = {}, from = '', to = '' } = {}) {
  const limits = workingTimeLimits(overrides);
  const days = overtimeByDay(entries, { employeeId, limits });
  const warnings = [];
  const push = (rule, level, row, limit, text) => warnings.push({
    id: `${rule}_${row.to || row.date}`,
    rule,
    level,
    ref: REF[rule],
    from: row.from || row.date,
    to: row.to || row.date,
    value: row.value ?? row.rest ?? 0,
    limit,
    text,
  });

  // Overtid per uke (info): timer over 9 per døgn eller 40 per uke.
  const weeks = new Map();
  for (const day of days) {
    if (!day.overtime) continue;
    const monday = day.index - weekday(day.index);
    const week = weeks.get(monday) || { from: dayKey(monday), to: dayKey(monday + 6), value: 0, hours: 0 };
    week.value = round2(week.value + day.overtime);
    weeks.set(monday, week);
  }
  for (const day of days) {
    const week = weeks.get(day.index - weekday(day.index));
    if (week) week.hours = round2(week.hours + day.hours);
  }
  for (const week of weeks.values()) {
    push('weekOvertime', 'info', week, limits.weekNormal,
      `Uken ${formatDateNb(week.from)}–${formatDateNb(week.to)}: ${formatH(week.hours)} t, av dette ${formatH(week.value)} t overtid (over ${limits.dayNormal} t per døgn eller ${limits.weekNormal} t per uke). Overtid krever et særlig og tidsavgrenset behov.`);
  }

  const overtimeRules = [
    ['overtime7d', 7, 'sju dager'],
    ['overtime4w', 28, 'fire uker'],
    ['overtime52w', 364, '52 uker'],
  ];
  for (const [rule, size, label] of overtimeRules) {
    for (const run of rollingRuns(days, size, (day) => day.overtime, limits[rule])) {
      push(rule, 'warn', run, limits[rule],
        `${formatH(run.value)} t overtid på ${label} (${formatDateNb(run.from)}–${formatDateNb(run.to)}). Grensen er ${limits[rule]} t.`);
    }
  }
  for (const day of days) {
    if (day.hours > limits.dayTotal + 1e-9) {
      push('dayTotal', 'warn', { date: day.date, value: day.hours }, limits.dayTotal,
        `${formatDateNb(day.date)}: ${formatH(day.hours)} t arbeid. Samlet arbeidstid skal ikke være over ${limits.dayTotal} t på 24 timer.`);
    }
  }
  for (const run of rollingRuns(days, 7, (day) => day.hours, limits.weekTotal)) {
    push('weekTotal', 'warn', run, limits.weekTotal,
      `${formatH(run.value)} t arbeid på sju dager (${formatDateNb(run.from)}–${formatDateNb(run.to)}). Grensen er ${limits.weekTotal} t, men kan gjennomsnittsberegnes over åtte uker.`);
  }

  const { intervals, unknownDays } = workIntervals(entries, { employeeId });
  for (const breach of restBreaches(intervals, { unknownDays, limits })) {
    const daily = breach.rule === 'dailyRest';
    push(breach.rule, 'warn', breach, daily ? limits.dailyRest : limits.weeklyRest, daily
      ? `${formatDateNb(breach.date)}: lengste sammenhengende fri på 24 timer var ${formatH(breach.rest)} t. Kravet er ${limits.dailyRest} t.`
      : `Sju dager fra ${formatDateNb(breach.date)}: lengste sammenhengende fri var ${formatH(breach.rest)} t. Kravet er ${limits.weeklyRest} t.`);
  }

  // Et varsel hører til dagen grensen ble brutt (slutten av vinduet).
  const inRange = (row) => (!from || row.to >= from) && (!to || row.to <= to);
  const shown = warnings
    .filter(inRange)
    .sort((a, b) => (a.level === b.level ? b.to.localeCompare(a.to) : a.level === 'warn' ? -1 : 1));
  const lastIndex = days.length ? days[days.length - 1].index : null;
  const sumSince = (size) => round2(days
    .filter((day) => lastIndex != null && day.index > lastIndex - size)
    .reduce((sum, day) => sum + day.overtime, 0));
  return {
    days,
    warnings: shown,
    totals: {
      hours: round2(days.reduce((sum, day) => sum + day.hours, 0)),
      overtime: round2(days.reduce((sum, day) => sum + day.overtime, 0)),
      overtime7d: sumSince(7),
      overtime4w: sumSince(28),
      overtime52w: sumSince(364),
    },
    limits,
    restChecked: intervals.length > 0,
    unknownDays,
  };
}
