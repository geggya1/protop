// src/screens/VerifyEmailScreen.jsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { onAuthStateChanged, reload, checkActionCode, applyActionCode, signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { Ionicons } from '@expo/vector-icons';
import { sendVerificationEmailV2, confirmEmailVerificationV2 } from '../src/utils/sendVerificationEmail';
import { useI18n } from '../src/i18n';

const RESEND_LOCK_SECONDS = 60;

function readVtFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    return new URL(window.location.href).searchParams.get('vt');
  } catch {
    return null;
  }
}

export default function VerifyEmailScreen({ route, navigation, email: emailProp, clearJustRegisteredEmail, onVerified }) {
  const { t } = useI18n();
  const oobCode = route?.params?.oobCode || route?.params?.oobcode || null;
  const verifyToken = route?.params?.vt || readVtFromUrl() || null;

  const emailFromRoute = route?.params?.email || '';
  const initialEmail = emailProp || emailFromRoute || '';
  const [email, setEmail] = useState(initialEmail);

  const [sending, setSending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_LOCK_SECONDS);

  const [actionChecking, setActionChecking] = useState(!!oobCode);
  const [actionValid, setActionValid] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  const hasTokenLink = !!verifyToken;
  const [autoConfirmStarted, setAutoConfirmStarted] = useState(false);

  useEffect(() => { auth.useDeviceLanguage?.(); }, []);
  useEffect(() => {
    const next = emailProp || route?.params?.email || '';
    if (next && next !== email) setEmail(next);
  }, [emailProp, route?.params?.email]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setEmail(user.email || email);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!oobCode) { setActionChecking(false); return; }
      try {
        await checkActionCode(auth, oobCode);
        if (mounted) setActionValid(true);
      } catch {
        if (mounted) setActionValid(false);
      } finally {
        if (mounted) setActionChecking(false);
      }
    })();
    return () => { mounted = false; };
  }, [oobCode]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((x) => x - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const afterSuccess = useCallback(async () => {
    setDone(true);
    if (auth.currentUser) {
      try { await reload(auth.currentUser); } catch {}
    }
    if (typeof clearJustRegisteredEmail === 'function') {
      await clearJustRegisteredEmail({ keepSession: true });
    }
    if (typeof onVerified === 'function') {
      await onVerified();
      return;
    }
    if (auth.currentUser?.emailVerified) {
      return;
    }
    Alert.alert(t('verify.doneTitle'), t('verify.doneLogin'));
    navigation.replace('Login');
  }, [clearJustRegisteredEmail, navigation, onVerified, t]);

  const goAfterDone = useCallback(() => {
    // Best-effort fallback for web: even if App's stage logic is delayed/blocked,
    // we should still move the user forward — but NEVER to Home for new parents.
    // AppShell redirects parents with zero families to HomeSetupOnboarding, which ejected
    // brand-new users from ProfileSetup ("Litt om deg") ~1s after mail verify.
    const verified = !!auth.currentUser?.emailVerified;
    if (!verified) {
      navigation.replace('Login');
      return;
    }
    try {
      const state = navigation.getState?.();
      const current = state?.routes?.[state?.index || 0]?.name;
      // Only intervene while still parked on the verify screen.
      if (current && current !== 'VerifyEmail') return;
    } catch { /* ignore */ }
    navigation.reset({ index: 0, routes: [{ name: 'ProfileSetup' }] });
  }, [navigation]);

  const confirmToken = useCallback(async () => {
    if (!verifyToken) return;
    try {
      setApplying(true);
      await confirmEmailVerificationV2(verifyToken);
      await afterSuccess();
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('verify.fail'));
    } finally {
      setApplying(false);
    }
  }, [verifyToken, afterSuccess, t]);

  // When coming from the email link on web, the user expects the link to do the work.
  // So if we have a `vt` token, we auto-confirm once on mount.
  useEffect(() => {
    if (!hasTokenLink) return;
    if (autoConfirmStarted) return;
    setAutoConfirmStarted(true);
    confirmToken();
  }, [hasTokenLink, autoConfirmStarted, confirmToken]);

  const applyLegacyOob = useCallback(async () => {
    if (!oobCode) return;
    try {
      setApplying(true);
      await applyActionCode(auth, oobCode);
      await afterSuccess();
    } catch {
      Alert.alert(t('common.error'), t('verify.fail'));
    } finally {
      setApplying(false);
    }
  }, [oobCode, afterSuccess, t]);

  const resend = useCallback(async () => {
    const target = auth.currentUser?.email || email;
    if (!target) {
      Alert.alert(t('common.error'), t('verify.needLogin'));
      return;
    }
    try {
      setSending(true);
      await sendVerificationEmailV2(target);
      setResendCountdown(RESEND_LOCK_SECONDS);
      Alert.alert(t('verify.sentTitle'), t('verify.sentBody'));
    } catch (e) {
      if (e?.code === 'auth/too-many-requests') {
        Alert.alert(t('verify.waitTitle'), t('verify.waitBody'));
      } else {
        Alert.alert(t('common.error'), e?.message || t('common.error'));
      }
    } finally {
      setSending(false);
    }
  }, [email, t]);

  const backToLogin = useCallback(async () => {
    try { await signOut(auth); } catch {}
    if (typeof clearJustRegisteredEmail === 'function') {
      await clearJustRegisteredEmail({ keepSession: false });
    }
    navigation.replace('Login');
  }, [clearJustRegisteredEmail, navigation]);

  // When we reach `done`, proactively redirect after a short delay.
  // (On web there are external redirect scripts; we don't want to stay stuck forever.)
  useEffect(() => {
    if (!done) return undefined;
    const ms = Platform.OS === 'web' ? 900 : 300;
    const timer = setTimeout(() => { try { goAfterDone(); } catch {} }, ms);
    return () => clearTimeout(timer);
  }, [done, goAfterDone]);

  if (done) {
    return (
      <View style={styles.container}>
        <Ionicons name="checkmark-circle-outline" size={56} color="#16a34a" />
        <Text style={styles.title}>{t('verify.doneTitle')}</Text>
        <Text style={styles.subtitle}>{t('verify.doneBody')}</Text>
        <ActivityIndicator style={{ marginTop: 16 }} />
        <TouchableOpacity style={styles.secondary} onPress={goAfterDone}>
          <Text style={styles.secondaryText}>{t('common.continue')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (hasTokenLink) {
    return (
      <View style={styles.container}>
        <Ionicons name="mail-unread-outline" size={56} color="#2563eb" />
        <Text style={styles.title}>{t('verify.confirmTitle')}</Text>
        <Text style={styles.subtitle}>{t('verify.confirmBody')}</Text>
        <TouchableOpacity style={styles.primary} onPress={confirmToken} disabled={applying}>
          {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('verify.confirmBtn')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondary, (sending || resendCountdown > 0) ? styles.disabled : styles.enabled]}
          disabled={sending || resendCountdown > 0}
          onPress={resend}
        >
          <Text style={styles.secondaryText}>
            {resendCountdown > 0 ? `${t('verify.resend')} (${resendCountdown}s)` : t('verify.resend')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={backToLogin} style={styles.linkBtn}>
          <Text style={styles.linkText}>{t('verify.backLogin')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (oobCode) {
    return (
      <View style={styles.container}>
        <Ionicons name="mail-unread-outline" size={56} color="#2563eb" />
        <Text style={styles.title}>{t('verify.confirmTitle')}</Text>
        {actionChecking ? (
          <ActivityIndicator size="large" />
        ) : actionValid ? (
          <>
            <Text style={styles.subtitle}>{t('verify.legacyHint')}</Text>
            <TouchableOpacity style={styles.primary} onPress={applyLegacyOob} disabled={applying}>
              {applying ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('verify.confirmBtn')}</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.error}>{t('verify.fail')}</Text>
            <TouchableOpacity style={[styles.secondary, styles.enabled]} onPress={resend}>
              <Text style={styles.secondaryText}>{t('verify.resend')}</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity onPress={backToLogin} style={styles.linkBtn}>
          <Text style={styles.linkText}>{t('verify.backLogin')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Ionicons name="mail-unread-outline" size={56} color="#2563eb" />
      <Text style={styles.title}>{t('verify.waitTitlePage')}</Text>
      {!!email && (
        <Text style={styles.subtitle}>
          {t('verify.sentTo')}{'\n'}<Text style={styles.bold}>{email}</Text>
        </Text>
      )}
      <Text style={styles.info}>{t('verify.waitInfo')}</Text>
      <TouchableOpacity
        style={[styles.secondary, (sending || resendCountdown > 0) ? styles.disabled : styles.enabled]}
        disabled={sending || resendCountdown > 0}
        onPress={resend}
      >
        {sending ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.secondaryText}>
            {resendCountdown > 0 ? `${t('verify.resend')} (${resendCountdown}s)` : t('verify.resend')}
          </Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={backToLogin} style={styles.linkBtn}>
        <Text style={styles.linkText}>{t('verify.backLogin')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', marginTop: 12, color: '#0f172a', textAlign: 'center' },
  subtitle: { fontSize: 15, color: '#334155', marginTop: 8, textAlign: 'center' },
  bold: { fontWeight: '700' },
  info: { marginTop: 10, fontSize: 14, color: '#475569', textAlign: 'center', lineHeight: 20, maxWidth: 340 },
  primary: { marginTop: 20, backgroundColor: '#2563eb', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, minWidth: 220, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: { marginTop: 16, backgroundColor: '#e2e8f0', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, minWidth: 220, alignItems: 'center' },
  enabled: { opacity: 1 },
  disabled: { opacity: 0.6 },
  secondaryText: { color: '#0f172a', fontSize: 15, fontWeight: '600' },
  linkBtn: { marginTop: 14, padding: 10 },
  linkText: { color: '#2563eb', fontSize: 15, fontWeight: '600' },
  error: { color: '#b91c1c', textAlign: 'center', marginTop: 8 },
});
