import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import HomeSetupForm, {
  BUILTIN_BOTTOM_CHOICES,
  toggleBottomId,
} from '../../components/home/HomeSetupForm';
import BrandLogo from '../../components/BrandLogo';
import { useHomeLayout } from '../../src/hooks/useHomeLayout';
import { CUSTOM_BANNER_ID } from '../../src/homeBanners';
import {
  ensurePersonalShellForUser,
  markHomeSetupComplete,
} from '../../src/utils/personalShell';

/**
 * First-run home customisation after ProfileSetup.
 * Personal shell is ensured first so Home has a familyId.
 */
export default function HomeSetupOnboardingScreen({ navigation }) {
  const { t, lang } = useI18n();
  const {
    uid, userProfile, families, selectFamily, familyId,
  } = useApp();
  const home = useHomeLayout(uid, { role: 'parent' });
  const [bootBusy, setBootBusy] = useState(true);
  const [bootError, setBootError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBootError(null);
        const user = auth.currentUser;
        if (!user) {
          if (alive) setBootBusy(false);
          return;
        }
        const result = await ensurePersonalShellForUser({
          user,
          profile: userProfile,
          language: lang || 'nb',
          existingFamilies: families || [],
        });
        if (!alive) return;
        if (result?.id && result.id !== familyId) {
          await selectFamily(result.id, result.family);
        }
        // Mark first home timestamp for the later family nudge.
        try {
          await setDoc(doc(db, 'users', user.uid), {
            firstHomeAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }, { merge: true });
        } catch { /* ignore */ }
      } catch (e) {
        if (alive) setBootError(e?.message || t('common.error'));
      } finally {
        if (alive) setBootBusy(false);
      }
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bottomChoices = useMemo(() => BUILTIN_BOTTOM_CHOICES, []);

  const finish = async () => {
    try {
      if (uid) await markHomeSetupComplete(uid);
    } catch { /* ignore */ }
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  if (bootBusy || !home.ready) {
    return (
      <SafeAreaView style={styles.boot}>
        <ActivityIndicator color={colors.brand} />
        <Text style={styles.bootTxt}>{t('homeOnboarding.preparing')}</Text>
      </SafeAreaView>
    );
  }

  if (bootError) {
    return (
      <SafeAreaView style={styles.boot}>
        <Text style={styles.error}>{bootError}</Text>
        <TouchableOpacity style={styles.primary} onPress={finish} accessibilityRole="button">
          <Text style={styles.primaryTxt}>{t('homeOnboarding.continueHome')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <BrandLogo variant="full" height={44} maxWidth={240} style={styles.logo} />
        <Text style={styles.title}>{t('homeOnboarding.title')}</Text>
        <Text style={styles.lead}>{t('homeOnboarding.lead')}</Text>

        <TouchableOpacity
          style={styles.skipTop}
          onPress={finish}
          accessibilityRole="button"
          testID="home-onboarding-skip-all"
        >
          <Text style={styles.skipTopTxt}>{t('homeOnboarding.skipAll')}</Text>
        </TouchableOpacity>

        <HomeSetupForm
          role="parent"
          showIntro={false}
          bannerId={home.layout.bannerId}
          customBannerUri={home.layout.customBannerUri}
          bottomIds={home.layout.bottomIds}
          bottomChoices={bottomChoices}
          canEdit
          onSelectBanner={(id) => home.setBanner(id, null)}
          onUploadBanner={(uri) => home.setBanner(CUSTOM_BANNER_ID, uri)}
          onToggleBottom={(id) => home.setBottomIds(toggleBottomId(home.layout.bottomIds, id))}
          bottomNavEnabled={home.layout.bottomNavEnabled}
          onToggleBottomNav={home.setBottomNavEnabled}
          widgets={home.layout.widgets}
          lookId={home.layout.look}
          onSelectLook={home.setLook}
          onResetWidgets={home.resetWidgets}
          onToggleWidget={home.toggleType}
          onSelectVariant={home.setVariant}
          onComplete={finish}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  body: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  logo: { marginBottom: 10, alignSelf: 'flex-start' },
  title: {
    fontSize: 22, fontWeight: '400', color: colors.ink, marginBottom: 6,
  },
  lead: {
    fontSize: 15, color: colors.muted, lineHeight: 22, marginBottom: 8,
  },
  skipTop: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4, marginBottom: 4 },
  skipTopTxt: { color: colors.brand, fontWeight: '400', fontSize: 14 },
  boot: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24,
  },
  bootTxt: { marginTop: 12, color: colors.muted, fontWeight: '400' },
  error: { color: '#b91c1c', fontWeight: '400', textAlign: 'center', marginBottom: 16 },
  primary: {
    backgroundColor: colors.brand, borderRadius: radius.pill, paddingVertical: 14, paddingHorizontal: 22,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
});
