import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { useApp } from '../src/context/AppContext';
import { colors, radius } from '../src/theme';
import {
  acceptFamilyMemberInvite,
  declineFamilyMemberInvite,
  getFamilyMemberInvite,
} from '../src/utils/groups';

export default function FamilyInviteRespondScreen() {
  const { t } = useI18n();
  const nav = useNavigation();
  const { params } = useRoute();
  const { uid, selectFamily } = useApp();
  const familyId = params?.familyId;
  const inviteId = params?.inviteId;

  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!familyId || !inviteId) {
        if (alive) {
          setInvite(null);
          setLoading(false);
        }
        return;
      }
      try {
        const data = await getFamilyMemberInvite(familyId, inviteId);
        if (alive) setInvite(data);
      } catch {
        if (alive) setInvite(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [familyId, inviteId]);

  const leave = () => {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  };

  const onAccept = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const res = await acceptFamilyMemberInvite({ familyId, inviteId, uid });
      setDone('accepted');
      if (res?.familyId) {
        await selectFamily?.(res.familyId, { name: res.familyName, type: invite?.groupType || 'family' });
      }
    } catch (e) {
      const msg = e?.message === 'already-handled'
        ? t('member.inviteAlreadyHandled')
        : (e?.message === 'forbidden' ? t('member.inviteForbidden') : t('common.error'));
      Alert.alert(t('common.error'), msg);
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      await declineFamilyMemberInvite({ familyId, inviteId, uid });
      setDone('declined');
    } catch (e) {
      const msg = e?.message === 'already-handled'
        ? t('member.inviteAlreadyHandled')
        : (e?.message === 'forbidden' ? t('member.inviteForbidden') : t('common.error'));
      Alert.alert(t('common.error'), msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (done) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons
            name={done === 'accepted' ? 'checkmark-circle' : 'close-circle'}
            size={56}
            color={done === 'accepted' ? colors.brand : colors.muted}
          />
          <Text style={styles.title}>
            {done === 'accepted' ? t('member.inviteAccepted') : t('member.inviteDeclined')}
          </Text>
          <TouchableOpacity style={styles.primary} onPress={leave}>
            <Text style={styles.primaryTxt}>{t('common.done')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!invite || invite.status !== 'pending') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Ionicons name="mail-open-outline" size={48} color={colors.muted} />
          <Text style={styles.title}>{t('member.inviteGone')}</Text>
          <TouchableOpacity style={styles.primary} onPress={leave}>
            <Text style={styles.primaryTxt}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const familyLabel = invite.familyName || t('group.family');

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.backBtn} onPress={leave} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headTitle}>{t('member.familyInviteTitle')}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <Ionicons name="people" size={36} color={colors.brand} />
          <Text style={styles.lead}>{t('member.familyInviteLead')}</Text>
          <Text style={styles.familyName}>{familyLabel}</Text>
          <Text style={styles.hint}>{t('member.familyInviteHint')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.primary, busy && styles.disabled]}
          onPress={onAccept}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryTxt}>{t('member.acceptInvite')}</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondary, busy && styles.disabled]}
          onPress={onDecline}
          disabled={busy}
        >
          <Text style={styles.secondaryTxt}>{t('member.declineInvite')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg || '#f8fafc' },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    padding: 8, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  headTitle: { flex: 1, fontWeight: '900', fontSize: 18, color: colors.ink },
  body: { padding: 20, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg || 16, padding: 24,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', gap: 10, marginBottom: 8,
  },
  lead: { fontWeight: '700', color: colors.muted, textAlign: 'center' },
  familyName: { fontWeight: '900', fontSize: 24, color: colors.ink, textAlign: 'center' },
  hint: { fontWeight: '600', color: colors.muted, textAlign: 'center', marginTop: 4 },
  title: { fontWeight: '900', fontSize: 20, color: colors.ink, textAlign: 'center' },
  primary: {
    backgroundColor: colors.brand, borderRadius: radius.md || 12,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondary: {
    backgroundColor: colors.card, borderRadius: radius.md || 12,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  secondaryTxt: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
