/** Tidsplan ut fra stillingsprosent. 100 % fyller hverdager, helg står på 0. */

import { parseHours, roundHours } from './hours.js';
import { isWeekend, toDateKey } from './calendar.js';

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

export function activeSchedule(schedules, dateKey) {
  const key = String(dateKey || '');
  const list = (Array.isArray(schedules) ? schedules : [])
    .filter((row) => row && row.from && (!key || row.from <= key))
    .sort((a, b) => String(b.from).localeCompare(String(a.from)));
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
