/**
 * Små hjelpere for hjelpeintroene, uten selve tekstene (moduleIntros.js og hjelpekatalogen
 * lastes først når hjelpen åpnes).
 */

export function pickIntroText(value, lang = 'nb') {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value[lang]) return value[lang];
  if ((lang === 'da' || lang === 'sv') && value.nb) return value.nb;
  return value.en || value.nb || '';
}

export function introStorageKey(scope, moduleId) {
  return `${String(scope || 'family')}.${String(moduleId || '')}`;
}

export const MODULE_INTRO_SEEN_PREFIX = 'protop.moduleIntro.seen.v1';
