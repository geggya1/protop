import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../src/theme';

/** Web-safe checkbox — does not rely on icon fonts. */
export default function CheckBox({ checked, onPress, label, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, style]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked && styles.boxOn]}>
        {checked ? <Text style={styles.tick}>✓</Text> : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.muted,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tick: { color: '#fff', fontWeight: '900', fontSize: 18, lineHeight: 20 },
  label: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
});
