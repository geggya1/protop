/**
 * Ny kjøretur åpnes i en popup. Målene kommer fra vinduet, ikke fra trinnet,
 * så prosjekt, kjøretøy, rute og se over fyller samme flate.
 */

const PHONE_BREAKPOINT = 768;

export function mileageModalFrame(width, height, insets = {}) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  const top = Math.max(0, Number(insets.top) || 0);
  const bottom = Math.max(0, Number(insets.bottom) || 0);
  const phone = w < PHONE_BREAKPOINT || h < 700;
  if (phone) {
    const margin = 10;
    return {
      width: Math.max(280, Math.round(w - margin * 2)),
      height: Math.max(240, Math.round(h - top - bottom - margin * 2)),
    };
  }
  return {
    width: Math.min(480, Math.max(320, Math.round(w - 48))),
    height: Math.min(640, Math.max(480, Math.round(h - 96))),
  };
}
