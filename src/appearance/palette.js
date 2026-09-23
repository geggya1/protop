import { protopBrand } from '../brand/protopBrand';

/** Lys og mørk palett for menyer, flater og tekst. */

export const LIGHT = {
  bg: '#f4f7fb',
  card: '#ffffff',
  sunken: '#f8fafc',
  ink: '#1a2744',
  muted: '#5b6b82',
  line: '#e2e8f0',
  brand: protopBrand.digitalBlue,
  brandSoft: protopBrand.digitalBlueSoft,
  success: '#16a34a',
  successSoft: '#e4f5ea',
  warn: '#d97706',
  danger: '#dc2626',
  star: '#e2a325',
  starSoft: '#fff8e8',
  placeholder: '#94a3b8',
  kid: protopBrand.digitalBlue,
  kidSoft: protopBrand.digitalBlueSoft,
  fab: protopBrand.digitalBlue,
  accent: '#6b4ee6',
};

export const DARK = {
  bg: '#000000',
  card: '#1c1c1e',
  sunken: '#2c2c2e',
  ink: '#f2f2f7',
  muted: '#8e8e93',
  line: '#38383a',
  brand: protopBrand.digitalBlueOnDark,
  brandSoft: protopBrand.darkBrandSoft,
  success: '#4ade80',
  successSoft: '#052e16',
  warn: '#fbbf24',
  danger: '#f87171',
  star: '#fbbf24',
  starSoft: '#3f2e0a',
  placeholder: '#636366',
  kid: protopBrand.digitalBlueOnDark,
  kidSoft: protopBrand.darkBrandSoft,
  fab: protopBrand.digitalBlue,
  accent: '#c4b5fd',
};

/** Hjem-flaten (soft) — lys krem i lyst, samme mørke flater i mørkt. */
export const SOFT_LIGHT = {
  bg: '#F5F2EC',
  card: '#FFFFFF',
  ink: '#1F2630',
  muted: '#5C6573',
  quiet: '#7A8494',
  line: '#E8E4DC',
  mint: '#E8F3EC',
  peach: '#F8EDE6',
  lavender: '#EEF0F8',
  sky: '#E8F0F6',
  cream: '#FAF7F2',
  family: '#F7F3EA',
  sage: '#5A7A60',
  brandSoft: '#DCE8E0',
};

export const SOFT_DARK = {
  bg: '#000000',
  card: '#1c1c1e',
  ink: '#f2f2f7',
  muted: '#8e8e93',
  quiet: '#636366',
  line: '#38383a',
  mint: '#1a3326',
  peach: '#3a2a22',
  lavender: '#242838',
  sky: '#1a2833',
  cream: '#1c1c1e',
  family: '#161618',
  sage: '#9dbea6',
  brandSoft: '#24382c',
};

export function paletteFor(scheme) {
  return scheme === 'dark' ? DARK : LIGHT;
}
