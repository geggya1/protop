export const SIDE_WIDTH_KEY = 'protop.anbud.sideWidth';

export function clampSideWidth(width, min = 280, max = 840) {
  const n = Number(width);
  if (!Number.isFinite(n)) return 360;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Høyrekolonnen vokser når håndtaket dras mot venstre. */
export function sideWidthFromDrag(startWidth, startX, x, { min = 280, max = 840 } = {}) {
  return clampSideWidth(Number(startWidth) + (Number(startX) - Number(x)), min, max);
}

export function mapHeightForSide(sideWidth) {
  const width = clampSideWidth(sideWidth);
  return Math.min(680, Math.max(440, Math.round(width * 0.9)));
}
