/**
 * Installed Safari web app (Add to Home Screen).
 * The shell uses the dynamic viewport (100dvh). A large viewport (100lvh)
 * is taller than the window iOS shows, and the bottom menu then sits
 * below the visible edge. Status bar and home indicator are padded
 * inside the header and the bottom menu. See app.web.css.
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
 * Padding inside the top bar. The bar background starts at the screen edge.
 * In a browser tab the larger of the safe area and Safari's covered top band
 * is used, so the logo stays visible without an empty strip above the header.
 */
export function headerTopPad(insetTop, frameTop, { standalone = false, phone = false } = {}) {
  const status = statusBarCover(insetTop, { standalone, phone });
  if (!phone || standalone) return status;
  const overlap = Math.max(0, Math.round(Number(frameTop) || 0));
  return Math.max(status, overlap);
}

/**
 * Padding inside the bottom menu. The bar itself is flush with the screen.
 * Weekplan keeps a small floor in a browser tab and never grows a
 * home-indicator band taller than 34 just because env() over-reports.
 * When Safari's toolbar covers the layout bottom, that band is part of
 * the bar: the icons stay in view and the toolbar sits on our background.
 */
export function tabBarBottomPad(insetBottom, {
  standalone = false,
  web = false,
  browserOverlap = 0,
} = {}) {
  const reported = Math.max(0, Number(insetBottom) || 0);
  if (!web) return Math.max(reported, 4);
  const overlap = Math.max(0, Math.round(Number(browserOverlap) || 0));
  if (!standalone) {
    if (overlap > 0) return overlap + 4;
    return Math.max(Math.min(reported, 34), 8);
  }
  return Math.max(reported, 34);
}
