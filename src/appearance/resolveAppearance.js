export const APPEARANCE_PREFS_KEY = 'weekplan.appearance.v1';

export const DEFAULT_APPEARANCE_PREFS = {
  automatic: false,
  manual: 'light',
  schedule: 'system',
  lightAt: '09:00',
  darkAt: '22:00',
};

export function normalizeTime(value, fallback) {
  const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function normalizeAppearancePrefs(raw) {
  const base = DEFAULT_APPEARANCE_PREFS;
  const manual = raw?.manual === 'dark' ? 'dark' : 'light';
  const schedule = raw?.schedule === 'clock' ? 'clock' : 'system';
  return {
    automatic: raw?.automatic === true,
    manual,
    schedule,
    lightAt: normalizeTime(raw?.lightAt, base.lightAt),
    darkAt: normalizeTime(raw?.darkAt, base.darkAt),
  };
}

function minutesOfDay(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function parseClock(value) {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + m;
}

/** Mørkt fra darkAt til lightAt, også når intervallet går over midnatt. */
export function isDarkScheduled(now, darkAt, lightAt) {
  const t = minutesOfDay(now);
  const dark = parseClock(darkAt);
  const light = parseClock(lightAt);
  if (dark === light) return false;
  if (dark < light) return t >= dark && t < light;
  return t >= dark || t < light;
}

/**
 * @param {ReturnType<typeof normalizeAppearancePrefs>} prefs
 * @param {{ systemScheme?: 'light'|'dark'|null, now?: Date }} ctx
 * @returns {'light'|'dark'}
 */
export function resolveAppearanceScheme(prefs, { systemScheme = 'light', now = new Date() } = {}) {
  const next = normalizeAppearancePrefs(prefs);
  if (!next.automatic) return next.manual;
  if (next.schedule === 'clock') {
    return isDarkScheduled(now, next.darkAt, next.lightAt) ? 'dark' : 'light';
  }
  return systemScheme === 'dark' ? 'dark' : 'light';
}

/**
 * Tekst under Automatisk, som «Mørkt fram til 09:00».
 * @returns {{ key: 'off'|'system'|'darkUntil'|'lightUntil', time?: string, scheme: 'light'|'dark' }}
 */
export function appearanceSummary(prefs, ctx) {
  const next = normalizeAppearancePrefs(prefs);
  const scheme = resolveAppearanceScheme(next, ctx);
  if (!next.automatic) return { key: 'off', scheme };
  if (next.schedule !== 'clock') return { key: 'system', scheme };
  if (scheme === 'dark') return { key: 'darkUntil', time: next.lightAt, scheme };
  return { key: 'lightUntil', time: next.darkAt, scheme };
}
