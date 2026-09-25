import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';

function CountStepper({ label, value, onChange, min = 0, max = 12, compact = false }) {
  return (
    <View style={styles.stepCol}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={[styles.stepRow, compact && styles.stepRowCompact]}>
        <TouchableOpacity
          style={[styles.stepBtn, value <= min && styles.stepBtnOff]}
          onPress={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          accessibilityLabel={`Færre ${label.toLowerCase()}`}
        >
          <Ionicons name="remove" size={18} color={value <= min ? colors.muted : colors.brand} />
        </TouchableOpacity>
        <Text style={[styles.stepVal, compact && styles.stepValCompact]}>{value}</Text>
        <TouchableOpacity
          style={[styles.stepBtn, value >= max && styles.stepBtnOff]}
          onPress={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          accessibilityLabel={`Flere ${label.toLowerCase()}`}
        >
          <Ionicons name="add" size={18} color={value >= max ? colors.muted : colors.brand} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PortionSteppers({
  adults,
  childrenCount,
  onChangeAdults,
  onChangeChildren,
  hint = 'Standard er familien (18+ = voksen). Mengdene oppdateres med en gang.',
  compact = false,
}) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]}>Antall personer</Text>
      {!!hint && <Text style={[styles.hint, compact && styles.hintCompact]}>{hint}</Text>}
      <View style={styles.row}>
        <CountStepper
          label="Voksne"
          value={adults}
          onChange={onChangeAdults}
          min={childrenCount > 0 ? 0 : 1}
          compact={compact}
        />
        <CountStepper
          label="Barn"
          value={childrenCount}
          onChange={onChangeChildren}
          min={adults > 0 ? 0 : 1}
          compact={compact}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: 14, padding: 14, gap: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  cardCompact: {
    padding: 10,
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  title: { fontWeight: '400', fontSize: 15, color: colors.ink },
  titleCompact: { fontSize: 14, fontWeight: '400' },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 12, lineHeight: 17 },
  hintCompact: { fontSize: 11, lineHeight: 15 },
  row: { flexDirection: 'row', gap: 12 },
  stepCol: { flex: 1, gap: 6 },
  stepLabel: { fontWeight: '400', fontSize: 12, color: colors.muted, textTransform: 'uppercase' },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8fafc', borderRadius: 12, padding: 6, borderWidth: 1, borderColor: colors.line,
  },
  stepRowCompact: { backgroundColor: colors.card, padding: 4 },
  stepBtn: {
    width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#eef6ff',
  },
  stepBtnOff: { backgroundColor: '#f1f5f9' },
  stepVal: { fontWeight: '400', fontSize: 20, color: colors.ink, minWidth: 28, textAlign: 'center' },
  stepValCompact: { fontSize: 18 },
});
