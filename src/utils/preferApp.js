/** Shared keys: marketing site + SPA agree on when to open the app directly. */
export const PREFER_APP_KEY = 'weekplan_prefer_app';
export const APP_BUILD_KEY = 'weekplan_app_build';

/** App entry used by PWA start_url and marketing redirects. */
export const APP_LAUNCH_PATH = '/hjem';

export function markPreferApp() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFER_APP_KEY, '1');
  } catch { /* ignore */ }
}

export function clearPreferApp() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFER_APP_KEY);
  } catch { /* ignore */ }
}

/**
 * Explicit "this device prefers the app" flag (set when logged in / add-to-home).
 * Do NOT treat weekplan_app_build as prefer — that stamp is set on every SPA
 * visit (including /signup) and was incorrectly sending users to the old
 * in-app Welcome instead of the marketing homepage.
 */
export function hasPreferApp() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PREFER_APP_KEY) === '1';
  } catch {
    return false;
  }
}

/** True when the site is running as an installed home-screen / PWA. */
export function isStandaloneDisplay() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.navigator?.standalone === true) return true;
    return !!(window.matchMedia
      && (window.matchMedia('(display-mode: standalone)').matches
        || window.matchMedia('(display-mode: fullscreen)').matches));
  } catch {
    return false;
  }
}

/**
 * Marketing pages may bounce into the SPA only when the user is on an
 * installed PWA *and* this device prefers the app (set while signed in).
 * Logged-out home-screen launches must stay on the marketing homepage.
 */
export function shouldOpenAppFromMarketing() {
  return isStandaloneDisplay() && hasPreferApp();
}
