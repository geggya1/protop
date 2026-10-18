/**
 * Ny kjøretur åpnes i en popup. Bredde og maks-høyde er like på alle trinn.
 * Høyden følger innholdet, så tomrom under feltene ikke blir stående.
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
      maxHeight: Math.max(240, Math.round(h - top - bottom - margin * 2)),
    };
  }
  return {
    width: Math.min(480, Math.max(320, Math.round(w - 48))),
    maxHeight: Math.min(640, Math.max(420, Math.round(h - 96))),
  };
}
