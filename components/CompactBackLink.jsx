import React from 'react';
import { Pressable, Text, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';

/** Kompakt tilbake-lenke — kort label, lite vertikal fotavtrykk, stor trykkflate. */
export default function CompactBackLink({
  onPress,
  label = 'Tilbake',
  accessibilityLabel,
  compact = false,
  color,
  light = false,
}) {
  const colors = useColors();
  const tint = color || (light ? '#FFFFFF' : colors.brand);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        pressed && styles.pressed,
        Platform.OS === 'web' ? styles.web : null,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      hitSlop={{ top: 12, bottom: 12, left: 10, right: 20 }}
    >
      <Ionicons name="chevron-back" size={18} color={tint} />
      <Text style={[styles.txt, { color: tint }, light && styles.txtLight]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 2,
    paddingVertical: 6,
    paddingRight: 12,
    marginBottom: 4,
    zIndex: 2,
  },
  rowCompact: {
    marginBottom: 0,
    paddingVertical: 4,
  },
  pressed: { opacity: 0.65 },
  web: { cursor: 'pointer' },
  txt: { fontWeight: '400', fontSize: 13 },
  txtLight: {
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
