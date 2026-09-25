import { Platform, useWindowDimensions } from 'react-native';
import { adaptiveColor } from './appearance/adaptiveColor';
import { DARK, LIGHT } from './appearance/palette';

/**
 * Overflate og tekst følger valgt utseende (lys / mørk / automatisk).
 * Merkefarger som brukes i strenger (`${colors.brand}18`) forblir hex.
 */
function tone(key) {
  return adaptiveColor(`--wp-c-${key}`, LIGHT[key], DARK[key]);
}

export const colors = {
  bg: tone('bg'),
  card: tone('card'),
  sunken: tone('sunken'),
  ink: tone('ink'),
  muted: tone('muted'),
  line: tone('line'),
  brand: LIGHT.brand,
  brandSoft: tone('brandSoft'),
  success: LIGHT.success,
  successSoft: tone('successSoft'),
  warn: LIGHT.warn,
  danger: LIGHT.danger,
  star: LIGHT.star,
  starSoft: tone('starSoft'),
  placeholder: tone('placeholder'),
  kid: LIGHT.kid,
  kidSoft: tone('kidSoft'),
  fab: LIGHT.fab,
  accent: LIGHT.accent,
};

export const MEMBER_COLORS = [
  '#2563eb', '#e2a325', '#0ea5e9', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#ec4899',
];

export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 };

/**
 * Desktop-typografi: vanlig skrift, uten fet vekt.
 */
export const deskType = {
  brand: { fontSize: 15, fontWeight: '400' },
  title: { fontSize: 16, fontWeight: '400', letterSpacing: -0.2 },
  section: {
    fontSize: 11, fontWeight: '400', letterSpacing: 0.42,
    textTransform: 'uppercase', color: colors.muted,
  },
  nav: { fontSize: 13, fontWeight: '500' },
  navActive: { fontSize: 13, fontWeight: '400' },
  body: { fontSize: 13, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '500' },
  meta: { fontSize: 12, fontWeight: '400', color: colors.muted },
  small: { fontSize: 11, fontWeight: '400', color: colors.muted },
};

const radiusNative = { sm: 14, md: 20, lg: 28, pill: 999 };

/**
 * På web styres radius av CSS-variabler i app.web.css.
 * Mobil/nettbrett beholder de runde verdiene; desktop (≥1024) får skarpere hjørner.
 * Native (iOS/Android) bruker tallene uendret.
 */
export const radius = Platform.OS === 'web'
  ? {
    sm: 'var(--wp-radius-sm)',
    md: 'var(--wp-radius-md)',
    lg: 'var(--wp-radius-lg)',
    pill: 'var(--wp-radius-pill)',
  }
  : radiusNative;

export const radiusMobile = radiusNative;

/** Breakpoints: phone < 768 · tablet 768–1023 · desktop ≥ 1024 */
export const BREAKPOINTS = {
  tablet: 768,
  desktop: 1024,
};

/**
 * Responsiv layout-hjelper.
 * Mobil (phone) og nettbrett skal beholde dagens kompakte/runde UI uendret.
 * Desktop får tettere chrome, skarpere former og utnytter bredden.
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isPhone = width < BREAKPOINTS.tablet;
  const isTablet = width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
  const isDesktop = width >= BREAKPOINTS.desktop;
  const isWide = isDesktop; // bakoverkompatibel alias
  const hasRail = !isPhone;

  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    isWide,
    hasRail,
    /** Max bredde for hovedinnhold (innenfor main, utenom rail). */
    contentMax: isDesktop ? Math.min(width - 220, 1680) : isTablet ? 720 : width,
    pad: isDesktop ? 12 : isTablet ? 22 : 16,
    railWidth: isDesktop ? 220 : 200,
    headerCompact: isDesktop,
    /** App-grid: antall kolonner for snarveier. */
    appCols: isDesktop ? 4 : isTablet ? 4 : 3,
  };
}

/**
 * Tile width for flexWrap app grids with `gap`.
 * Percent-only widths ignore gap and wrap to fewer columns (e.g. 32%×3 + gap → 2 cols).
 */
export function appTileWidth(cols = 3, gap = 8) {
  const n = Math.max(1, Number(cols) || 3);
  // RN Web supports calc; native gets % with slack so gap fits.
  if (typeof document !== 'undefined') {
    return `calc((100% - ${(n - 1) * gap}px) / ${n})`;
  }
  const slack = n <= 3 ? 2.4 : 2.8;
  return `${(100 / n) - slack}%`;
}
