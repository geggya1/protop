import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { ANBUD_MENU, defaultAnbudSubView } from '../../src/navigation/shellModules';
import { directQueueItems, noticesAwaitingBid } from '../../src/anbud/processTrail';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { useLayout } from '../../src/theme';
import ScrollSheet from '../../components/ScrollSheet';
import TenderAlert from './TenderAlert';
import TenderInquiry from './TenderInquiry';
import CurrentReview from './CurrentReview';
import BidDesk from './BidDesk';
import WatchSettings from './WatchSettings';
import PipelineBoard from './PipelineBoard';
import CalloffInbox from './CalloffInbox';
import { setNoticeDecision } from '../../src/anbud/model';

export default function AnbudScreen({ company, subView, members = [], units = [], companies = [] }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, shellIntent, clearShellIntent, family } = useApp();
  const [step, setStep] = useState(() => defaultAnbudSubView(subView));
  const [bids, setBids] = useState([]);
  const [aktuellCount, setAktuellCount] = useState(0);
  const [focusBidId, setFocusBidId] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [desk, setDesk] = useState(null);
  const inquiries = Array.isArray(family?.anbudInquiries) ? family.anbudInquiries : (company?.anbudInquiries || []);
  const inbox = Array.isArray(family?.anbudInbox) ? family.anbudInbox : (company?.anbudInbox || []);
  const reviewCount = aktuellCount + directQueueItems({ inquiries, inbox }).length;

  useEffect(() => {
    setStep(defaultAnbudSubView(subView));
  }, [subView]);

  useEffect(() => {
    let live = true;
    loadAnbudState(company?.id).then((loaded) => {
      if (!live) return;
      setBids(loaded?.bids || []);
      setAktuellCount(noticesAwaitingBid(loaded?.notices).length);
      setDesk(loaded);
    });
    return () => { live = false; };
  }, [company?.id]);

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
          const extra = item.id === 'tilbud' && bids.length
            ? ` (${bids.length})`
            : item.id === 'vurdering' && reviewCount
              ? ` (${reviewCount})`
              : '';
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
          onReviewCount={setAktuellCount}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenReview={() => go('vurdering')}
        />
      ) : null}
      {step === 'foresporsel' ? <TenderInquiry company={company} colors={colors} /> : null}
      {step === 'vurdering' ? (
        <CurrentReview
          company={company}
          colors={colors}
          members={members}
          units={units}
          onNoticeCount={setAktuellCount}
          onOpenBid={(bidId) => { go('tilbud'); setFocusBidId(bidId); }}
          onOpenAlerts={() => go('varsling')}
          onOpenInquiry={() => go('foresporsel')}
        />
      ) : null}
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
          onOpenReview={() => go('vurdering')}
          onOpenContracts={() => requestShellTab?.('kontrakt')}
          onSnapshot={(next) => setBids(next?.bids || [])}
        />
      ) : null}
      {step === 'avrop' && desk ? (
        <CalloffInbox
          state={desk}
          colors={colors}
          onCommit={(next) => { setDesk(next); saveAnbudState(next, company?.id); }}
          onOpenBid={(notice) => {
            const marked = setNoticeDecision(desk, notice.id, 'aktuell');
            if (marked.ok) {
              setDesk(marked.state);
              saveAnbudState(marked.state, company?.id);
            }
            go('vurdering');
          }}
        />
      ) : null}
      {step === 'pipeline' && desk ? (
        <PipelineBoard
          state={desk}
          colors={colors}
          onCommit={(next) => {
            setDesk(next);
            setBids(next.bids || []);
            saveAnbudState(next, company?.id);
          }}
          onOpenBid={(bidId) => { go('tilbud'); setFocusBidId(bidId); }}
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
