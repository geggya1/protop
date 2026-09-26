import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { contractAlerts } from '../../src/anbud/lifecycle';
import { loadAnbudState } from '../../src/anbud/storage';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import TenderAlert from './TenderAlert';
import BidDesk from './BidDesk';
import ContractFollowUp from './ContractFollowUp';
import PortalSettings from './PortalSettings';

const STEPS = [
  ['varsling', 'Trinn 1 · Anbudsvarsling'],
  ['tilbud', 'Trinn 2 · Tilbudsarbeid'],
  ['kontrakt', 'Trinn 3 · Kontrakt'],
  ['innstillinger', 'Innstillinger'],
];

export default function AnbudScreen({ company }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const [step, setStep] = useState('varsling');
  const [bids, setBids] = useState([]);
  const [snapshot, setSnapshot] = useState(null);
  useEffect(() => {
    loadAnbudState().then((loaded) => {
      setSnapshot(loaded);
      setBids(loaded.bids || []);
    });
  }, []);
  const activeContracts = useMemo(
    () => (snapshot?.contracts || []).filter((row) => row.status !== 'avsluttet'),
    [snapshot],
  );
  const alerts = useMemo(() => contractAlerts(snapshot?.contracts || []), [snapshot]);

  return (
    <ScrollView
      style={[
        styles.screen,
        { backgroundColor: colors.bg },
        isPhone && styles.screenPhone,
      ]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <Text style={[styles.h, { color: colors.ink }]}>Anbud</Text>
      <Text style={{ color: colors.muted }}>
        Planlegg tilbudet, gjennomfør konkurransen og følg kontrakten til sluttfaktura.
      </Text>
      <View style={styles.row}>
        {STEPS.map(([id, label]) => {
          const on = step === id;
          const extra = id === 'tilbud' && bids.length
            ? ` (${bids.length})`
            : id === 'kontrakt' && activeContracts.length
              ? ` (${activeContracts.length})`
              : '';
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setStep(id)}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{label}{extra}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {alerts.length > 0 && step !== 'kontrakt' ? (
        <TouchableOpacity onPress={() => setStep('kontrakt')} accessibilityRole="button">
          <Text style={{ color: colors.warn }}>{alerts.length} {alerts.length === 1 ? 'frist krever' : 'frister krever'} oppfølging i kontrakten.</Text>
        </TouchableOpacity>
      ) : null}
      {step === 'varsling' ? (
        <TenderAlert company={company} colors={colors} onBids={setBids} onOpenSettings={() => setStep('innstillinger')} />
      ) : null}
      {step === 'tilbud' ? (
        <BidDesk
          company={company}
          colors={colors}
          bids={bids}
          onOpenSettings={() => setStep('innstillinger')}
          onOpenAlerts={() => setStep('varsling')}
          onOpenContracts={() => setStep('kontrakt')}
          onSnapshot={setSnapshot}
        />
      ) : null}
      {step === 'kontrakt' ? (
        <ContractFollowUp colors={colors} onOpenWork={() => setStep('tilbud')} onSnapshot={setSnapshot} />
      ) : null}
      {step === 'innstillinger' ? <PortalSettings company={company} colors={colors} onOpenWork={() => setStep('tilbud')} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  h: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
