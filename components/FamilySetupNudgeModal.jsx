import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, ScrollView, Share, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme';
import {
  FAMILY_NUDGE_SNOOZE_MS,
  familyNudgeStorageKey,
  isPersonalShell,
  promotePersonalShell,
  shouldShowFamilyNudge,
} from '../src/utils/personalShell';
import { friendAddByUsernameUrl } from '../src/utils/friendsLogic';
import { isValidUsername } from '../src/utils/usernames';

const ACTIVITY_EVENTS = ['touchstart', 'mousedown', 'keydown'];

async function loadNudgeState(uid) {
  if (!uid) return {};
  try {
    const raw = await AsyncStorage.getItem(familyNudgeStorageKey(uid));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveNudgeState(uid, patch) {
  if (!uid) return;
  const prev = await loadNudgeState(uid);
  const next = { ...prev, ...patch };
  await AsyncStorage.setItem(familyNudgeStorageKey(uid), JSON.stringify(next));
  return next;
}

/**
 * Soft prompt after a few minutes on a personal shell:
 * promote (name family) | join via invite (share username/QR) | later.
 */
export default function FamilySetupNudgeModal({ enabled = true }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const {
    uid, family, families, userProfile, meParent, activeProfile, applyFamilyPatch, selectFamily,
  } = useApp();

  const [ready, setReady] = useState(false);
  const [state, setState] = useState({});
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState('choose'); // choose | create | join | members
  const [familyName, setFamilyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasActivity, setHasActivity] = useState(false);
  const [firstHomeAt, setFirstHomeAt] = useState(null);

  const username = String(
    activeProfile?.username || meParent?.username || userProfile?.username || '',
  ).trim().replace(/^@+/, '').toLowerCase();
  const hasUsername = isValidUsername(username);
  const shareUrl = useMemo(
    () => (hasUsername ? friendAddByUsernameUrl(username) : ''),
    [hasUsername, username],
  );

  useEffect(() => {
    if (!enabled || !uid) {
      setReady(false);
      return undefined;
    }
    let alive = true;
    (async () => {
      const stored = await loadNudgeState(uid);
      if (!alive) return;
      setState(stored || {});
      const fromProfile = userProfile?.firstHomeAt?.toMillis?.()
        || (typeof userProfile?.firstHomeAt === 'number' ? userProfile.firstHomeAt : null)
        || stored.firstHomeAt
        || null;
      const boot = fromProfile || Date.now();
      if (!stored.firstHomeAt) {
        await saveNudgeState(uid, { firstHomeAt: boot });
      }
      setFirstHomeAt(boot);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [enabled, uid, userProfile?.firstHomeAt]);

  useEffect(() => {
    if (!enabled || !uid || Platform.OS !== 'web' || typeof window === 'undefined') {
      // Native: treat mount as light activity after delay path still works via 2× time.
      if (enabled && uid) {
        const tmr = setTimeout(() => setHasActivity(true), 45_000);
        return () => clearTimeout(tmr);
      }
      return undefined;
    }
    const mark = () => setHasActivity(true);
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, mark, { once: true, passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, mark));
    };
  }, [enabled, uid]);

  useEffect(() => {
    if (!ready || !enabled || !uid) return undefined;
    if (!isPersonalShell(family)) {
      setVisible(false);
      return undefined;
    }

    const tick = () => {
      const show = shouldShowFamilyNudge({
        family,
        families,
        firstHomeAt,
        snoozedUntil: state.snoozedUntil || null,
        dismissed: !!state.dismissed,
        hasActivity,
      });
      if (show) setVisible(true);
    };

    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [
    ready, enabled, uid, family, families, firstHomeAt,
    state.snoozedUntil, state.dismissed, hasActivity,
  ]);

  const closeSoft = useCallback(async () => {
    const until = Date.now() + FAMILY_NUDGE_SNOOZE_MS;
    const next = await saveNudgeState(uid, { snoozedUntil: until });
    setState(next || { ...state, snoozedUntil: until });
    setVisible(false);
    setStep('choose');
  }, [uid, state]);

  const dismissForever = useCallback(async () => {
    const next = await saveNudgeState(uid, { dismissed: true });
    setState(next || { ...state, dismissed: true });
    setVisible(false);
    setStep('choose');
  }, [uid, state]);

  const promote = useCallback(async () => {
    const name = familyName.trim();
    if (!name || !family?.id || saving) return;
    setSaving(true);
    try {
      await promotePersonalShell(family.id, { name });
      applyFamilyPatch?.(family.id, { name, isPersonal: false });
      await selectFamily?.(family.id, { ...family, name, isPersonal: false });
      const next = await saveNudgeState(uid, { dismissed: true, promotedAt: Date.now() });
      setState(next || { ...state, dismissed: true });
      setStep('members');
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  }, [
    familyName, family, saving, applyFamilyPatch, selectFamily, uid, state, t,
  ]);

  const shareUsername = useCallback(async () => {
    if (!shareUrl) return;
    const message = t('familyNudge.joinShareMessage', {
      username,
      url: shareUrl,
    });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        Alert.alert(t('familyNudge.copiedTitle'), t('familyNudge.copiedBody'));
        return;
      }
      await Share.share({ message, url: shareUrl });
    } catch {
      Alert.alert(t('familyNudge.joinTitle'), shareUrl);
    }
  }, [shareUrl, t, username]);

  const goAddMembers = () => {
    setVisible(false);
    setStep('choose');
    nav.navigate('AddMember');
  };

  const goHomeDone = () => {
    setVisible(false);
    setStep('choose');
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={closeSoft}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <ScrollView
            contentContainerStyle={styles.cardBody}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {step === 'choose' ? (
              <>
                <View style={styles.iconWrap}>
                  <Ionicons name="people-outline" size={28} color={colors.brand} />
                </View>
                <Text style={styles.title}>{t('familyNudge.title')}</Text>
                <Text style={styles.lead}>{t('familyNudge.lead')}</Text>

                <View style={styles.benefit}>
                  <Ionicons name="calendar-outline" size={18} color={colors.brand} />
                  <Text style={styles.benefitTxt}>{t('familyNudge.b1')}</Text>
                </View>
                <View style={styles.benefit}>
                  <Ionicons name="star-outline" size={18} color={colors.brand} />
                  <Text style={styles.benefitTxt}>{t('familyNudge.b2')}</Text>
                </View>
                <View style={styles.benefit}>
                  <Ionicons name="chatbubbles-outline" size={18} color={colors.brand} />
                  <Text style={styles.benefitTxt}>{t('familyNudge.b3')}</Text>
                </View>

                <TouchableOpacity
                  style={styles.primary}
                  onPress={() => {
                    setFamilyName('');
                    setStep('create');
                  }}
                  accessibilityRole="button"
                  testID="family-nudge-create"
                >
                  <Text style={styles.primaryTxt}>{t('familyNudge.createCta')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondary}
                  onPress={() => setStep('join')}
                  accessibilityRole="button"
                  testID="family-nudge-join"
                >
                  <Text style={styles.secondaryTxt}>{t('familyNudge.joinCta')}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={closeSoft} style={styles.linkBtn} testID="family-nudge-later">
                  <Text style={styles.linkTxt}>{t('familyNudge.later')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={dismissForever} style={styles.linkBtn}>
                  <Text style={styles.mutedLink}>{t('familyNudge.dismiss')}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {step === 'create' ? (
              <>
                <Text style={styles.title}>{t('familyNudge.createTitle')}</Text>
                <Text style={styles.lead}>{t('familyNudge.createLead')}</Text>
                <Text style={styles.label}>{t('familyNudge.nameLabel')}</Text>
                <TextInput
                  style={styles.input}
                  value={familyName}
                  onChangeText={setFamilyName}
                  placeholder={t('familyNudge.namePlaceholder')}
                  autoFocus
                  editable={!saving}
                />
                <TouchableOpacity
                  style={[styles.primary, (!familyName.trim() || saving) && styles.disabled]}
                  onPress={promote}
                  disabled={!familyName.trim() || saving}
                  accessibilityRole="button"
                  testID="family-nudge-promote"
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.primaryTxt}>{t('familyNudge.createConfirm')}</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setStep('choose')} style={styles.linkBtn}>
                  <Text style={styles.linkTxt}>{t('common.back')}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {step === 'join' ? (
              <>
                <Text style={styles.title}>{t('familyNudge.joinTitle')}</Text>
                <Text style={styles.lead}>{t('familyNudge.joinLead')}</Text>
                <Text style={styles.info}>{t('familyNudge.joinInfo')}</Text>

                {hasUsername ? (
                  <View style={styles.qrBox}>
                    <QRCode value={shareUrl} size={148} />
                    <Text style={styles.username}>@{username}</Text>
                    <TouchableOpacity style={styles.primary} onPress={shareUsername} accessibilityRole="button">
                      <Text style={styles.primaryTxt}>{t('familyNudge.shareUsername')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.info}>{t('familyNudge.needUsername')}</Text>
                )}

                <TouchableOpacity onPress={() => setStep('choose')} style={styles.linkBtn}>
                  <Text style={styles.linkTxt}>{t('common.back')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={closeSoft} style={styles.linkBtn}>
                  <Text style={styles.mutedLink}>{t('familyNudge.later')}</Text>
                </TouchableOpacity>
              </>
            ) : null}

            {step === 'members' ? (
              <>
                <View style={styles.iconWrap}>
                  <Ionicons name="checkmark-circle" size={32} color="#16a34a" />
                </View>
                <Text style={styles.title}>{t('familyNudge.membersTitle')}</Text>
                <Text style={styles.lead}>{t('familyNudge.membersLead')}</Text>
                <TouchableOpacity
                  style={styles.primary}
                  onPress={goAddMembers}
                  accessibilityRole="button"
                  testID="family-nudge-add-members"
                >
                  <Text style={styles.primaryTxt}>{t('familyNudge.addMembers')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={goHomeDone} style={styles.linkBtn} testID="family-nudge-skip-members">
                  <Text style={styles.linkTxt}>{t('familyNudge.skipMembers')}</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 12px 40px rgba(15,23,42,0.25)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
  cardBody: { padding: 22, paddingBottom: 28 },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: '400', color: '#0f1419', marginBottom: 8 },
  lead: { fontSize: 15, fontWeight: '400', color: '#536471', lineHeight: 22, marginBottom: 14 },
  info: { fontSize: 14, fontWeight: '400', color: '#475569', lineHeight: 20, marginBottom: 12 },
  benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  benefitTxt: { flex: 1, fontSize: 14, fontWeight: '400', color: '#334155', lineHeight: 20 },
  primary: {
    marginTop: 14,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  secondary: {
    marginTop: 10,
    backgroundColor: '#eff3f4',
    borderRadius: radius.pill,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  secondaryTxt: { color: '#0f1419', fontWeight: '400', fontSize: 15 },
  linkBtn: {
    alignSelf: 'flex-start', marginTop: 12, alignItems: 'center', padding: 6 },
  linkTxt: { color: colors.brand, fontWeight: '400', fontSize: 14 },
  mutedLink: { color: '#94a3b8', fontWeight: '400', fontSize: 13 },
  label: { fontWeight: '400', color: '#0f1419', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '400',
    color: '#0f1419',
  },
  disabled: { opacity: 0.5 },
  qrBox: { alignItems: 'center', gap: 12, marginTop: 8, marginBottom: 4 },
  username: { fontWeight: '400', fontSize: 16, color: '#0f1419' },
});
