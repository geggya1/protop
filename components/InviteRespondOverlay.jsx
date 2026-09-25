import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme';
import {
  listenIncomingFamilyInvites,
  acceptFamilyMemberInvite,
  declineFamilyMemberInvite,
} from '../src/utils/groups';
import {
  listenIncomingGameInvites,
  listenFamilyPendingGameInvites,
  GAME_TYPE_LABELS,
  GAME_TYPE_SCREENS,
} from '../src/utils/familyGamesShared';
import { respondToGameInvite } from '../src/utils/gameInviteRespond';
import { groupInviteCopy } from '../src/utils/inviteIdentifiers';
import {
  listenIncomingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
} from '../src/utils/friends';

/**
 * Full-screen mandatory invite gate after login.
 * Cannot be dismissed without Accept or Decline.
 */
export default function InviteRespondOverlay({ enabled = true, onPendingChange }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const { uid, activeProfile, meParent, selectFamily, familyId } = useApp();
  const [familyInvites, setFamilyInvites] = useState([]);
  const [gameInvites, setGameInvites] = useState([]);
  const [familyGameInvites, setFamilyGameInvites] = useState([]);
  const [friendInvites, setFriendInvites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!uid || !enabled) {
      setFamilyInvites([]);
      return undefined;
    }
    return listenIncomingFamilyInvites(uid, setFamilyInvites);
  }, [uid, enabled]);

  useEffect(() => {
    if (!uid || !enabled) {
      setGameInvites([]);
      return undefined;
    }
    return listenIncomingGameInvites(uid, setGameInvites);
  }, [uid, enabled]);

  useEffect(() => {
    if (!uid || !enabled || !familyId) {
      setFamilyGameInvites([]);
      return undefined;
    }
    return listenFamilyPendingGameInvites(familyId, uid, setFamilyGameInvites);
  }, [uid, enabled, familyId]);

  useEffect(() => {
    if (!uid || !enabled) {
      setFriendInvites([]);
      return undefined;
    }
    return listenIncomingFriendRequests(uid, setFriendInvites);
  }, [uid, enabled]);

  const mergedGameInvites = useMemo(() => {
    const byKey = new Map();
    [...(gameInvites || []), ...(familyGameInvites || [])].forEach((inv) => {
      const key = inv.inviteId || inv.id || `${inv.gameType}_${inv.gameId}`;
      if (!key || byKey.has(key)) return;
      byKey.set(key, inv);
    });
    return [...byKey.values()];
  }, [gameInvites, familyGameInvites]);

  const pendingCount = familyInvites.length + mergedGameInvites.length + friendInvites.length;
  useEffect(() => {
    onPendingChange?.(enabled ? pendingCount > 0 : false);
  }, [enabled, pendingCount, onPendingChange]);

  // Deep-link: /family-invite/... or /friend-invite/...
  useEffect(() => {
    if (!uid || Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search || '');
      let inviteId = params.get('familyInvite');
      let familyId = params.get('familyId');
      const pathMatch = String(window.location.pathname || '').match(
        /\/family-invite\/([^/]+)\/([^/]+)/i,
      );
      if (pathMatch) {
        familyId = familyId || decodeURIComponent(pathMatch[1]);
        inviteId = inviteId || decodeURIComponent(pathMatch[2]);
      }
      if (inviteId && familyId) {
        nav.navigate('FamilyInviteRespond', { familyId, inviteId });
        window.history.replaceState({}, '', `${window.location.origin}/`);
        return;
      }
      const friendMatch = String(window.location.pathname || '').match(
        /\/friend-invite\/([^/?#]+)/i,
      );
      const friendReq = params.get('friendInvite') || (friendMatch ? decodeURIComponent(friendMatch[1]) : '');
      if (friendReq && !params.get('token')) {
        nav.navigate('FriendInviteRespond', { requestId: friendReq });
        window.history.replaceState({}, '', `${window.location.origin}/`);
      }
    } catch { /* ignore */ }
  }, [uid, nav]);

  const current = useMemo(() => {
    if (familyInvites.length) {
      const inv = familyInvites[0];
      return { kind: 'family', inv };
    }
    if (friendInvites.length) {
      const inv = friendInvites[0];
      return { kind: 'friend', inv };
    }
    if (mergedGameInvites.length) {
      const inv = mergedGameInvites[0];
      return { kind: 'game', inv };
    }
    return null;
  }, [familyInvites, friendInvites, mergedGameInvites]);

  if (!enabled || !uid || !current) return null;

  const onAccept = async () => {
    if (busy || !current) return;
    setBusy(true);
    setError('');
    try {
      if (current.kind === 'family') {
        const inv = current.inv;
        const inviteId = inv.inviteId || inv.id;
        const familyId = inv.familyId;
        const res = await acceptFamilyMemberInvite({ familyId, inviteId, uid });
        if (res?.familyId) {
          await selectFamily?.(res.familyId, {
            name: res.familyName || inv.familyName,
            type: inv.groupType || 'family',
          });
        }
      } else if (current.kind === 'friend') {
        const inv = current.inv;
        await acceptFriendRequest({
          uid,
          requestId: inv.requestId || inv.id,
          request: inv,
        });
      } else {
        const inv = current.inv;
        await respondToGameInvite({
          familyId: inv.familyId,
          gameType: inv.gameType,
          gameId: inv.gameId,
          uid,
          name: activeProfile?.name || meParent?.name || 'Spiller',
          response: 'accepted',
        });
        const screen = GAME_TYPE_SCREENS[inv.gameType];
        if (screen) {
          nav.navigate(screen, { familyId: inv.familyId, gameId: inv.gameId });
        } else {
          nav.navigate('Home', { openShell: { tab: 'more', subView: 'games' } });
        }
      }
    } catch (e) {
      setError(
        e?.message === 'already-handled'
          ? t('member.inviteAlreadyHandled')
          : (e?.message === 'forbidden' ? t('member.inviteForbidden') : t('common.error')),
      );
    } finally {
      setBusy(false);
    }
  };

  const onDecline = async () => {
    if (busy || !current) return;
    setBusy(true);
    setError('');
    try {
      if (current.kind === 'family') {
        const inv = current.inv;
        await declineFamilyMemberInvite({
          familyId: inv.familyId,
          inviteId: inv.inviteId || inv.id,
          uid,
        });
      } else if (current.kind === 'friend') {
        const inv = current.inv;
        await declineFriendRequest({
          uid,
          requestId: inv.requestId || inv.id,
        });
      } else {
        const inv = current.inv;
        await respondToGameInvite({
          familyId: inv.familyId,
          gameType: inv.gameType,
          gameId: inv.gameId,
          uid,
          name: activeProfile?.name || meParent?.name || 'Spiller',
          response: 'declined',
        });
      }
    } catch (e) {
      setError(
        e?.message === 'already-handled'
          ? t('member.inviteAlreadyHandled')
          : (e?.message === 'forbidden' ? t('member.inviteForbidden') : t('common.error')),
      );
    } finally {
      setBusy(false);
    }
  };

  const inv = current.inv;
  const copy = current.kind === 'family'
    ? groupInviteCopy(inv.groupType, inv.familyName)
    : null;
  const title = current.kind === 'family'
    ? (copy?.title || t('member.familyInviteTitle'))
    : (current.kind === 'friend'
      ? t('friend.requestTitle')
      : t('member.gameInviteTitle'));
  const lead = current.kind === 'family'
    ? `${t('member.familyInviteLead')} «${copy?.bodyName || inv.familyName || t('group.family')}».`
    : (current.kind === 'friend'
      ? (inv.fromName
        ? t('friend.requestFrom').replace('{name}', inv.fromName)
        : t('friend.wantsToBeFriend'))
      : `${inv.hostName || 'Noen'} inviterer deg til ${inv.gameTitle || GAME_TYPE_LABELS[inv.gameType] || 'spill'}.`);
  const question = t('member.homeInviteQuestion');
  const hint = current.kind === 'family'
    ? t('member.familyInviteHint')
    : (current.kind === 'friend'
      ? t('friend.privacyNotice')
      : t('member.gameInviteHint'));
  const remaining = familyInvites.length + gameInvites.length + friendInvites.length;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={() => { /* must answer — block back dismiss */ }}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons
              name={
                current.kind === 'game'
                  ? 'game-controller'
                  : (current.kind === 'friend' ? 'people' : 'mail-unread')
              }
              size={36}
              color={colors.brand}
            />
          </View>
          <Text style={styles.kicker}>{title}</Text>
          <Text style={styles.lead}>{lead}</Text>
          <Text style={styles.question}>{question}</Text>
          <Text style={styles.hint}>{hint}</Text>
          {remaining > 1 ? (
            <Text style={styles.queue}>
              {remaining - 1} {t('member.moreInvitesWaiting')}
            </Text>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.declineBtn, busy && styles.disabled]}
              onPress={onDecline}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={styles.declineTxt}>{t('member.declineInvite')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.acceptBtn, busy && styles.disabled]}
              onPress={onAccept}
              disabled={busy}
              accessibilityRole="button"
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.acceptTxt}>{t('member.acceptInvite')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: colors.card,
    borderRadius: radius.lg || 20,
    padding: 24,
    gap: 10,
    borderWidth: 2,
    borderColor: colors.brand,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: colors.brandSoft || '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  kicker: {
    textAlign: 'center',
    fontWeight: '400',
    fontSize: 13,
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lead: {
    textAlign: 'center',
    fontWeight: '400',
    fontSize: 22,
    color: colors.ink,
    lineHeight: 30,
  },
  question: {
    textAlign: 'center',
    fontWeight: '400',
    fontSize: 17,
    color: colors.ink,
    marginTop: 4,
  },
  hint: {
    textAlign: 'center',
    fontWeight: '400',
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  queue: {
    textAlign: 'center',
    fontWeight: '400',
    fontSize: 12,
    color: colors.brand,
  },
  error: {
    textAlign: 'center',
    color: colors.danger,
    fontWeight: '400',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  acceptBtn: {
    flex: 1.2,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
  },
  acceptTxt: {
    color: '#fff',
    fontWeight: '400',
    fontSize: 16,
  },
  declineBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.line,
    minHeight: 54,
  },
  declineTxt: {
    color: colors.ink,
    fontWeight: '400',
    fontSize: 16,
  },
  disabled: { opacity: 0.55 },
});
