import { protopBrand } from '../brand/protopBrand.js';

/**
 * Lys og mørk palett for menyer, flater og tekst.
 * brand (#1099F4) er til ikoner, illustrasjoner, fokusring og stor tekst.
 * Tekst, lenker, aktive faner og fylte knapper bruker *Ink-fargene, som gir minst 4,5:1
 * mot kort og bakgrunn (WCAG 1.4.3). onBrand er teksten på en fylt brandInk-knapp.
 */

export const LIGHT = {
  bg: '#f4f7fb',
  card: '#ffffff',
  sunken: '#f8fafc',
  ink: '#1a2744',
  muted: '#5b6b82',
  line: '#e2e8f0',
  brand: protopBrand.digitalBlue,
  brandSoft: protopBrand.digitalBlueSoft,
  brandInk: '#0A70B5',
  onBrand: '#ffffff',
  success: '#16a34a',
  successSoft: '#e4f5ea',
  successInk: '#15803d',
  warn: '#d97706',
  warnInk: '#b45309',
  danger: '#dc2626',
  dangerInk: '#b42318',
  dangerSoft: '#fee4e2',
  star: '#e2a325',
  starSoft: '#fff8e8',
  placeholder: '#64748b',
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
  brandInk: protopBrand.digitalBlueOnDark,
  onBrand: protopBrand.navy,
  success: '#4ade80',
  successSoft: '#052e16',
  successInk: '#4ade80',
  warn: '#fbbf24',
  warnInk: '#fbbf24',
  danger: '#f87171',
  dangerInk: '#f87171',
  dangerSoft: '#3b1212',
  star: '#fbbf24',
  starSoft: '#3f2e0a',
  placeholder: '#8e8e93',
  kid: protopBrand.digitalBlueOnDark,
  kidSoft: protopBrand.darkBrandSoft,
  fab: protopBrand.digitalBlue,
  accent: '#c4b5fd',
};

export function paletteFor(scheme) {
  return scheme === 'dark' ? DARK : LIGHT;
}
