import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { defaultAnbudSubView } from '../../src/navigation/shellModules';
import { clearModuleTabBadges, setModuleTabBadges } from '../../src/navigation/moduleTabBadges';
import { directQueueItems, noticesAwaitingBid } from '../../src/anbud/processTrail';
import { loadAnbudState } from '../../src/anbud/storage';
import { useLayout } from '../../src/theme';
import TenderAlert from './TenderAlert';
import TenderInquiry from './TenderInquiry';
import CurrentReview from './CurrentReview';
import BidDesk from './BidDesk';
import WatchSettings from './WatchSettings';
import { bidListedOnDesk } from '../../src/anbud/model';

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

  // Stegene ligger i modulmenyen i skallet (ModuleTabs, UX-19). Tallene vises på fanene der.
  useEffect(() => {
    setModuleTabBadges('anbud', { 'anbud-tilbud': bids.length, 'anbud-vurdering': reviewCount });
  }, [bids.length, reviewCount]);
  useEffect(() => () => clearModuleTabBadges('anbud'), []);

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
      {step === 'varsling' ? (
        <TenderAlert
          company={company}
          colors={colors}
          units={units}
          onBids={setBids}
          onReviewCount={setAktuellCount}
          onOpenSettings={canAdminSettings ? () => go('innstillinger') : undefined}
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
});
