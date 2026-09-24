import React from 'react';
import { Image, StyleSheet, type ImageStyle, type StyleProp } from 'react-native';

type Variant = 'full' | 'mark';

type BrandLogoProps = {
  variant?: Variant;
  height?: number;
  maxWidth?: number;
  style?: StyleProp<ImageStyle>;
  accessible?: boolean;
};

const FULL = require('../assets/weekplan-logo-transparent.png');
const MARK = require('../assets/weekplan-mark.png');

/** Approved lockup 1306×481. Approved symbol 422×447. */
const ASPECT: Record<Variant, number> = { full: 1306 / 481, mark: 422 / 447 };

/**
 * Official ProTop logo. Nothing is stretched or redrawn.
 * variant="full" — lockup (top bar, login, welcome).
 * variant="mark" — symbol only (collapsed rail).
 */
export default function BrandLogo({
  variant = 'full',
  height = 28,
  maxWidth,
  style,
  accessible = true,
}: BrandLogoProps) {
  const source = variant === 'mark' ? MARK : FULL;
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
