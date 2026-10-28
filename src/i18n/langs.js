export const LANGS = [
  { id: 'nb', name: 'Norsk', flag: '🇳🇴' },
  { id: 'en', name: 'English', flag: '🇬🇧' },
  { id: 'da', name: 'Dansk', flag: '🇩🇰' },
  { id: 'sv', name: 'Svenska', flag: '🇸🇪' },
  { id: 'fi', name: 'Suomi', flag: '🇫🇮' },
  { id: 'pl', name: 'Polski', flag: '🇵🇱' },
  { id: 'es', name: 'Español', flag: '🇪🇸' },
  { id: 'fr', name: 'Français', flag: '🇫🇷' },
  { id: 'de', name: 'Deutsch', flag: '🇩🇪' },
];

export const LANG_IDS = LANGS.map((l) => l.id);

/**
 * Språkene ProTop-skallet kan vises på nå (UX-08). Bedriftsmodulene (timer, fravær,
 * prosjekt, økonomi …) er bare på norsk, så skallet låses til norsk og engelsk til
 * modulene er oversatt. Oversettelsene til de andre språkene ligger igjen i strings.js.
 */
export const ACTIVE_LANG_IDS = ['nb', 'en'];
export const ACTIVE_LANGS = LANGS.filter((l) => ACTIVE_LANG_IDS.includes(l.id));

/** Skandinavisk blir norsk; alt annet utenom norsk og engelsk blir engelsk. */
export function activeLanguage(id) {
  const raw = String(id || '').trim().toLowerCase();
  if (!raw) return 'nb';
  if (ACTIVE_LANG_IDS.includes(raw)) return raw;
  if (['no', 'nn', 'da', 'sv'].includes(raw)) return 'nb';
  return 'en';
}
/** Vilkår og personvernerklæring. Ny versjon gjør at brukerne bes om å godta på nytt. */
export const LEGAL_VERSION = '3.0.0';
/** Databehandleravtalen for bedrifter. Ny versjon ber eier/admin godta på nytt. */
export const DPA_VERSION = '1.0.0';
export const LANG_KEY = 'protop.lang';
export const CONSENT_KEY = 'protop.consents';
