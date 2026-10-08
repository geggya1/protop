import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { ANBUD_MENU, defaultAnbudSubView } from '../../src/navigation/shellModules';
import { useLayout } from '../../src/theme';
import ScrollSheet from '../../components/ScrollSheet';
import TenderAlert from './TenderAlert';
import TenderInquiry from './TenderInquiry';
import BidDesk from './BidDesk';
import WatchSettings from './WatchSettings';

export default function AnbudScreen({ company, subView, members = [], units = [], companies = [] }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, shellIntent, clearShellIntent } = useApp();
  const [step, setStep] = useState(() => defaultAnbudSubView(subView));
  const [bids, setBids] = useState([]);
  const [focusBidId, setFocusBidId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setStep(defaultAnbudSubView(subView));
  }, [subView]);

  useEffect(() => {
    if (!shellIntent || typeof shellIntent !== 'object' || shellIntent.type !== 'openBid') return;
    const bidId = String(shellIntent.bidId || '').trim();
    if (!bidId) return;
    setStep('tilbud');
    setFocusBidId(bidId);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

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
          units={units}
          onBids={setBids}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenBid={(bidId) => { go('tilbud'); setFocusBidId(bidId); }}
        />
      ) : null}
      {step === 'foresporsel' ? <TenderInquiry company={company} colors={colors} /> : null}
      {step === 'tilbud' ? (
        <BidDesk
          company={company}
          colors={colors}
          bids={bids}
          focusBidId={focusBidId}
          members={members}
          units={units}
          companies={companies}
          onFocusHandled={() => setFocusBidId('')}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenAlerts={() => go('varsling')}
          onOpenContracts={() => requestShellTab?.('kontrakt')}
          onSnapshot={(next) => setBids(next?.bids || [])}
        />
      ) : null}
      <ScrollSheet
        visible={settingsOpen}
        title="Innstillinger"
        onClose={() => setSettingsOpen(false)}
      >
        <WatchSettings
          company={company}
          colors={colors}
          units={units}
          onOpenWork={() => { setSettingsOpen(false); go('tilbud'); }}
        />
      </ScrollSheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
