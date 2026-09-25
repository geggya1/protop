import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import IntakePanel from './IntakePanel';
import TenderAlert from './TenderAlert';

const STEPS = [
  ['varsling', 'Trinn 1 · Anbudsvarsling'],
  ['tilbud', 'Trinn 2 · Tilbudsarbeid'],
];

export default function AnbudScreen({ company }) {
  const colors = useColors();
  const [step, setStep] = useState('varsling');
  const [intake, setIntake] = useState('');

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.bg }]} contentContainerStyle={styles.inner}>
      <Text style={[styles.h, { color: colors.ink }]}>Anbud</Text>
      <View style={styles.row}>
        {STEPS.map(([id, label]) => {
          const on = step === id;
          const locked = id !== 'varsling';
          return (
            <TouchableOpacity
              key={id}
              disabled={locked}
              onPress={() => setStep(id)}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: locked ? colors.muted : colors.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {step === 'varsling' ? <TenderAlert company={company} colors={colors} /> : null}
      {step !== 'varsling' ? (
        <Text style={{ color: colors.muted }}>Neste trinn kommer etter at treffene er vurdert i anbudsvarslingen.</Text>
      ) : null}
      <TouchableOpacity onPress={() => setIntake(intake ? '' : 'manuell')} accessibilityRole="button">
        <Text style={{ color: colors.muted, fontWeight: '400' }}>{intake ? 'Skjul andre innganger' : 'Andre innganger: ProTop og manuelt'}</Text>
      </TouchableOpacity>
      {intake ? (
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            {[['protop', 'Fra ProTop'], ['manuell', 'Manuelt']].map(([id, label]) => (
              <TouchableOpacity key={id} onPress={() => setIntake(id)} accessibilityRole="button">
                <Text style={{ color: intake === id ? colors.brand : colors.ink, fontWeight: '400' }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <IntakePanel mode={intake} colors={colors} company={company} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 1180, width: '100%', alignSelf: 'flex-start' },
  h: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
