/** Timeformat: desimaltimer ↔ «H:MM» / «+H:MM». */

export function parseHours(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim().replace(',', '.');
  if (!raw) return 0;
  const sign = raw.startsWith('-') ? -1 : 1;
  const body = raw.replace(/^[+-]/, '');
  if (body.includes(':')) {
    const [h, m = '0'] = body.split(':');
    const hours = Number(h) || 0;
    const mins = Number(m) || 0;
    return sign * (hours + mins / 60);
  }
  const n = Number(body);
  return Number.isFinite(n) ? sign * n : 0;
}

export function formatHours(value, { signed = false, empty = '0:00' } = {}) {
  const n = parseHours(value);
  if (!n && !signed) return empty;
  const neg = n < 0;
  const abs = Math.abs(n);
  const hours = Math.floor(abs + 1e-9);
  const mins = Math.round((abs - hours) * 60);
  const mm = mins === 60 ? 0 : mins;
  const hh = mins === 60 ? hours + 1 : hours;
  const core = `${hh}:${String(mm).padStart(2, '0')}`;
  if (signed) {
    if (!n) return `+${empty}`;
    return neg ? `-${core}` : `+${core}`;
  }
  return neg ? `-${core}` : core;
}

export function roundHours(value) {
  return Math.round(parseHours(value) * 100) / 100;
}

export function sumHours(rows, key = 'hours') {
  return roundHours((rows || []).reduce((sum, row) => sum + parseHours(row?.[key]), 0));
}
