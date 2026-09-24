import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useThemeMeta } from '../src/context/ThemeContext';
import { getChildTheme } from '../src/childThemes';

const PATTERN_MOTIFS = {
  teddy: ['🧸', '🤎', '⭐', '🧸', '✨'],
  flowers: ['🌸', '🌼', '🌺', '🌷', '💮'],
  stars: ['⭐', '✨', '🌙', '✦', '🌟'],
  bubbles: ['🫧', '○', '∘', '💧', '🫧'],
  rainbow: ['🌈', '💛', '🧡', '💗', '💚'],
  honey: ['🐝', '🍯', '✨', '🐝', '💛'],
};

/** Soft repeating motif positions (percent of screen). */
const SLOTS = [
  { t: 6, l: 8 }, { t: 4, l: 42 }, { t: 8, l: 78 },
  { t: 22, l: 18 }, { t: 18, l: 58 }, { t: 26, l: 88 },
  { t: 40, l: 6 }, { t: 38, l: 48 }, { t: 44, l: 72 },
  { t: 58, l: 22 }, { t: 56, l: 64 }, { t: 62, l: 90 },
  { t: 74, l: 10 }, { t: 72, l: 40 }, { t: 78, l: 76 },
  { t: 88, l: 28 }, { t: 90, l: 56 }, { t: 86, l: 84 },
];

/**
 * Subtil dekorativ bakgrunn for barnevennlige temaer.
 * pointerEvents="none" så den aldri blokkerer trykk.
 */
export default function ChildThemeBackdrop({ themeId: themeIdProp = null }) {
  const { themeId: ctxThemeId, isChildTheme } = useThemeMeta();
  const { width, height } = useWindowDimensions();

  const theme = useMemo(
    () => getChildTheme(themeIdProp || ctxThemeId),
    [themeIdProp, ctxThemeId],
  );

  const pattern = theme?.pattern;
  const motifs = pattern ? PATTERN_MOTIFS[pattern] : null;

  if ((!isChildTheme && !themeIdProp) || !motifs?.length) return null;

  const minSide = Math.min(width || 360, height || 640);
  const fontSize = Math.max(16, Math.min(28, Math.round(minSide * 0.045)));

  return (
    <View pointerEvents="none" style={styles.layer} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SLOTS.map((slot, i) => (
        <Text
          key={`${pattern}-${i}`}
          style={[
            styles.motif,
            {
              top: `${slot.t}%`,
              left: `${slot.l}%`,
              fontSize: fontSize + (i % 3) * 2,
              opacity: 0.14 + (i % 4) * 0.03,
              transform: [{ rotate: `${(i % 5) * 8 - 16}deg` }],
            },
          ]}
        >
          {motifs[i % motifs.length]}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 0,
  },
  motif: {
    position: 'absolute',
  },
});
