import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

type Variant = 'full' | 'mark';
type Tone = 'primary' | 'white';

type BrandLogoProps = {
  variant?: Variant;
  /** primary = full colour. white = all-white lockup for black mode. */
  tone?: Tone;
  height?: number;
  maxWidth?: number;
  style?: StyleProp<ImageStyle>;
  accessible?: boolean;
};

const FULL = require('../assets/weekplan-logo-transparent.png');
const MARK = require('../assets/weekplan-mark.png');
const FULL_WHITE = require('../brand/ProTop_logo_white_transparent.png');
const MARK_WHITE = require('../brand/ProTop_symbol_white.png');

const SOURCE: Record<Variant, Record<Tone, number>> = {
  full: { primary: FULL, white: FULL_WHITE },
  mark: { primary: MARK, white: MARK_WHITE },
};

/** Approved lockup 1306×481. Approved symbol 422×447. White variants match. */
const ASPECT: Record<Variant, number> = { full: 1306 / 481, mark: 422 / 447 };

/**
 * Official ProTop logo. Nothing is stretched or redrawn.
 * variant="full" — lockup (top bar, login, welcome).
 * variant="mark" — symbol only (collapsed rail).
 * tone="white" — all-white artwork, only on black-mode chrome.
 */
export default function BrandLogo({
  variant = 'full',
  tone = 'primary',
  height = 28,
  maxWidth,
  style,
  accessible = true,
}: BrandLogoProps) {
  const source = SOURCE[variant]?.[tone] || SOURCE.full.primary;
  const aspect = ASPECT[variant] || ASPECT.full;
  let h = height;
  let w = h * aspect;
  if (maxWidth && w > maxWidth) {
    w = maxWidth;
    h = w / aspect;
  }
  return (
    <Image
      source={source}
      style={[styles.img, { width: w, height: h }, style]}
      resizeMode="contain"
      accessible={accessible}
      accessibilityLabel={accessible ? 'ProTop' : undefined}
      accessibilityRole={accessible ? 'image' : undefined}
    />
  );
}

const styles = StyleSheet.create({
  img: { flexShrink: 0 },
});
