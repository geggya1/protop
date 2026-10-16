/** Tidsplan ut fra stillingsprosent. 100 % fyller hverdager, helg står på 0. */

import { parseHours, roundHours, formatHours } from './hours.js';
import { isWeekend, pad2, parseDateKey, toDateKey } from './calendar.js';

export const SCHEDULE_DAYS = [
  { id: 'mon', label: 'Mandag', weekend: false },
  { id: 'tue', label: 'Tirsdag', weekend: false },
  { id: 'wed', label: 'Onsdag', weekend: false },
  { id: 'thu', label: 'Torsdag', weekend: false },
  { id: 'fri', label: 'Fredag', weekend: false },
  { id: 'sat', label: 'Lørdag', weekend: true },
  { id: 'sun', label: 'Søndag', weekend: true },
];

const BY_JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function weekdayId(date) {
  const when = date instanceof Date ? date : new Date(date);
  return BY_JS_DAY[when.getDay()] || 'mon';
}

function slot(hours) {
  return {
    hours: roundHours(hours),
    arrival: '0:00',
    adjustment: '0:00',
  };
}

/** Bygg en ukeplan. 50 % av 7,5 t blir 3,75 t mandag–fredag. */
export function scheduleFromPercent(percent, fullDayHours = 7.5) {
  const ratio = Math.max(0, Math.min(100, Number(percent) || 0)) / 100;
  const dayHours = roundHours((Number(fullDayHours) || 0) * ratio);
  const days = {};
  for (const row of SCHEDULE_DAYS) {
    days[row.id] = slot(row.weekend ? 0 : dayHours);
  }
  return days;
}

export function scheduleIdentity(plan) {
  if (plan?.id) return String(plan.id);
  return plan?.from ? `from:${plan.from}` : '';
}

/** Nyeste fra-dato først. Planer uten dato havner sist. */
export function sortedSchedules(schedules) {
  return (Array.isArray(schedules) ? schedules : [])
    .filter((row) => row && typeof row === 'object')
    .slice()
    .sort((a, b) => String(b.from || '').localeCompare(String(a.from || '')));
}

export function dayBefore(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() - 1);
  return toDateKey(date);
}

/** DD.MM.ÅÅÅÅ eller ÅÅÅÅ-MM-DD → ÅÅÅÅ-MM-DD. Tom streng når verdien ikke er en dato. */
export function parseScheduleDate(value) {
  const raw = String(value || '').trim();
  const key = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? raw
    : (() => {
      const match = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      return match ? `${match[3]}-${pad2(match[2])}-${pad2(match[1])}` : '';
    })();
  if (!key) return '';
  const date = parseDateKey(key);
  return date && toDateKey(date) === key ? key : '';
}

export function formatScheduleDate(dateKey) {
  const date = parseDateKey(dateKey);
  if (!date) return '';
  return `${pad2(date.getDate())}.${pad2(date.getMonth() + 1)}.${date.getFullYear()}`;
}

/**
 * Synlig periode. Nyere plan avgrenser den eldre dagen før den starter.
 * Den nyeste planen er åpen («nåværende») til den får en egen til-dato.
 */
export function scheduleRange(plan, schedules) {
  const sorted = sortedSchedules(schedules);
  const identity = scheduleIdentity(plan);
  const index = sorted.findIndex((row) => scheduleIdentity(row) === identity);
  const newer = index > 0 ? sorted[index - 1] : null;
  if (newer?.from) {
    return { from: plan?.from || '', to: dayBefore(newer.from), open: false };
  }
  if (plan?.to) return { from: plan?.from || '', to: plan.to, open: false };
  return { from: plan?.from || '', to: '', open: true };
}

/** Går-tid. Lagret slutt vinner, ellers kommer + avtalte timer. */
export function departureOf(slot) {
  if (slot?.leave != null && slot.leave !== '') return formatHours(slot.leave);
  return formatHours(parseHours(slot?.arrival) + parseHours(slot?.hours));
}

export function normalizeScheduleDays(days) {
  const stored = {};
  for (const row of SCHEDULE_DAYS) {
    const slot = days?.[row.id] || {};
    const arrival = slot.arrival == null || slot.arrival === '' ? '0:00' : formatHours(slot.arrival);
    const hours = roundHours(parseHours(slot.hours));
    const adjustment = slot.adjustment == null || slot.adjustment === '' ? '0:00' : formatHours(slot.adjustment);
    const next = { hours, arrival, adjustment };
    const computedLeave = formatHours(parseHours(arrival) + hours);
    const leave = slot.leave == null || slot.leave === '' ? '' : formatHours(slot.leave);
    if (leave && leave !== computedLeave) next.leave = leave;
    stored[row.id] = next;
  }
  return stored;
}

export function normalizeScheduleRow(input) {
  const from = parseScheduleDate(input?.from);
  if (!from) return { ok: false, error: 'Fra-dato må være på formen DD.MM.ÅÅÅÅ.' };
  const toRaw = String(input?.to || '').trim();
  const open = !toRaw || toRaw.toLowerCase() === 'nåværende';
  const to = open ? '' : parseScheduleDate(toRaw);
  if (!open && !to) return { ok: false, error: 'Til-dato må være på formen DD.MM.ÅÅÅÅ, eller stå tom for nåværende.' };
  if (to && to < from) return { ok: false, error: 'Til-dato kan ikke være før fra-dato.' };
  const id = String(input?.id || '').trim();
  if (!id) return { ok: false, error: 'Tidsplanen mangler id.' };
  const row = { id, from, days: normalizeScheduleDays(input?.days) };
  if (to) row.to = to;
  return { ok: true, row };
}

export function replaceSchedule(schedules, row, previous = {}) {
  const list = (Array.isArray(schedules) ? schedules : []).filter((plan) => plan && typeof plan === 'object');
  const previousId = previous.id || '';
  const previousFrom = previous.from || '';
  const rest = list.filter((plan) => {
    if (previousId && plan.id === previousId) return false;
    if (!previousId && previousFrom && !plan.id && plan.from === previousFrom) return false;
    if (plan.id && plan.id === row.id) return false;
    return true;
  });
  if (rest.some((plan) => plan.from === row.from)) {
    return { ok: false, error: 'Det finnes allerede en tidsplan fra denne datoen.' };
  }
  const next = [...rest, row].sort((a, b) => String(a.from).localeCompare(String(b.from)));
  return { ok: true, schedules: next };
}

export function removeSchedule(schedules, identity) {
  return (Array.isArray(schedules) ? schedules : []).filter((plan) => scheduleIdentity(plan) !== identity);
}

export function activeSchedule(schedules, dateKey) {
  const key = String(dateKey || '');
  const list = sortedSchedules(schedules)
    .filter((row) => row.from && (!key || row.from <= key))
    .filter((row) => !key || !row.to || row.to >= key);
  return list[0] || null;
}

/**
 * Timer avtalen sier for datoen.
 * Tidsplan vinner over stillingsprosent. Uten plan brukes prosent av normaldag.
 */
export function scheduledHours(employee, date, fullDayHours = 7.5) {
  const when = date instanceof Date ? date : new Date(date);
  const key = toDateKey(when);
  const plan = activeSchedule(employee?.extras?.schedules, key);
  if (plan?.days) {
    const day = plan.days[weekdayId(when)];
    if (day && day.hours != null && day.hours !== '') return roundHours(parseHours(day.hours));
  }
  if (isWeekend(when)) return 0;
  const percent = Number(employee?.company?.workPercent);
  const ratio = Number.isFinite(percent) && percent > 0 ? Math.min(percent, 100) / 100 : 1;
  return roundHours((Number(fullDayHours) || 7.5) * ratio);
}

export function timeSettingsOf(employee) {
  const raw = employee?.extras?.timeSettings && typeof employee.extras.timeSettings === 'object'
    ? employee.extras.timeSettings
    : {};
  const target = raw.utilizationTarget == null || raw.utilizationTarget === ''
    ? 100
    : Number(raw.utilizationTarget);
  return {
    activeEmployment: raw.activeEmployment !== false && employee?.company?.status !== 'former' && employee?.company?.status !== 'inactive',
    showFlexInTimesheet: raw.showFlexInTimesheet !== false,
    includeInCapacity: raw.includeInCapacity !== false,
    externalConsultant: raw.externalConsultant === true || employee?.company?.personnelKind === 'external',
    mustLockTimesheet: raw.mustLockTimesheet === true,
    requireClockTimes: raw.requireClockTimes === true,
    flexCountsAsPay: raw.flexCountsAsPay !== false,
    utilizationTarget: Number.isFinite(target) ? target : 100,
    hourlyRate: raw.hourlyRate == null ? '' : String(raw.hourlyRate),
    notifyTimesheet: raw.notifyTimesheet !== false,
    notifyApproval: raw.notifyApproval !== false,
  };
}
