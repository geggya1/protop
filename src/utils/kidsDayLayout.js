/** Max kids that fill the row without horizontal scroll. */
export const KIDS_VISIBLE = 3;
export const KIDS_GAP = 6;
export const KIDS_PEEK = 20;

/**
 * Fixed card width when the kids row scrolls.
 * When kidCount ≤ KIDS_VISIBLE, callers should use flex fill instead.
 */
export function kidsDayCardWidth(viewportWidth, kidCount) {
  if (!(viewportWidth > 0) || !(kidCount > 0)) return undefined;
  const visible = Math.min(kidCount, KIDS_VISIBLE);
  const peek = kidCount > visible ? KIDS_PEEK : 0;
  return Math.floor((viewportWidth - KIDS_GAP * (visible - 1) - peek) / visible);
}

/** True when cards should flex-fill the viewport instead of scrolling. */
export function kidsDayFitsViewport(kidCount) {
  return kidCount > 0 && kidCount <= KIDS_VISIBLE;
}
