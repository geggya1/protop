import React, { useMemo } from 'react';
import { Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import HomeSetupForm, { BUILTIN_BOTTOM_CHOICES, toggleBottomId } from '../../components/home/HomeSetupForm';
import { useHomeLayout } from '../../src/hooks/useHomeLayout';
import { CUSTOM_BANNER_ID, recommendedBannerGroupForAge } from '../../src/homeBanners';
import { profileAge, isMinor } from '../../src/utils/age';
import { useLayout } from '../../src/theme';
import {
  childHomeStorageAliases,
  childHomeStorageId,
} from '../../src/utils/childHomeLayout';

export default function ChildDashboardThemeSettingsScreen() {
  const nav = useNavigation();
  const colors = useColors();
  const route = useRoute();
  const { isDesktop } = useLayout();
  const { uid, isParent, isAdmin, kids, activeProfile } = useApp();

  const routeChild = route.params?.child || null;
  const child = useMemo(() => {
    if (routeChild) return routeChild;
    if (activeProfile?.role === 'child' || activeProfile?.type === 'child') return activeProfile;
    return (kids || [])[0] || null;
  }, [routeChild, activeProfile, kids]);

  const childId = childHomeStorageId(child);
  const layoutAliases = useMemo(() => childHomeStorageAliases(child), [child]);
  const childAge = profileAge(child);
  const canEdit = isParent || isAdmin
    || Boolean(uid && childId && (child?.uid === uid || child?.id === uid));
  const eligible = childAge == null || isMinor(childAge);
  const home = useHomeLayout(childId, { role: 'child', aliases: layoutAliases });
  const suggestedGroup = recommendedBannerGroupForAge(childAge);

  if (!home.ready) {
    return (
      <Screen>
        <CompactBackLink onPress={() => nav.goBack()} />
        <Text style={[styles.loading, { color: colors.muted }]}>Laster…</Text>
      </Screen>
    );
  }

  if (!eligible) {
    return (
      <Screen>
        <CompactBackLink label="Tilbake" onPress={() => nav.goBack()} />
        <Text style={[styles.title, { color: colors.ink }]}>Tilpass hjem</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>Dette oppsettet er for barneprofiler under 18 år.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        <CompactBackLink label="Innstillinger" onPress={() => nav.goBack()} />
        <HomeSetupForm
          role="child"
          showIntro={false}
          bannerId={home.layout.bannerId}
          customBannerUri={home.layout.customBannerUri}
          bottomIds={home.layout.bottomIds}
          bottomChoices={BUILTIN_BOTTOM_CHOICES.filter((c) => (
            ['home', 'plan', 'stars', 'chores', 'chat', 'more'].includes(c.id)
          ))}
          canEdit={canEdit}
          suggestedGroup={suggestedGroup}
          showDock
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
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  bodyDesk: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  loading: { padding: 24 },
  title: { fontSize: 22, fontWeight: '400', marginTop: 4 },
  lead: {
    fontSize: 16, lineHeight: 24, marginTop: 8,
  },
});
