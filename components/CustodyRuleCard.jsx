import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import RecurrenceEditor from './RecurrenceEditor';
import { custodyRuleSummary, recurrenceUiFromRule } from '../src/utils/custodySchedule';

export default function CustodyRuleCard({
  rule,
  parentNames,
  onChange,
  onRemove,
  canRemove = true,
}) {
  const ui = recurrenceUiFromRule(rule);

  const setParentSlot = (parentSlot) => onChange?.({ ...rule, parentSlot });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{custodyRuleSummary(rule, parentNames)}</Text>
        {canRemove ? (
          <TouchableOpacity onPress={onRemove} hitSlop={8} accessibilityLabel="Fjern regel">
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.label}>Barnet er hos</Text>
      <View style={styles.parentRow}>
        <TouchableOpacity
          style={[styles.chip, rule.parentSlot !== 'parentB' && styles.chipOn]}
          onPress={() => setParentSlot('parentA')}
        >
          <Text style={[styles.chipTxt, rule.parentSlot !== 'parentB' && styles.chipTxtOn]}>
            {String(parentNames.parentA || 'Forelder A').split(' ')[0]}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, rule.parentSlot === 'parentB' && styles.chipOnB]}
          onPress={() => setParentSlot('parentB')}
        >
          <Text style={[styles.chipTxt, rule.parentSlot === 'parentB' && styles.chipTxtOn]}>
            {String(parentNames.parentB || 'Forelder B').split(' ')[0]}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>Regelmessighet</Text>
      <RecurrenceEditor
        value={ui}
        onChange={(patch) => onChange?.({
          ...rule,
          ...patch,
          recurring: patch.preset !== 'never',
        })}
        subjectLabel="Bostedsplanen"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 8,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontWeight: '400', fontSize: 14, color: colors.ink, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '400', color: colors.muted, textTransform: 'uppercase', marginTop: 4 },
  parentRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipOnB: { backgroundColor: '#ffedd5', borderColor: '#ea580c' },
  chipTxt: { fontWeight: '400', fontSize: 13, color: colors.ink },
  chipTxtOn: { color: colors.brand },
});
