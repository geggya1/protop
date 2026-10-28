import { activeLanguage } from './langs.js';

/**
 * Map a BCP 47 tag to a ProTop language. Skallet er låst til norsk og engelsk (UX-08):
 * norsk, dansk og svensk gir norsk, alt annet engelsk.
 */
export function mapLanguageCode(tag) {
  const raw = String(tag || '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return 'nb';
  return activeLanguage(raw.split('-')[0]);
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
