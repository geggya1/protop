/**
 * Which approved lockup belongs on a chrome surface.
 * Primary (full colour) on light. All-white on black mode, where the
 * navy wordmark disappears into the header and the hamburger menu.
 * Same rule as the brand sheet: dark backgrounds use the white logo.
 */

function channel(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, or null when the colour is not a plain hex. */
export function hexLuminance(color) {
  const hex = String(color || '').trim();
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let h = match[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * @param {string} backgroundColor Surface painted behind the logo.
 * @returns {'primary' | 'white'}
 */
export function brandLogoToneForBackground(backgroundColor) {
  const luminance = hexLuminance(backgroundColor);
  if (luminance == null) return 'primary';
  return luminance < 0.4 ? 'white' : 'primary';
}
