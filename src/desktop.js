import { Platform } from 'react-native';

/**
 * Desktop-only layout helpers.
 * Mobil og nettbrett skal ikke bruke disse — kallstedene gater på isDesktop.
 */

export const DESKTOP_MIN_WIDTH = 1024;

export const desktopOverlay = {
  justifyContent: 'center',
  alignItems: 'center',
  padding: 28,
};

export const desktopSheet = {
  position: 'relative',
  width: '100%',
  maxWidth: 420,
  maxHeight: '82%',
  borderRadius: 10,
  borderTopLeftRadius: 10,
  borderTopRightRadius: 10,
  ...(Platform.OS === 'web'
    ? { boxShadow: '0 24px 56px rgba(15, 23, 42, 0.20)' }
    : { elevation: 8 }),
};

/** Større sentrert skjema-popup (kalender, oppgave, osv.). */
export const desktopFormSheet = {
  ...desktopSheet,
  maxWidth: 540,
  maxHeight: '90%',
  borderRadius: 12,
  borderTopLeftRadius: 12,
  borderTopRightRadius: 12,
};

export const desktopMenu = {
  position: 'absolute',
  top: 48,
  right: 12,
  width: 280,
  maxWidth: 280,
  maxHeight: '80%',
  borderRadius: 8,
  paddingTop: 12,
  padding: 10,
  ...(Platform.OS === 'web'
    ? { boxShadow: '0 12px 32px rgba(15, 23, 42, 0.14)', borderWidth: 1, borderColor: '#e2e8f0' }
    : { elevation: 8 }),
};

export function webDataSet(attrs) {
  if (Platform.OS !== 'web') return null;
  return { dataSet: attrs };
}

export function isMacWeb() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/i.test(navigator.userAgent || navigator.platform || '');
}
