import React from 'react';
import { Image, StyleSheet } from 'react-native';

const FULL = require('../assets/weekplan-logo-transparent.png');
const MARK = require('../assets/weekplan-mark.png');

/** ProTop lockup 1306×481; symbol 422×447. */
const ASPECT = { full: 1306 / 481, mark: 422 / 447 };

/**
 * Offisiell ProTop-logo.
 * variant="full" — lås (top bar, login, welcome).
 * variant="mark" — kun symbol (collapsed rail, favicon-lignende plasser).
 */
export default function BrandLogo({
  variant = 'full',
  height = 28,
  maxWidth,
  style,
  accessible = true,
}) {
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
