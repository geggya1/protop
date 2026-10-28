/**
 * Informasjon om lokal lagring på web (ekomloven § 3-15). ProTop bruker bare lagring
 * som trengs for tjenesten, og ingen sporings- eller reklamecookies. Derfor trengs ingen
 * samtykkeknapp, bare informasjon første gang.
 */
export const STORAGE_NOTICE_KEY = 'protop.storageNotice';
export const STORAGE_NOTICE_VERSION = '1';

export const STORAGE_NOTICE_TEXT = 'ProTop lagrer bare det tjenesten trenger i nettleseren: innlogging, språk, innstillinger og et mellomlager. '
  + 'Vi bruker ingen sporings- eller reklamecookies. Skrift og kart hentes fra Google Fonts, unpkg og OpenStreetMap, som da ser IP-adressen din.';

/** Vises til brukeren har lukket den. Uten lagring (privat modus) vises den ikke på nytt hver gang. */
export function storageNoticeSeen(storage) {
  try {
    if (!storage || typeof storage.getItem !== 'function') return true;
    return storage.getItem(STORAGE_NOTICE_KEY) === STORAGE_NOTICE_VERSION;
  } catch {
    return true;
  }
}

export function markStorageNoticeSeen(storage) {
  try {
    storage?.setItem?.(STORAGE_NOTICE_KEY, STORAGE_NOTICE_VERSION);
  } catch {
    // privat modus
  }
}
