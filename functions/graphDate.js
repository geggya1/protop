/** Parse Microsoft Graph dateTime objects into Date values (UTC instants). */

export const DISPLAY_TIME_ZONE = 'Europe/Oslo';

export function parseGraphDateTime(dateObj, { allDay = false } = {}) {
  if (!dateObj) return null;
  const raw = typeof dateObj === 'string'
    ? dateObj
    : (dateObj.dateTime || dateObj.date || '');
  const tz = typeof dateObj === 'object' && dateObj ? String(dateObj.timeZone || '') : '';
  const s = String(raw).trim();
  if (!s) return null;

  const datePart = s.slice(0, 10);
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s) || allDay;
  if (isDateOnly && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [y, m, d] = datePart.split('-').map(Number);
    if (y) return new Date(y, m - 1, d);
  }

  // Graph often sends 7-digit fractional seconds, which some engines reject.
  let iso = s.replace(/\.(\d{3})\d+/, '.$1');
  const tzUpper = tz.toUpperCase();
  if ((tzUpper === 'UTC' || tzUpper === 'GMT')
    && !iso.endsWith('Z')
    && !/[+-]\d{2}:?\d{2}$/.test(iso)) {
    iso += 'Z';
  }
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return new Date(Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), Number(m[6] || 0),
  ));
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Shift a YYYY-MM-DD calendar key by whole days (UTC date arithmetic). */
export function addDaysToDateKey(key, delta) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return key;
  const dt = new Date(Date.UTC(y, m - 1, d + Number(delta || 0)));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Graph calendarView window for a local date-key range in Europe/Oslo.
 * Offsets are required: naive timestamps are interpreted as UTC by Graph.
 */
export function osloOffsetForDateKey(dateKey) {
  const [y, m, d] = String(dateKey || '').split('-').map(Number);
  if (!y || !m || !d) return '+01:00';
  const lastSundayUtc = (year, monthIndex) => {
    const dt = new Date(Date.UTC(year, monthIndex + 1, 0));
    dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay());
    return dt.getTime();
  };
  // EU DST: last Sunday of March 01:00 UTC → last Sunday of October 01:00 UTC.
  const start = lastSundayUtc(y, 2);
  const end = lastSundayUtc(y, 9);
  const noon = Date.UTC(y, m - 1, d, 12);
  return noon >= start && noon < end ? '+02:00' : '+01:00';
}

/**
 * Graph calendar IDs are base64 and often contain +, / and =.
 * Azure decodes the path once, so a single encodeURIComponent can 404
 * shared calendars. Caller retries with times=2 on 404.
 */
export function encodeOutlookCalendarPathId(calendarId, times = 1) {
  let s = String(calendarId || '');
  const n = Math.max(1, Number(times) || 1);
  for (let i = 0; i < n; i += 1) s = encodeURIComponent(s);
  return s;
}

export function graphWindowForDateKeys(startKey, endKey) {
  return {
    min: `${startKey}T00:00:00${osloOffsetForDateKey(startKey)}`,
    max: `${endKey}T23:59:59${osloOffsetForDateKey(endKey)}`,
  };
}

/**
 * Wider UTC window used as a fallback. Several Graph clients report empty
 * calendarView results with offset timestamps; tutorials use .0000000Z.
 */
export function graphWindowUtcPadded(startKey, endKey) {
  const minKey = addDaysToDateKey(startKey, -1);
  const maxKey = addDaysToDateKey(endKey, 1);
  return {
    min: `${minKey}T00:00:00.0000000Z`,
    max: `${maxKey}T23:59:59.0000000Z`,
  };
}

/** Read Graph start/end as a YYYY-MM-DD wall-clock key (and optional HH:mm). */
export function graphEventWallClock(dateObj, { allDay = false } = {}) {
  if (!dateObj) return null;
  const s = String(typeof dateObj === 'string' ? dateObj : (dateObj.dateTime || dateObj.date || '')).trim();
  if (!s) return null;
  const dateKey = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const hm = s.slice(11, 16);
  const timeStr = allDay ? null : (/^\d{2}:\d{2}$/.test(hm) ? hm : null);
  return { dateKey, timeStr };
}

/** Format a Date instant as a calendar key + HH:mm in a named time zone. */
export function formatInTimeZone(date, timeZone = DISPLAY_TIME_ZONE) {
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    timeStr: `${get('hour')}:${get('minute')}`,
  };
}
