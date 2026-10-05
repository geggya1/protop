import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { ANBUD_MENU, defaultAnbudSubView } from '../../src/navigation/shellModules';
import { useLayout } from '../../src/theme';
import TenderAlert from './TenderAlert';
import TenderInquiry from './TenderInquiry';
import BidDesk from './BidDesk';
import PortalSettings from './PortalSettings';

export default function AnbudScreen({ company, subView }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab } = useApp();
  const [step, setStep] = useState(() => defaultAnbudSubView(subView));
  const [bids, setBids] = useState([]);
  const [focusBidId, setFocusBidId] = useState('');

  useEffect(() => {
    setStep(defaultAnbudSubView(subView));
  }, [subView]);

  function go(id) {
    setStep(id);
    requestShellTab?.('anbud', id);
  }

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
        Varsle om konkurranser, registrer henvendelser bedriften har fått, og arbeid med hvert tilbud for seg.
      </Text>
      <View style={styles.row}>
        {ANBUD_MENU.map((item) => {
          const on = step === item.id;
          const extra = item.id === 'tilbud' && bids.length ? ` (${bids.length})` : '';
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => go(item.id)}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{item.label}{extra}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {step === 'varsling' ? (
        <TenderAlert
          company={company}
          colors={colors}
          onBids={setBids}
          onOpenSettings={() => go('innstillinger')}
          onOpenBid={(bidId) => { go('tilbud'); setFocusBidId(bidId); }}
        />
      ) : null}
      {step === 'henvendelse' ? <TenderInquiry company={company} colors={colors} /> : null}
      {step === 'tilbud' ? (
        <BidDesk
          company={company}
          colors={colors}
          bids={bids}
          focusBidId={focusBidId}
          onFocusHandled={() => setFocusBidId('')}
          onOpenSettings={() => go('innstillinger')}
          onOpenAlerts={() => go('varsling')}
          onOpenContracts={() => requestShellTab?.('kontrakt')}
          onSnapshot={(next) => setBids(next?.bids || [])}
        />
      ) : null}
      {step === 'innstillinger' ? <PortalSettings company={company} colors={colors} onOpenWork={() => go('tilbud')} /> : null}
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
