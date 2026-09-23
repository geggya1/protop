import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme';
import BrandLogo from './BrandLogo';
import {
  authenticateBiometric,
  getBiometricLabel,
  loadBiometricSettings,
  markBiometricUnlocked,
  shouldRequireBiometricLock,
  subscribeAppForeground,
} from '../src/utils/biometricLock';

/**
 * Fullskjerm-lås når biometrisk beskyttelse er aktivert.
 */
export default function BiometricLockOverlay({ uid }) {
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [locked, setLocked] = useState(false);
  const [label, setLabel] = useState('Face ID');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!uid) {
      setEnabled(false);
      return;
    }
    loadBiometricSettings(uid).then((s) => setEnabled(!!s.enabled));
  }, [uid]);

  useEffect(() => {
    let alive = true;
    getBiometricLabel().then((l) => { if (alive) setLabel(l); });
    return () => { alive = false; };
  }, []);

  const tryUnlock = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const prompt = t('security.unlockPrompt').replace('{{method}}', label);
    const result = await authenticateBiometric(prompt);
    setBusy(false);
    if (result.success) {
      markBiometricUnlocked();
      setLocked(false);
      return;
    }
    if (result.error === 'user_cancel' || result.error === 'system_cancel') {
      setError(t('security.unlockCancelled'));
      return;
    }
    setError(t('security.unlockFailed'));
  }, [busy, label, t]);

  useEffect(() => {
    if (!enabled || !uid || Platform.OS === 'web') {
      setLocked(false);
      return undefined;
    }
    if (shouldRequireBiometricLock(true)) {
      setLocked(true);
      tryUnlock();
    }
    return subscribeAppForeground(() => {
      if (enabled && shouldRequireBiometricLock(true)) {
        setLocked(true);
        tryUnlock();
      }
    });
  }, [enabled, uid, tryUnlock]);

  if (!enabled || !locked || Platform.OS === 'web') return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <BrandLogo variant="full" height={52} maxWidth={280} style={styles.logo} />
          <Ionicons name="lock-closed" size={36} color={colors.brand} />
          <Text style={styles.title}>{t('security.lockedTitle')}</Text>
          <Text style={styles.body}>
            {t('security.lockedBody').replace('{{method}}', label)}
          </Text>
          {!!error && <Text style={styles.error}>{error}</Text>}
          <TouchableOpacity style={styles.btn} onPress={tryUnlock} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnTxt}>
                {t('security.unlockWith').replace('{{method}}', label)}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#eff3f4',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    gap: 12,
  },
  logo: { marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '900', color: '#0f1419', textAlign: 'center' },
  body: { fontSize: 14, fontWeight: '600', color: '#536471', textAlign: 'center', lineHeight: 20 },
  error: { fontSize: 13, fontWeight: '600', color: '#b91c1c', textAlign: 'center' },
  btn: {
    marginTop: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 48,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
