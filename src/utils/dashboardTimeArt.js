/**
 * Tid-på-dagen for dashbord-illustrasjoner.
 * Morgen 05–11, ettermiddag 11–17, kveld/natt ellers.
 */

export function dashboardDayPart(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  return 'evening';
}

export function dashboardDayPartLabel(part) {
  if (part === 'morning') return 'Morgen';
  if (part === 'afternoon') return 'Ettermiddag';
  return 'Kveld';
}

/**
 * Velg illustrasjon for tema + tid.
 * Faller tilbake til afternoon → morning → første tilgjengelige.
 */
export function resolveThemeHeroArt(theme, date = new Date()) {
  const pack = theme?.heroArt || null;
  if (!pack) return null;
  const part = dashboardDayPart(date);
  return pack[part] || pack.afternoon || pack.morning || pack.evening || null;
}

export function resolveThemeAccentArt(theme, date = new Date()) {
  const pack = theme?.accentArt || null;
  if (!pack) return null;
  const part = dashboardDayPart(date);
  return pack[part] || pack.afternoon || pack.morning || pack.evening || null;
}

function isDayPartPack(pack) {
  return !!(pack && typeof pack === 'object' && (pack.morning || pack.afternoon || pack.evening));
}

/** Page background image (optional). Day-part packs or a single source. */
export function resolveThemeBackgroundArt(theme, date = new Date()) {
  const pack = theme?.backgroundArt || null;
  if (!pack) return null;
  if (!isDayPartPack(pack)) return pack;
  const part = dashboardDayPart(date);
  return pack[part] || pack.afternoon || pack.morning || pack.evening || null;
}

export function dateForDashboardDayPart(part, base = new Date()) {
  const d = new Date(base);
  if (part === 'morning') d.setHours(8, 0, 0, 0);
  else if (part === 'afternoon') d.setHours(14, 0, 0, 0);
  else d.setHours(20, 0, 0, 0);
  return d;
}
