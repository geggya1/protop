import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { ANBUD_MENU, ANBUD_PROCESS_IDS, defaultAnbudSubView } from '../../src/navigation/shellModules';
import { directQueueItems, noticesAwaitingBid } from '../../src/anbud/processTrail';
import { loadAnbudState } from '../../src/anbud/storage';
import { useLayout } from '../../src/theme';
import ScrollSheet from '../../components/ScrollSheet';
import TenderAlert from './TenderAlert';
import TenderInquiry from './TenderInquiry';
import CurrentReview from './CurrentReview';
import BidDesk from './BidDesk';
import WatchSettings from './WatchSettings';
import { bidListedOnDesk } from '../../src/anbud/model';

function stepLabel(item, bids, reviewCount) {
  const extra = item.id === 'tilbud' && bids.length
    ? ` (${bids.length})`
    : item.id === 'vurdering' && reviewCount
      ? ` (${reviewCount})`
      : '';
  return `${item.label}${extra}`;
}

function PhoneStepFilter({ step, bids, reviewCount, colors, onChange, canAdminSettings }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Filter"
        style={[styles.filterBtn, { borderColor: colors.brand, backgroundColor: colors.card }]}
      >
        <Ionicons name="funnel-outline" size={15} color={colors.brand} />
        <Text style={{ color: colors.brand, fontSize: 13 }}>Filter</Text>
      </TouchableOpacity>
      <ScrollSheet visible={open} title="Filter" onClose={() => setOpen(false)}>
        <View style={{ gap: 8 }}>
          {ANBUD_MENU.map((item) => {
            const on = step === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => { onChange(item.id); setOpen(false); }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
              >
                <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }}>
                  {stepLabel(item, bids, reviewCount)}
                </Text>
              </TouchableOpacity>
            );
          })}
          {canAdminSettings ? (
            <TouchableOpacity
              onPress={() => { onChange('innstillinger'); setOpen(false); }}
              accessibilityRole="button"
              accessibilityState={{ selected: step === 'innstillinger' }}
              style={[styles.step, { borderColor: step === 'innstillinger' ? colors.brand : colors.line, backgroundColor: step === 'innstillinger' ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: step === 'innstillinger' ? colors.brand : colors.ink, fontWeight: step === 'innstillinger' ? '600' : '400' }}>
                Innstillinger
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollSheet>
    </>
  );
}

export default function AnbudScreen({ company, subView, members = [], units = [], companies = [] }) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, shellIntent, clearShellIntent, family } = useApp();
  const access = useCompanyAccess();
  const canAdminSettings = !access.active || access.canAdmin('tenderSettings');
  const [step, setStep] = useState(() => (
    subView === 'pipeline' ? 'tilbud' : defaultAnbudSubView(subView)
  ));
  const [bids, setBids] = useState([]);
  const [aktuellCount, setAktuellCount] = useState(0);
  const [focusBidId, setFocusBidId] = useState('');
  const inquiries = Array.isArray(family?.anbudInquiries) ? family.anbudInquiries : (company?.anbudInquiries || []);
  const inbox = Array.isArray(family?.anbudInbox) ? family.anbudInbox : (company?.anbudInbox || []);
  const reviewCount = aktuellCount + directQueueItems({ inquiries, inbox }).length;
  const processStep = ANBUD_PROCESS_IDS.includes(step);

  useEffect(() => {
    if (step === 'innstillinger' && !canAdminSettings) {
      setStep('varsling');
      requestShellTab?.('anbud', 'varsling');
    }
  }, [step, canAdminSettings, requestShellTab]);

  useEffect(() => {
    if (subView === 'avtale' || subView === 'avrop') {
      requestShellTab?.('kontrakt');
      return;
    }
    if (subView === 'pipeline') {
      setStep('tilbud');
      requestShellTab?.('anbud', 'tilbud');
      return;
    }
    setStep(defaultAnbudSubView(subView));
  }, [subView, requestShellTab]);

  useEffect(() => {
    let live = true;
    loadAnbudState(company?.id).then((loaded) => {
      if (!live) return;
      setBids((loaded?.bids || []).filter((bid) => bidListedOnDesk(bid)));
      setAktuellCount(noticesAwaitingBid(loaded?.notices).length);
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
      {isPhone && step !== 'varsling' && processStep ? (
        <PhoneStepFilter step={step} bids={bids} reviewCount={reviewCount} colors={colors} onChange={go} />
      ) : isPhone ? null : processStep ? (
        <View style={styles.row}>
          {ANBUD_MENU.map((item) => {
            const on = step === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => go(item.id)}
                accessibilityRole="button"
                style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
              >
                <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{stepLabel(item, bids, reviewCount)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {step === 'varsling' ? (
        <TenderAlert
          company={company}
          colors={colors}
          units={units}
          onBids={setBids}
          onReviewCount={setAktuellCount}
          onOpenSettings={canAdminSettings ? () => go('innstillinger') : undefined}
          onOpenReview={() => go('vurdering')}
          stepFilter={isPhone ? (
            <PhoneStepFilter
              step={step}
              bids={bids}
              reviewCount={reviewCount}
              colors={colors}
              onChange={go}
              canAdminSettings={canAdminSettings}
            />
          ) : null}
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
          onOpenSettings={canAdminSettings ? () => go('innstillinger') : undefined}
          onOpenAlerts={() => go('varsling')}
          onOpenReview={() => go('vurdering')}
          onOpenContracts={() => requestShellTab?.('kontrakt')}
          onSnapshot={(next) => setBids((next?.bids || []).filter((bid) => bidListedOnDesk(bid)))}
        />
      ) : null}
      {step === 'innstillinger' && canAdminSettings ? (
        <WatchSettings
          company={company}
          colors={colors}
          units={units}
          onOpenWork={() => go('tilbud')}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
