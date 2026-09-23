import { LANG_IDS } from './langs.js';

/** Map a BCP 47 tag to a ProTop language. Unknown tags fall back to English. */
export function mapLanguageCode(tag) {
  const raw = String(tag || '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return 'nb';
  const primary = raw.split('-')[0];
  if (primary === 'no' || primary === 'nb' || primary === 'nn') return 'nb';
  if (LANG_IDS.includes(primary)) return primary;
  return 'en';
}

/** Device language tag. Safe when expo-localization is unavailable (tests, web). */
export function readDeviceLanguageTag() {
  try {
    // eslint-disable-next-line global-require
    const Localization = require('expo-localization');
    const locales = typeof Localization.getLocales === 'function' ? Localization.getLocales() : [];
    const first = Array.isArray(locales) ? locales[0] : null;
    if (first?.languageTag) return first.languageTag;
    if (first?.languageCode) return first.languageCode;
  } catch {
    // Native module missing in tests or before install.
  }
  if (typeof navigator !== 'undefined' && navigator) {
    return navigator.language || (Array.isArray(navigator.languages) ? navigator.languages[0] : '') || '';
  }
  return '';
}

export function deviceLanguageId() {
  return mapLanguageCode(readDeviceLanguageTag());
}
