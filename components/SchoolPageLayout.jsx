import React, { useCallback, useMemo } from 'react';
import {
  View, StyleSheet, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useLayout } from '../src/theme';
import CompactBackLink from './CompactBackLink';
import ModuleHero from './ModuleHero';
import { useModuleHeroHosted } from './ModulePageBg';

const PAGE_META = {
  hub: {
    title: 'Skole',
    subtitle: (name) => `Lekser, klasse, leksehjelp og ukeplan for ${name}`,
    moduleId: 'skole',
  },
  lekser: {
    title: 'Lekser',
    subtitle: () => 'Litt om gangen, så er du i mål.',
    moduleId: 'lekser',
  },
  leksehjelp: {
    title: 'Leksehjelpen',
    subtitle: () => 'Din egen lekse — hint og spørsmål, steg for steg.',
    moduleId: 'leksehjelp',
  },
  mattehjelp: {
    title: 'Lær skole',
    subtitle: () => 'Øv med spill og oppdrag — egen fra leksehjelp.',
    moduleId: 'mattehjelp',
  },
  'week-plan': {
    title: 'Ukeplan',
    subtitle: () => 'Se hva som skjer – og møt dagen forberedt.',
    moduleId: 'week-plan',
  },
  klassen: {
    title: 'Klassen',
    subtitle: () => 'Klasseliste, lærere, møter og meldinger.',
    moduleId: 'klassen',
  },
};

/**
 * Felles layout for Skole-mappen og undersider (scroll + valgfri hero).
 * Undermoduler har ikke lenger tilbake-lenke / fanemeny — navigasjon går via
 * Skole-mappen og shell. Stack-skjermer får hamburger + topp-banner via StackShellChrome.
 * Hub har ingen «Hjem»-lenke (#734); egen onBack (f.eks. AI-import) beholdes.
 */
export default function SchoolPageLayout({
  activeId = 'hub',
  child = null,
  // Beholdt for kallsteder (tidligere faner / kontekstlinje)
  familyId: _familyId = null,
  canEdit: _canEdit = false,
  weekLabel: _weekLabel = null,
  aiEnabled: _aiEnabled = true,
  title = null,
  subtitle = null,
  onBack = null,
  children,
  scroll = true,
  compact = false,
}) {
  const nav = useNavigation();
  const { pad } = useLayout();
  const heroHosted = useModuleHeroHosted();
  const { requestShellTab } = useApp();

  const firstName = child?.name?.split(' ')[0] || 'deg';
  const meta = PAGE_META[activeId] || PAGE_META.hub;
  const heading = title || meta.title;
  const lead = subtitle || meta.subtitle(firstName);

  const styles = useMemo(
    () => makeStyles({ pad, compact }),
    [pad, compact],
  );

  const goBack = useCallback(() => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    nav.navigate('Home');
    requestShellTab?.('home');
  }, [onBack, nav, requestShellTab]);

  // Hub har ingen «Hjem»-lenke (logo / meny / faner). Undermoduler har
  // heller ikke tilbake-menyfelt (#733). Egen onBack (f.eks. AI-import) beholdes.
  const showBack = typeof onBack === 'function';
  const backLabel = meta.backLabel || 'Tilbake';

  const header = (
    <>
      {showBack ? (
        <CompactBackLink
          onPress={goBack}
          label={backLabel}
          accessibilityLabel={backLabel}
        />
      ) : null}

      {!heroHosted ? (
        <ModuleHero
          moduleId={meta.moduleId}
          title={heading}
          subtitle={lead}
          force
          flush
        />
      ) : null}
    </>
  );

  if (!scroll) {
    return (
      <View style={[styles.wrap, styles.wrapFill]}>
        {header}
        <View style={[styles.content, styles.contentFill]}>{children}</View>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      <View style={styles.content}>{children}</View>
    </ScrollView>
  );
}

function makeStyles({ pad, compact }) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    wrapFill: { minHeight: 0 },
    body: {
      paddingHorizontal: compact ? 12 : pad,
      paddingTop: compact ? 4 : 8,
      paddingBottom: 32,
    },
    content: {
      gap: 8,
    },
    contentFill: { flex: 1, minHeight: 0 },
  });
}
