import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function IndexWarning({ warning, colors, onContinue, onOpenIndex, continueLabel = 'Fortsett likevel' }) {
  if (!warning) return null;
  const tone = colors.danger || '#b45309';
  const detail = [
    warning.indexName,
    warning.table ? `SSB-tabell ${warning.table}` : '',
    warning.reason,
  ].filter(Boolean).join(' · ');
  return (
    <View
      nativeID="index-invoice-warning"
      accessibilityRole="alert"
      style={[styles.box, { borderColor: tone, backgroundColor: colors.card }]}
    >
      <Ionicons name="alert-circle" size={18} color={tone} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ color: tone, fontWeight: '700' }}>
          Indeksregulering bør foretas før fakturering av {warning.projectName}.
        </Text>
        {detail ? <Text style={{ color: colors.ink }}>{detail}</Text> : null}
        <View style={styles.row}>
          {onOpenIndex ? (
            <TouchableOpacity onPress={onOpenIndex} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Gå til indeksregulering</Text>
            </TouchableOpacity>
          ) : null}
          {onContinue ? (
            <TouchableOpacity onPress={onContinue} accessibilityRole="button">
              <Text style={{ color: colors.ink }}>{continueLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
