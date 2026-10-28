/**
 * «Redusert bevegelse» (WCAG 2.2.2 og 2.3.3). Ren logikk for web, uten React.
 */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function reducedMotionQuery(win = typeof window !== 'undefined' ? window : null) {
  try {
    return typeof win?.matchMedia === 'function' ? win.matchMedia(REDUCED_MOTION_QUERY) : null;
  } catch {
    return null;
  }
}

export function prefersReducedMotion(win) {
  return !!reducedMotionQuery(win)?.matches;
}

/** Lytt på endringer. Gir en funksjon som slutter å lytte. */
export function watchReducedMotion(onChange, win) {
  const query = reducedMotionQuery(win);
  if (!query) return () => {};
  const handler = () => onChange(!!query.matches);
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }
  if (typeof query.addListener === 'function') {
    query.addListener(handler);
    return () => query.removeListener(handler);
  }
  return () => {};
}

/**
 * Hvor mange ganger en løkke som starter av seg selv, får gå. Under fem sekunder
 * trenger den ingen pauseknapp (WCAG 2.2.2). Med redusert bevegelse: ingen.
 */
export function autoLoopIterations(cycleMs, { reduced = false, maxMs = 5000 } = {}) {
  if (reduced || !(cycleMs > 0)) return 0;
  return Math.max(1, Math.floor((maxMs - 1) / cycleMs));
}
