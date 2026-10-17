/**
 * Installed Safari web app (Add to Home Screen).
 * iOS sizes 100dvh to the screen minus the status-bar inset, so a shell
 * that uses it stops short and the system keeps a bar at the top and bottom.
 * 100lvh is the full screen. See app.web.css.
 */

export function isStandaloneWeb() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.navigator?.standalone === true) return true;
    const match = window.matchMedia;
    if (typeof match !== 'function') return false;
    return match.call(window, '(display-mode: standalone)').matches
      || match.call(window, '(display-mode: fullscreen)').matches;
  } catch {
    return false;
  }
}

/**
 * Padding inside the top bar so its background reaches the screen edge
 * while the logo stays below the clock. iOS 26 sometimes reports 0.
 */
export function statusBarCover(insetTop, { standalone = false, phone = false } = {}) {
  if (!phone) return 0;
  const reported = Math.max(0, Number(insetTop) || 0);
  if (!standalone) return reported;
  return Math.max(reported, 47);
}

/**
 * Padding inside the bottom menu. The bar itself is flush with the screen.
 * Standalone uses at least the home-indicator height when env() under-reports.
 */
export function tabBarBottomPad(insetBottom, { standalone = false, web = false } = {}) {
  const reported = Math.max(0, Number(insetBottom) || 0);
  if (!web) return Math.max(reported, 4);
  if (!standalone) return Math.max(Math.min(reported, 34), 8);
  return Math.max(reported, 34);
}
