import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import HomeSetupForm, {
  BUILTIN_BOTTOM_CHOICES,
  toggleBottomId,
} from '../../components/home/HomeSetupForm';
import { useHomeLayout } from '../../src/hooks/useHomeLayout';
import { CUSTOM_BANNER_ID } from '../../src/homeBanners';
import { buildParentDashboardApps } from '../../src/navigation/shellModules';
import { parentAppShortLabel } from '../../src/utils/parentHomeShortcuts';
import { useI18n } from '../../src/i18n';
import { useLayout } from '../../src/theme';

export default function DashboardThemeSettingsScreen({
  inShell = false,
  setSubView,
}) {
  const nav = useNavigation();
  const colors = useColors();
  const { t } = useI18n();
  const { isDesktop } = useLayout();
  const { uid, familyId, isParent, isAdmin, kids, requestShellTab } = useApp();
  const canEdit = isParent || isAdmin;
  const home = useHomeLayout(uid, { role: 'parent' });

  const catalog = useMemo(
    () => buildParentDashboardApps({
      t,
      familyId,
      eventCount: 0,
      hasKids: (kids || []).length > 0,
      firstKid: (kids || [])[0] || null,
    }),
    [t, familyId, kids],
  );

  const bottomChoices = useMemo(() => {
    const fromApps = catalog.map((a) => ({
      id: a.id,
      label: parentAppShortLabel(a) || a.label,
      icon: a.icon,
    }));
    const map = new Map();
    [...BUILTIN_BOTTOM_CHOICES.filter((c) => c.id !== 'chores'), ...fromApps].forEach((item) => {
      if (!map.has(item.id)) map.set(item.id, item);
    });
    return [...map.values()];
  }, [catalog]);

  const goBack = () => {
    if (typeof setSubView === 'function') {
      setSubView('settings');
      return;
    }
    if (inShell && requestShellTab) {
      requestShellTab('more', 'settings');
      return;
    }
    nav.goBack();
  };

  if (!home.ready) {
    return (
      <Screen>
        <CompactBackLink onPress={goBack} />
        <Text style={[styles.loading, { color: colors.muted }]}>Laster…</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        <CompactBackLink label="Innstillinger" onPress={goBack} />
        <HomeSetupForm
          role="parent"
          showIntro={false}
          bannerId={home.layout.bannerId}
          customBannerUri={home.layout.customBannerUri}
          bottomIds={home.layout.bottomIds}
          bottomChoices={bottomChoices}
          canEdit={canEdit}
          onSelectBanner={(id) => home.setBanner(id, null)}
          onUploadBanner={(uri) => home.setBanner(CUSTOM_BANNER_ID, uri)}
          onToggleBottom={(id) => home.setBottomIds(toggleBottomId(home.layout.bottomIds, id))}
          bottomNavEnabled={home.layout.bottomNavEnabled}
          onToggleBottomNav={home.setBottomNavEnabled}
          onComplete={() => nav.navigate('Home', { editHome: true, openShell: { tab: 'home' } })}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },
  bodyDesk: { maxWidth: 720, paddingHorizontal: 16, alignSelf: 'center', width: '100%' },
  loading: { padding: 24 },
});
