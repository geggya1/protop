import React, { useState, useEffect } from 'react';
import {
  Text, Alert, View, StyleSheet, TouchableOpacity, Platform, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import {
  signInWithGoogle,
  signInWithApple,
  signInWithMicrosoft,
  socialErrorMessage,
  consumeOauthError,
} from '../../src/utils/authProviders';
import SocialAuthButtons, { OrDivider } from '../../components/SocialAuthButtons';
import SignInLegalConsent, { persistSignInConsent } from '../../components/SignInLegalConsent';
import BrandLogo from '../../components/BrandLogo';
import PendingAddFriendBanner from '../../components/PendingAddFriendBanner';
import { persistPendingAddFriend } from '../../src/utils/pendingAddFriend';
import { useOptionalRoute } from '../../src/hooks/useOptionalRoute';

/**
 * Auth entry — create profile or sign in. Same card layout as Login.
 * Heading must not imply create-only: social SSO also signs existing users in.
 */
export default function AuthChoiceScreen({ navigation }) {
  const { t, lang } = useI18n();
  const route = useOptionalRoute();
  const { width } = useWindowDimensions();
  const wide = width >= 480;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [legalOk, setLegalOk] = useState(false);
  const [legalError, setLegalError] = useState(false);
  const goBack = navigation.canGoBack() ? () => navigation.goBack() : undefined;

  useEffect(() => {
    const u = String(route?.params?.addFriend || '').trim();
    if (u) persistPendingAddFriend(u);
  }, [route?.params?.addFriend]);

  useEffect(() => {
    const stashed = consumeOauthError();
    if (!stashed) return;
    const err = { code: stashed.code, message: stashed.message, provider: stashed.provider };
    const msg = socialErrorMessage(t, err, stashed.provider);
    if (msg) {
      setError(msg);
      Alert.alert(t('common.error'), msg);
    }
  }, [t]);

  const ensureLegal = async () => {
    if (!legalOk) {
      setLegalError(true);
      return false;
    }
    setLegalError(false);
    await persistSignInConsent(lang);
    return true;
  };

  const social = async (fn, provider) => {
    if (busy) return;
    if (!(await ensureLegal())) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const msg = socialErrorMessage(t, e, provider);
      if (msg) {
        setError(msg);
        Alert.alert(t('common.error'), msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {goBack ? (
          <TouchableOpacity onPress={goBack} style={styles.back} accessibilityRole="button">
            <Text style={styles.backTxt}>‹ {t('common.back')}</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ height: 12 }} />
        )}

        <View style={[styles.card, wide && styles.cardWide]}>
          <BrandLogo variant="full" height={56} maxWidth={320} style={styles.logoImg} />
          <Text style={styles.heading}>{t('auth.title')}</Text>
          <Text style={styles.sub}>{t('auth.subtitle')}</Text>
          <PendingAddFriendBanner />

          <SignInLegalConsent
            accepted={legalOk}
            showError={legalError}
            onAcceptedChange={(next) => {
              setLegalOk(next);
              if (next) setLegalError(false);
            }}
          />

          <SocialAuthButtons
            busy={busy}
            googleLabel={t('auth.google')}
            appleLabel={t('auth.apple')}
            microsoftLabel={t('auth.microsoft')}
            onGoogle={() => social(signInWithGoogle, 'google')}
            onApple={() => social(signInWithApple, 'apple')}
            onMicrosoft={() => social(signInWithMicrosoft, 'microsoft')}
          />

          <OrDivider label={t('auth.orUpper')} />

          <TouchableOpacity
            style={[styles.primary, busy && { opacity: 0.6 }]}
            onPress={async () => {
              if (!(await ensureLegal())) return;
              navigation.navigate('Register');
            }}
            disabled={busy}
            accessibilityRole="button"
          >
            <Text style={styles.primaryTxt}>{t('auth.create')}</Text>
          </TouchableOpacity>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.signupRow}>
            <Text style={styles.signupMuted}>{t('auth.haveAccount')} </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')} disabled={busy}>
              <Text style={styles.linkInline}>{t('auth.loginTitle')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#eff3f4' },
  safe: { flex: 1, paddingHorizontal: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 4 },
  backTxt: { fontWeight: '400', color: colors.brand, fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingTop: 28,
    paddingBottom: 32,
    marginTop: 8,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
      },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
        elevation: 3,
      },
    }),
  },
  cardWide: { marginTop: 40 },
  logoImg: { marginBottom: 14, alignSelf: 'flex-start' },
  heading: {
    fontSize: 28, fontWeight: '400', color: '#0f1419', marginBottom: 8, letterSpacing: -0.4,
  },
  sub: { color: '#536471', fontWeight: '400', marginBottom: 20, lineHeight: 20 },
  primary: {
    minHeight: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  errorText: { color: '#b91c1c', marginTop: 12, fontSize: 13, fontWeight: '400' },
  signupRow: {
    marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center',
  },
  signupMuted: { color: '#536471', fontWeight: '500', fontSize: 14 },
  linkInline: { color: colors.brand, fontWeight: '400', textDecorationLine: 'underline' },
});
