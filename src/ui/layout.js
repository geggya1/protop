/**
 * Brytepunkter og tetthet for hele appen (UX-23). useLayout() i src/theme.js bygger på dette,
 * og skjermene spør useLayout() i stedet for å sammenligne bredden med egne tall.
 * src/ui/breakpointGuard.test.mjs teller egne brytepunkter, så tallet ikke øker.
 *
 * Bredden avgjør oppsettet: telefon < 768 · nettbrett 768–1023 · PC ≥ 1024 · bred PC ≥ 1280.
 * Pekeren avgjør tettheten: berøringsskjerm (telefon, nettbrett, også iPad i liggende format)
 * får 'touch' med trykkflater på minst touch.min (44 px). Mus får 'mouse', det tette PC-uttrykket.
 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

/** Oppsett for en vindusbredde. touch: om skjermen styres med fingre (se coarsePointer). */
export function layoutFor(width, { touch = false } = {}) {
  const w = Number(width) || 0;
  const isPhone = w < BREAKPOINTS.tablet;
  const isDesktop = w >= BREAKPOINTS.desktop;
  const isTouch = !!touch;
  return {
    isPhone,
    isTablet: !isPhone && !isDesktop,
    isDesktop,
    isWide: w >= BREAKPOINTS.wide,
    isTouch,
    density: isTouch ? 'touch' : 'mouse',
  };
}

/**
 * Om nettleseren styres med fingre: primærpekeren er grov (telefon, nettbrett).
 * En PC med berøringsskjerm og mus har fin primærpeker og får PC-tettheten.
 */
export function coarsePointer(env = globalThis) {
  try {
    return !!env?.matchMedia?.('(pointer: coarse)')?.matches;
  } catch {
    return false;
  }
}
