/**
 * ProTops designtokens for avstand, hjørner, skrift og skygge (UX-02/UX-03).
 * Farger ligger i src/appearance/palette.js og leses med useColors().
 *
 * Nye skjermer bruker disse i stedet for tall i stilen. src/ui/designGuard.test.mjs
 * teller hardkodede hex-farger, fontSize og borderRadius under screens/ og stopper
 * en endring som øker tallet.
 */

/** Avstand i et 4-punkts rutenett (padding, margin, gap). */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
};

/** Hjørner: felt og knapper, kort, ark/dialog og pille. Likt på alle flater. */
export const radius = {
  control: 8,
  card: 12,
  sheet: 16,
  pill: 999,
};

/**
 * Skriftskala. Vektene 400, 500 og 600 er lastet på web (app.web.css),
 * så ingenting blir syntetisk fet. 700/800 skal ikke brukes.
 */
export const type = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.3 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4 },
};

/** Fontvektene som faktisk er lastet. */
export const FONT_WEIGHTS = ['400', '500', '600'];

/** Minste trykkflate på berøringsskjerm (WCAG 2.5.5 / Apple HIG). */
export const touch = { min: 44 };

/**
 * Skygge i tre nivåer: 0 flatt, 1 kort, 2 ark og meny.
 * Web bruker boxShadow, iOS shadow*, Android elevation.
 */
export const elevation = {
  0: { web: {}, native: {} },
  1: {
    web: { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' },
    native: { shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  },
  2: {
    web: { boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)' },
    native: { shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  },
};

/** Stil for et skyggenivå på gitt plattform ('web' eller annet). */
export function elevationStyle(level = 1, os = 'web') {
  const entry = elevation[level] || elevation[0];
  return os === 'web' ? entry.web : entry.native;
}
