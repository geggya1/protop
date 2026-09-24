/**
 * Tid-basert hilsen og vinduer for morgen-/kveldspopup.
 */

export const GREETING_PERIODS = {
  morning: { start: 5, end: 11 },
  evening: { start: 17, end: 22 },
};

export function getGreetingPeriod(date = new Date()) {
  const hour = date.getHours();
  if (hour >= GREETING_PERIODS.morning.start && hour < GREETING_PERIODS.morning.end) {
    return 'morning';
  }
  if (hour >= GREETING_PERIODS.evening.start && hour < GREETING_PERIODS.evening.end) {
    return 'evening';
  }
  return null;
}

export function greetingKey(period) {
  if (period === 'morning') return 'greeting.morning';
  if (period === 'evening') return 'greeting.evening';
  return 'greeting.hello';
}

export function periodEmoji(period) {
  if (period === 'morning') return '🌅';
  if (period === 'evening') return '🌙';
  return '👋';
}

export function firstNameFromProfile(profile, fallback = '') {
  const raw = String(
    profile?.displayName
    || profile?.name
    || fallback
    || '',
  ).trim();
  if (!raw) return '';
  return raw.split(/\s+/)[0];
}

export function formatGreetingDate(date = new Date(), locale = 'nb-NO') {
  try {
    return date.toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  } catch {
    return date.toDateString();
  }
}
