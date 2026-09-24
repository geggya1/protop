/**
 * Capture Microsoft/Google calendar OAuth return params on first script load,
 * before React Navigation can reset the route or strip the query string.
 */
function readParams() {
  if (typeof window === 'undefined') return null;
  try {
    const query = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const pick = (key) => query.get(key) || hash.get(key);
    const code = pick('code');
    const error = pick('error');
    const path = String(window.location.pathname || '');
    if (!code && !error && !path.includes('oauth/calendar')) return null;
    return {
      code,
      state: pick('state'),
      error,
      errorDescription: pick('error_description'),
      path,
    };
  } catch {
    return null;
  }
}

export const capturedCalendarOauth = readParams();

export function isCalendarOauthReturn() {
  if (capturedCalendarOauth?.code || capturedCalendarOauth?.error) return true;
  if (typeof window === 'undefined') return false;
  try {
    return String(window.location.pathname || '').includes('oauth/calendar');
  } catch {
    return false;
  }
}
