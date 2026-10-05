import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import IntakePanel from './IntakePanel';

const MODES = [
  ['protop', 'Send i ProTop'],
  ['manual', 'Registrer henvendelse'],
];

export default function TenderInquiry({ company, colors }) {
  const [mode, setMode] = useState('protop');

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Anbudsforespørsel</Text>
      <Text style={{ color: colors.muted }}>
        Send en forespørsel til en annen bedrift i ProTop, eller registrer et brev, en e-post eller annen henvendelse du har fått.
      </Text>
      <View style={styles.row}>
        {MODES.map(([id, label]) => {
          const on = mode === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setMode(id)}
              accessibilityRole="button"
              style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <IntakePanel mode={mode} colors={colors} company={company} />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
