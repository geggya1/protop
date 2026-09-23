import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { colors } from '../src/theme';

/**
 * Synlig av/på-bryter. RN Switch blir ofte sort/ulestelig på web.
 */
export default function BrandToggle({ value, onValueChange, disabled, compact }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => { if (!disabled) onValueChange(!value); }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled: !!disabled }}
      hitSlop={compact ? { top: 8, bottom: 8, left: 8, right: 8 } : { top: 4, bottom: 4, left: 4, right: 4 }}
      style={[
        styles.track,
        compact && styles.trackCompact,
        value ? styles.trackOn : styles.trackOff,
        disabled && styles.disabled,
        styles.hit,
      ]}
    >
      <View style={[styles.knob, compact && styles.knobCompact, value && styles.knobOn]} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hit: Platform.OS === 'web'
    ? { cursor: 'pointer', zIndex: 2, position: 'relative' }
    : null,
  track: {
    width: 52, height: 32, borderRadius: 16, padding: 3, justifyContent: 'center',
  },
  trackCompact: {
    width: 36, height: 20, borderRadius: 10, padding: 2,
  },
  trackOn: { backgroundColor: colors.brand },
  trackOff: { backgroundColor: '#d1d5db' },
  knob: {
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.card,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  knobCompact: {
    width: 16, height: 16, borderRadius: 8,
  },
  knobOn: { alignSelf: 'flex-end' },
  disabled: { opacity: 0.45 },
});
