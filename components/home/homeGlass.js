/**
 * Immersive home surfaces — frosted glass over the photo (mockup look).
 * Outer frost stays translucent; fill is milkier so ink and module icons
 * stay readable on busy photo backgrounds.
 */

import { Platform, StyleSheet } from 'react-native';

const webFrost = Platform.OS === 'web' ? {
  backdropFilter: 'blur(22px) saturate(1.18)',
  WebkitBackdropFilter: 'blur(22px) saturate(1.18)',
} : null;

/** Primary widget card frost — denser fill for text contrast (mockup). */
export const immersiveCardSurface = {
  backgroundColor: 'rgba(255,255,255,0.52)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.82)',
  borderRadius: 18,
  ...webFrost,
  ...(Platform.OS === 'web' ? {
    boxShadow: '0 8px 28px rgba(20, 28, 45, 0.14)',
  } : null),
};

/** Nested chips / inner tiles on a glass card. */
export const immersiveChipSurface = {
  backgroundColor: 'rgba(255,255,255,0.42)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.7)',
  ...webFrost,
};

/**
 * Solid disc behind module glyphs — pops the icon against frost.
 */
export const immersiveIconDisc = {
  backgroundColor: 'rgba(255,255,255,0.94)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.95)',
  ...(Platform.OS === 'web' ? {
    boxShadow: '0 2px 8px rgba(20, 28, 45, 0.1)',
  } : null),
};

/**
 * Small chrome (edit pencil, dock-adjacent controls).
 */
export const immersiveGlass = {
  backgroundColor: 'rgba(255,255,255,0.45)',
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: 'rgba(255,255,255,0.75)',
  ...webFrost,
  ...(Platform.OS === 'web' ? {
    boxShadow: '0 4px 14px rgba(20, 28, 45, 0.1)',
  } : null),
};

/**
 * Grid cell shell — transparent; the pastel card supplies the frost and
 * must fill the cell (height 100%) so content never paints outside it.
 */
export const immersiveWidgetCell = {
  backgroundColor: 'transparent',
  borderWidth: 0,
};

export const immersiveHeroText = '#FFFFFF';
export const immersiveHeroMuted = 'rgba(255,255,255,0.9)';
