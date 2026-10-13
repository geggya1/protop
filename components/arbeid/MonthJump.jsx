import React from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * År- og månedsvelger. Åpnes fra månedsnavnet i timelisten.
 */
export default function MonthJump({
  visible,
  year,
  monthIndex,
  colors,
  onYear,
  onPick,
  onClose,
}) {
  if (!visible) return null;
  return (
    <View style={styles.host} nativeID="timesheet-month-jump">
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Lukk måned" />
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={styles.yearRow}>
          <TouchableOpacity onPress={() => onYear?.(-1)} accessibilityRole="button" accessibilityLabel="Forrige år" style={styles.hit}>
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.year, { color: colors.ink }]}>{year}</Text>
          <TouchableOpacity onPress={() => onYear?.(1)} accessibilityRole="button" accessibilityLabel="Neste år" style={styles.hit}>
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <View style={styles.grid}>
          {MONTHS.map((label, index) => {
            const on = index === monthIndex;
            return (
              <TouchableOpacity
                key={label}
                onPress={() => onPick?.(index)}
                accessibilityRole="button"
                accessibilityLabel={label}
                style={[styles.month, on && { backgroundColor: colors.brand || '#6d28d9' }]}
              >
                <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: on ? '700' : '500', fontSize: 14 }}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 52,
    left: 0,
    right: 0,
    zIndex: 20,
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: -80,
    left: -400,
    right: -400,
    bottom: -800,
  },
  card: {
    width: 280,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#0f172a',
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  year: { fontSize: 16, fontWeight: '700', minWidth: 72, textAlign: 'center' },
  hit: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  month: {
    width: '25%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
  },
});
