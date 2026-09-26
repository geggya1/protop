import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import TenderAlert from './TenderAlert';
import BidDesk from './BidDesk';
import PortalSettings from './PortalSettings';

const STEPS = [
  ['varsling', 'Trinn 1 · Anbudsvarsling'],
  ['tilbud', 'Trinn 2 · Tilbudsarbeid'],
  ['innstillinger', 'Innstillinger'],
];

export default function AnbudScreen({ company }) {
  const colors = useColors();
  const [step, setStep] = useState('varsling');
  const [bids, setBids] = useState([]);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.bg }]} contentContainerStyle={styles.inner}>
      <Text style={[styles.h, { color: colors.ink }]}>Anbud</Text>
      <View style={styles.row}>
        {STEPS.map(([id, label]) => {
          const on = step === id;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setStep(id)}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{label}{id === 'tilbud' && bids.length ? ` (${bids.length})` : ''}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {step === 'varsling' ? (
        <TenderAlert company={company} colors={colors} onBids={setBids} onOpenSettings={() => setStep('innstillinger')} />
      ) : null}
      {step === 'tilbud' ? <BidDesk company={company} colors={colors} bids={bids} onOpenSettings={() => setStep('innstillinger')} /> : null}
      {step === 'innstillinger' ? <PortalSettings company={company} colors={colors} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  h: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
