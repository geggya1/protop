import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { customerPhoneLines } from '../../src/anbud/customers';

export default function CustomerPhoneRow({ customer, people, projectCount, colors, onPress }) {
  const lines = customerPhoneLines(customer, people, { projectCount });
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${customer?.customerNumber || ''} ${lines.name}`.trim()}
      style={[styles.row, { borderColor: colors.line }]}
    >
      <Text style={[styles.name, { color: colors.ink }]}>{lines.name}</Text>
      <Text style={[styles.meta, { color: colors.muted }]}>{lines.meta}</Text>
      {lines.extra ? <Text style={[styles.meta, { color: colors.ink }]}>{lines.extra}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
    borderTopWidth: 1,
    width: '100%',
  },
  name: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
  meta: { fontSize: 13, lineHeight: 18 },
});
