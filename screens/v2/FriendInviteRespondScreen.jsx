import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import { acceptFriendRequest, declineFriendRequest } from '../../src/utils/friends';

const FRIENDS_SHELL = { openShell: { tab: 'more', subView: 'friends' } };

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

  // Lytt på forespørselen: trekkes den tilbake mens siden er åpen, forsvinner Godta/Avslå.
  useEffect(() => {
    if (!uid || !requestId) {
      setLoading(false);
      setError(t('friend.inviteNotFound'));
      return undefined;
    }
    return onSnapshot(doc(db, 'users', uid, 'friendRequests', requestId), (snap) => {
      if (!snap.exists()) {
        setInvite(null);
        setError(t('friend.inviteNotFound'));
      } else {
        setInvite({ id: snap.id, ...snap.data() });
        setError('');
      }
      setLoading(false);
    }, () => {
      setError(t('common.error'));
      setLoading(false);
    });
  }, [uid, requestId, t]);

  // Lenken kommer ofte fra en e-post, uten noe å gå tilbake til: da går vi til Venner.
  const leave = () => {
    if (nav.canGoBack?.()) nav.goBack();
    else nav.navigate('Home', FRIENDS_SHELL);
  };
  const status = String(invite?.status || 'pending');
  const handled = !done && invite && status !== 'pending';

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

  const backLink = (
    <View style={styles.backRow}>
      <CompactBackLink
        onPress={leave}
        label={t('friend.title')}
        accessibilityLabel={t('friend.goToFriends')}
      />
    </View>
  );

  if (loading) {
    return (
      <Screen>
        {backLink}
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {backLink}
      <View style={styles.wrap}>
        <Ionicons name="people" size={48} color={colors.brand} />
        <Text style={styles.title}>{t('friend.requestTitle')}</Text>
        {done === 'accepted' ? (
          <>
            <Text style={styles.body}>{t('friend.acceptedBody')}</Text>
            <TouchableOpacity style={styles.primary} onPress={() => nav.navigate('Home', FRIENDS_SHELL)}>
              <Text style={styles.primaryTxt}>{t('friend.goToFriends')}</Text>
            </TouchableOpacity>
          </>
        ) : done === 'declined' ? (
          <>
            <Text style={styles.body}>{t('friend.declinedBody')}</Text>
            <TouchableOpacity style={styles.primary} onPress={leave}>
              <Text style={styles.primaryTxt}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </>
        ) : handled || (!invite && error) ? (
          <>
            <Text style={styles.body}>
              {!invite ? error
                : status === 'withdrawn' ? t('friend.withdrawnBody') : t('friend.alreadyHandled')}
            </Text>
            <TouchableOpacity style={styles.primary} onPress={() => nav.navigate('Home', FRIENDS_SHELL)}>
              <Text style={styles.primaryTxt}>{t('friend.goToFriends')}</Text>
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
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  wrap: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: '400', color: colors.ink, marginTop: 16, marginBottom: 8 },
  body: { fontSize: 15, color: colors.ink, textAlign: 'center', lineHeight: 22, marginBottom: 12 },
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
