/** Kalenderhjelpere for månedsgrid i Arbeid-modulen. */

const DAY_SHORT = ['sø', 'ma', 'ti', 'on', 'to', 'fr', 'lø'];
const MONTHS = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
];

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function toDateKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseDateKey(key) {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function monthLabel(year, monthIndex) {
  return `${MONTHS[monthIndex] || ''} ${year}`.trim();
}

export function shiftMonth(year, monthIndex, delta) {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}

/** ISO-uke (mandag som første dag). */
export function isoWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const first = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - first) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7);
}

export function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export function isWorkday(date) {
  return !isWeekend(date);
}

/**
 * Dager i måned med ukegrupper for grid-header.
 * @returns {{ days: Array, weeks: Array<{ week: number, span: number }> }}
 */
export function buildMonthGrid(year, monthIndex) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, monthIndex, day);
    days.push({
      day,
      date,
      key: toDateKey(date),
      weekday: DAY_SHORT[date.getDay()],
      weekend: isWeekend(date),
      workday: isWorkday(date),
      week: isoWeek(date),
    });
  }
  const weeks = [];
  for (const row of days) {
    const last = weeks[weeks.length - 1];
    if (last && last.week === row.week) last.span += 1;
    else weeks.push({ week: row.week, span: 1 });
  }
  return { days, weeks };
}

/** Avtalte timer per dag (standard 7,5 eller 8). */
export function agreedHoursForDay(date, dailyHours = 7.5) {
  return isWorkday(date) ? dailyHours : 0;
}
