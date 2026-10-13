export const SIDE_WIDTH_KEY = 'protop.anbud.sideWidth';
export const RAIL_WIDTH_KEY = 'protop.anbud.railWidth';
export const RAIL_PREF_KEY = 'protop.anbud.railOpenWidth';
export const ALERT_RAIL_PREF_KEY = 'protop.anbud.alertRailPref';
export const RAIL_PEEK = 44;
/** Karthøyde i den lave mobilvisningen på anbudsvarsling, så listen får plass under. */
export const PHONE_PREVIEW_MAP_HEIGHT = 160;

export function clampSideWidth(width, min = 280, max = 840) {
  const n = Number(width);
  if (!Number.isFinite(n)) return 360;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Bredde på kartskuffen. Sammenklappet ligger den i høyre marg. */
export function clampRailWidth(width, { peek = RAIL_PEEK, max = 840 } = {}) {
  const n = Number(width);
  if (!Number.isFinite(n)) return peek;
  return Math.min(max, Math.max(peek, Math.round(n)));
}

/** Hvor bredt kartet kan bli mot venstre, gitt vindusbredden. */
export function railMaxWidth(viewportWidth, { cap = 840, gutter = 12 } = {}) {
  const width = Number(viewportWidth);
  if (!Number.isFinite(width) || width <= 0) return cap;
  return Math.min(cap, Math.max(RAIL_PEEK, Math.round(width - gutter)));
}

/** Mobilvarsling: kartet hviler i den lave visningen til det dras tydelig inn fra høyre. */
export function alertRailIsOpen(width, { peek = RAIL_PEEK, slop = 48 } = {}) {
  const n = Number(width);
  return Number.isFinite(n) && n > peek + slop;
}

/** Et kort drag slippes tilbake i margen. Et tydelig drag åpner kartet, og kan dras videre bredere. */
export function settleRailWidth(width, { peek = RAIL_PEEK, slop = 48, openMin = 280, max = 840 } = {}) {
  const n = clampRailWidth(width, { peek, max });
  if (n <= peek + slop) return peek;
  const floor = Math.min(openMin, max);
  return Math.min(max, Math.max(floor, n));
}

/** Høyrekolonnen vokser når håndtaket dras mot venstre. */
export function sideWidthFromDrag(startWidth, startX, x, { min = 280, max = 840 } = {}) {
  return clampSideWidth(Number(startWidth) + (Number(startX) - Number(x)), min, max);
}

export function mapHeightForSide(sideWidth) {
  const width = clampSideWidth(sideWidth);
  return Math.min(680, Math.max(440, Math.round(width * 0.9)));
}

/** Karthøyde i skuffen, så nål og tittel får plass under kartet på mobil. */
export function mapHeightForRail(sideWidth, viewportHeight) {
  const width = Number(sideWidth);
  const view = Number(viewportHeight);
  const byWidth = Math.round((Number.isFinite(width) ? Math.max(width, 280) : 360) * 0.85);
  const byView = Math.round((Number.isFinite(view) && view > 0 ? view : 800) * 0.42);
  return Math.min(560, Math.max(220, Math.min(byWidth, byView)));
}
