/**
 * ProTop identity for every surface.
 *
 * The app is one Expo codebase (JavaScript, with TypeScript where the
 * module is new). The same bundle runs on phone, tablet and web, and
 * EAS builds that bundle for App Store and Google Play.
 * Live data goes through the Firebase JS SDK, so realtime listeners
 * are the same code on all three platforms.
 */

export const protopBrand = {
  name: 'ProTop',
  tagline: 'Digitale løsninger for bygg og anlegg',
  navy: '#07274C',
  digitalBlue: '#1099F4',
  digitalBlueSoft: '#E5F6FE',
  digitalBlueOnDark: '#6EC8FF',
  darkBrandSoft: '#0C3358',
  white: '#FFFFFF',
  bundleId: 'no.protop.app',
  scheme: 'protop',
  firebaseProjectId: 'protop-c189c',
};

/** Phone, tablet and desktop web, plus the two store binaries. */
export const PROTOP_PLATFORMS = ['web', 'ios', 'android'];
