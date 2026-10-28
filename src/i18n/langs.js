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
/** Vilkår og personvernerklæring. Ny versjon gjør at brukerne bes om å godta på nytt. */
export const LEGAL_VERSION = '3.0.0';
/** Databehandleravtalen for bedrifter. Ny versjon ber eier/admin godta på nytt. */
export const DPA_VERSION = '1.0.0';
export const LANG_KEY = 'protop.lang';
export const CONSENT_KEY = 'protop.consents';
