import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import { Screen } from '../../components/ui';
import { acceptFriendRequest, declineFriendRequest } from '../../src/utils/friends';

export default function FriendInviteRespondScreen() {
  const nav = useNavigation();
  const { params } = useRoute();
  const { t } = useI18n();
  const { uid } = useApp();
  const requestId = params?.requestId || params?.inviteId;
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid || !requestId) {
        setLoading(false);
        setError(t('friend.inviteNotFound'));
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'users', uid, 'friendRequests', requestId));
        if (!alive) return;
        if (!snap.exists()) {
          setError(t('friend.inviteNotFound'));
        } else {
          setInvite({ id: snap.id, ...snap.data() });
        }
      } catch {
        if (alive) setError(t('common.error'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [uid, requestId, t]);

  const accept = async () => {
    if (busy || !uid || !requestId) return;
    setBusy(true);
    setError('');
    try {
      await acceptFriendRequest({ uid, requestId, request: invite });
      setDone('accepted');
    } catch (e) {
      setError(
        e?.message === 'already-handled' ? t('friend.alreadyHandled') : t('common.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (busy || !uid || !requestId) return;
    setBusy(true);
    setError('');
    try {
      await declineFriendRequest({ uid, requestId });
      setDone('declined');
    } catch (e) {
      setError(
        e?.message === 'already-handled' ? t('friend.alreadyHandled') : t('common.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.wrap}>
        <Ionicons name="people" size={48} color={colors.brand} />
        <Text style={styles.title}>{t('friend.requestTitle')}</Text>
        {done === 'accepted' ? (
          <>
            <Text style={styles.body}>{t('friend.acceptedBody')}</Text>
            <TouchableOpacity style={styles.primary} onPress={() => nav.navigate('Home', { openShell: { tab: 'more', subView: 'friends' } })}>
              <Text style={styles.primaryTxt}>{t('friend.goToFriends')}</Text>
            </TouchableOpacity>
          </>
        ) : done === 'declined' ? (
          <>
            <Text style={styles.body}>{t('friend.declinedBody')}</Text>
            <TouchableOpacity style={styles.primary} onPress={() => nav.goBack()}>
              <Text style={styles.primaryTxt}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.body}>
              {invite?.fromName
                ? t('friend.requestFrom').replace('{name}', invite.fromName)
                : t('friend.wantsToBeFriend')}
            </Text>
            <Text style={styles.privacy}>{t('friend.privacyNotice')}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TouchableOpacity style={styles.primary} onPress={accept} disabled={busy}>
              <Text style={styles.primaryTxt}>{busy ? t('common.loading') : t('friend.accept')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={decline} disabled={busy}>
              <Text style={styles.secondaryTxt}>{t('friend.decline')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wrap: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '400', color: colors.text, marginTop: 16, marginBottom: 8 },
  body: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 22, marginBottom: 12 },
  privacy: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  error: { color: '#dc2626', marginBottom: 12 },
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginBottom: 10,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '400' },
  secondary: { paddingVertical: 10 },
  secondaryTxt: { color: colors.muted, fontWeight: '400' },
});
