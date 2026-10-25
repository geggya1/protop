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
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  acceptFamilyMemberInvite,
  declineFamilyMemberInvite,
  getFamilyMemberInvite,
} from '../src/utils/groups';
import { claimEmployeeSeat } from '../src/employees/inviteClient';
import { groupInviteCopy } from '../src/utils/inviteIdentifiers';
import { inviteResponseMessage, isCompanyGroupType } from '../src/utils/groupInviteLogic';

/** Egen innboks først: en invitert er ikke medlem ennå og kan ikke lese gruppens data. */
async function loadInvite(uid, familyId, inviteId) {
  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid, 'familyInvites', inviteId));
      if (snap.exists()) {
        const data = snap.data() || {};
        if (!data.familyId || data.familyId === familyId) return { id: snap.id, ...data, familyId };
      }
    } catch { /* faller tilbake til gruppen */ }
  }
  return getFamilyMemberInvite(familyId, inviteId);
}

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
        const data = await loadInvite(uid, familyId, inviteId);
        if (alive) setInvite(data);
      } catch {
        if (alive) setInvite(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uid, familyId, inviteId]);

  // Svaret kan komme fra invitasjonsvinduet over denne siden. Vis utfallet her også.
  useEffect(() => {
    if (!uid || !familyId || !inviteId) return undefined;
    return onSnapshot(doc(db, 'users', uid, 'familyInvites', inviteId), (snap) => {
      const status = snap.exists() ? snap.data()?.status : '';
      if (status === 'accepted' || status === 'declined') setDone((prev) => prev || status);
    }, () => {});
  }, [uid, familyId, inviteId]);

  const company = isCompanyGroupType(invite?.groupType);
  const copy = groupInviteCopy(invite?.groupType, invite?.familyName);

  const answerError = (e) => {
    const code = e?.message || '';
    if (code === 'already-handled') return t('member.inviteAlreadyHandled');
    if (code === 'forbidden') return t('member.inviteForbidden');
    return inviteResponseMessage(code) || (code && !/^[a-z-]+$/.test(code) ? code : t('common.error'));
  };

  const leave = () => {
    if (nav.canGoBack()) nav.goBack();
    else nav.navigate('Home');
  };

  const onAccept = async () => {
    if (!uid || busy) return;
    setBusy(true);
    try {
      const res = await acceptFamilyMemberInvite({ familyId, inviteId, uid });
      await claimEmployeeSeat(familyId).catch(() => {});
      setDone('accepted');
      if (res?.familyId) {
        await selectFamily?.(res.familyId, { name: res.familyName, type: invite?.groupType || 'family' });
      }
    } catch (e) {
      Alert.alert(t('common.error'), answerError(e));
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
      Alert.alert(t('common.error'), answerError(e));
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
            {done === 'accepted'
              ? t(company ? 'member.companyInviteAccepted' : 'member.inviteAccepted')
              : t(company ? 'member.companyInviteDeclined' : 'member.inviteDeclined')}
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

  const familyLabel = invite.familyName || copy.bodyName;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.backBtn} onPress={leave} accessibilityLabel={t('common.back')}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headTitle}>{company ? t('member.companyInviteTitle') : (copy.noun === 'familien' ? t('member.familyInviteTitle') : copy.title)}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.card}>
          <Ionicons name={company ? 'business' : 'people'} size={36} color={colors.brand} />
          <Text style={styles.lead}>{company ? t('member.companyInviteLead') : t('member.familyInviteLead')}</Text>
          <Text style={styles.familyName}>{familyLabel}</Text>
          <Text style={styles.hint}>{company ? t('member.companyInviteHint') : t('member.familyInviteHint')}</Text>
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
    alignSelf: 'flex-start',
    padding: 8, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line,
  },
  headTitle: { flex: 1, fontWeight: '400', fontSize: 18, color: colors.ink },
  body: { padding: 20, gap: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg || 16, padding: 24,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', gap: 10, marginBottom: 8,
  },
  lead: { fontWeight: '400', color: colors.muted, textAlign: 'center' },
  familyName: { fontWeight: '400', fontSize: 24, color: colors.ink, textAlign: 'center' },
  hint: { fontWeight: '400', color: colors.muted, textAlign: 'center', marginTop: 4 },
  title: { fontWeight: '400', fontSize: 20, color: colors.ink, textAlign: 'center' },
  primary: {
    backgroundColor: colors.brand, borderRadius: radius.md || 12,
    paddingVertical: 16, alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  secondary: {
    backgroundColor: colors.card, borderRadius: radius.md || 12,
    paddingVertical: 16, alignItems: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  secondaryTxt: { color: colors.ink, fontWeight: '400', fontSize: 16 },
  disabled: { opacity: 0.6 },
});
