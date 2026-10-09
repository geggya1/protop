import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { customerInvoiceGaps, customerPhoneLines } from '../../src/anbud/customers';

export default function CustomerPhoneRow({ customer, people, projectCount, colors, onPress }) {
  const lines = customerPhoneLines(customer, people, { projectCount });
  const gaps = customerInvoiceGaps(customer);
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${customer?.customerNumber || ''} ${lines.name}${gaps.length ? ' Må rettes før fakturering' : ''}`.trim()}
      style={[styles.row, { borderColor: colors.line }]}
    >
      <View style={styles.nameRow}>
        {gaps.length ? (
          <Ionicons
            name="warning"
            size={16}
            color={colors.danger || '#b45309'}
            accessibilityLabel="Må rettes før fakturering"
          />
        ) : null}
        <Text style={[styles.name, { color: colors.ink }]}>{lines.name}</Text>
      </View>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 16, fontWeight: '600', lineHeight: 22, flex: 1 },
  meta: { fontSize: 13, lineHeight: 18 },
});
