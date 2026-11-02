/**
 * Dark tinted glass: rewrite widget styles authored for light cards so they
 * read on a dark card. Dark ink turns light, light chips/tracks turn into
 * faint white veils, and pale borders become thin white hairlines.
 * Pure (no React), so it can be unit tested and cached per stylesheet.
 */

import { LIGHT } from '../appearance/palette.js';

/**
 * ProTop-fargene er tilpasset lyst/mørkt: CSS-variabel på web (`var(--wp-c-ink)`),
 * DynamicColorIOS på iOS. Glasset er alltid mørkt, så lys-varianten avgjør.
 */
function resolveThemeColor(value) {
  if (value && typeof value === 'object' && value.dynamic && typeof value.dynamic.light === 'string') {
    return value.dynamic.light;
  }
  if (typeof value !== 'string') return value;
  const m = value.trim().match(/^var\(\s*--wp-c-([a-zA-Z]+)\s*(?:,[^)]*)?\)$/);
  if (m && typeof LIGHT[m[1]] === 'string') return LIGHT[m[1]];
  return value;
}

function parseColor(raw) {
  const value = resolveThemeColor(raw);
  if (typeof value !== 'string') return null;
  const s = value.trim().toLowerCase();
  if (s === 'transparent') return null;
  if (s === '#fff' || s === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (s === '#000' || s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
  let m = s.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return {
      r: (n >> 16) & 255,
      g: (n >> 8) & 255,
      b: n & 255,
      a: m[2] ? parseInt(m[2], 16) / 255 : 1,
    };
  }
  m = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (m) {
    return {
      r: parseInt(m[1] + m[1], 16),
      g: parseInt(m[2] + m[2], 16),
      b: parseInt(m[3] + m[3], 16),
      a: 1,
    };
  }
  m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m) {
    return { r: +m[1], g: +m[2], b: +m[3], a: m[4] != null ? +m[4] : 1 };
  }
  return null;
}

function luminance({ r, g, b }) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Chroma 0–1: how far from grey a colour is, regardless of brightness. */
function chroma({ r, g, b }) {
  return (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
}

const white = (a) => `rgba(255,255,255,${a})`;

/** Text and glyph colour on dark glass. */
export function glassInk(value) {
  const c = parseColor(value);
  if (!c) return value;
  const L = luminance(c);
  if (L >= 0.4) return value;
  // Nesten svart blekk (ProTop-marinen #1a2744 også) er brødtekst: helt hvitt.
  if (L < 0.03) return '#FFFFFF';
  if (chroma(c) < 0.1) {
    if (L < 0.03) return '#FFFFFF';
    if (L < 0.1) return white(0.86);
    return white(0.74);
  }
  // Coloured ink (links, accents): keep the hue, lift it toward white.
  const mix = (v) => Math.round(v + (255 - v) * 0.55);
  return `rgb(${mix(c.r)},${mix(c.g)},${mix(c.b)})`;
}

/** Fill colour inside a dark glass card. */
export function glassFill(value) {
  const c = parseColor(value);
  if (!c) return value;
  const L = luminance(c);
  // Opaque light chips, tracks and pastel panels become a faint white veil.
  if (L > 0.6 && c.a >= 0.5) return white(0.14);
  // Faint dark washes (progress tracks, hover tints) flip to faint white.
  if (L < 0.3 && c.a < 0.4) return white(Math.min(0.24, Math.max(0.12, c.a * 1.6)));
  return value;
}

/** Border colour inside a dark glass card. */
export function glassLine(value) {
  const c = parseColor(value);
  if (!c) return value;
  const L = luminance(c);
  if (L > 0.5) return white(Math.min(0.28, 0.18 * c.a + 0.06));
  if (c.a < 0.5) return white(0.2);
  return value;
}

const INK_KEYS = new Set(['color', 'textDecorationColor', 'tintColor']);
const FILL_KEYS = new Set(['backgroundColor']);
const LINE_KEYS = new Set([
  'borderColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor',
]);

export function glassStyle(style) {
  if (!style || typeof style !== 'object' || Array.isArray(style)) return style;
  let out = null;
  Object.keys(style).forEach((key) => {
    const v = style[key];
    let next = v;
    if (INK_KEYS.has(key)) next = glassInk(v);
    else if (FILL_KEYS.has(key)) next = glassFill(v);
    else if (LINE_KEYS.has(key)) next = glassLine(v);
    if (next !== v) {
      if (!out) out = { ...style };
      out[key] = next;
    }
  });
  return out || style;
}

const cache = new WeakMap();

/** Whole StyleSheet.create() result → dark glass variant (cached). */
export function glassStyles(sheet) {
  if (!sheet || typeof sheet !== 'object') return sheet;
  const hit = cache.get(sheet);
  if (hit) return hit;
  const out = {};
  Object.keys(sheet).forEach((k) => { out[k] = glassStyle(sheet[k]); });
  cache.set(sheet, out);
  return out;
}
