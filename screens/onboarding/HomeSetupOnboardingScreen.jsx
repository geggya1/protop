import React, { useEffect, useState } from 'react';
import {
  Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import {
  ensurePersonalShellForUser,
  markHomeSetupComplete,
} from '../../src/utils/personalShell';

/**
 * First-run step after ProfileSetup: ensure the personal shell so Home has a
 * familyId, then go straight to Home. ProTop does not show the home
 * customisation wizard during sign-up — it lives under
 * Innstillinger → Tilpass hjem (DashboardThemeSettings).
 */
export default function HomeSetupOnboardingScreen({ navigation }) {
  const { t, lang } = useI18n();
  const {
    userProfile, families, selectFamily, familyId,
  } = useApp();
  const [bootError, setBootError] = useState(null);

  // The session flag is set synchronously, so Home never waits on the Firestore write.
  const finish = () => {
    const uid = auth.currentUser?.uid;
    if (uid) markHomeSetupComplete(uid).catch(() => {});
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) return;
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
        setDoc(doc(db, 'users', user.uid), {
          firstHomeAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true }).catch(() => {});
      } catch (e) {
        if (alive) setBootError(e?.message || t('common.error'));
        return;
      }
      if (alive) finish();
    })();
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    <SafeAreaView style={styles.boot}>
      <ActivityIndicator color={colors.brand} />
      <Text style={styles.bootTxt}>{t('homeOnboarding.preparing')}</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
