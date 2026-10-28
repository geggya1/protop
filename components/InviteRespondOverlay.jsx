import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform, AppState,
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
import { claimEmployeeSeat } from '../src/employees/inviteClient';
import { auth } from '../firebase';
import { syncMyInvites } from '../src/utils/invite';
import { inviteResponseMessage, isCompanyGroupType, isStaleInviteCode } from '../src/utils/groupInviteLogic';
import { notifyUser } from '../src/utils/dialog';
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

/** Ny henting når appen får fokus igjen. Serveren tillater 60 i timen. */
const INVITE_SYNC_GAP_MS = 2 * 60 * 1000;

/** «Senere» gjelder resten av økten. Invitasjonen ligger fortsatt i Varsler. */
const DISMISSED_KEY = 'protop.inviteOverlay.later';

function readDismissed() {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(DISMISSED_KEY) : '';
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function inviteKey(kind, inv) {
  return `${kind}:${inv?.inviteId || inv?.requestId || inv?.id || `${inv?.gameType || ''}_${inv?.gameId || ''}`}`;
}

/** Passordbrukere bekrefter på «Bekreft e-posten»-siden og har fått lenken ved registrering. */
function isPasswordUser(user) {
  const provider = user?.providerData?.[0]?.providerId;
  return !provider || provider === 'password';
}

/**
 * Invitasjonsvindu etter innlogging: Godta, Avslå eller Senere.
 * «Senere» skjuler invitasjonen resten av økten; den ligger fortsatt i Varsler.
 * En invitasjon som ikke lenger gjelder (slettet gruppe, besvart, utløpt), lukkes i innboksen,
 * så vinduet ikke kommer tilbake.
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
  const [dismissed, setDismissed] = useState(readDismissed);

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

  // Ny bruker invitert på e-post: serveren legger invitasjonen i innboksen når e-posten er
  // bekreftet, eller personen er innlogget med Google, Microsoft eller Apple. Hentes ved
  // innlogging, når e-posten blir bekreftet og når appen får fokus igjen.
  const [emailVerified, setEmailVerified] = useState(() => !!auth.currentUser?.emailVerified);
  const syncBusyRef = useRef(false);
  const lastSyncRef = useRef(0);

  useEffect(() => {
    lastSyncRef.current = 0;
    if (!uid) return undefined;
    const check = () => !!auth.currentUser?.emailVerified;
    if (check()) {
      setEmailVerified(true);
      return undefined;
    }
    setEmailVerified(false);
    const timer = setInterval(() => {
      if (!check()) return;
      setEmailVerified(true);
      clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [uid]);

  const runInviteSync = useCallback(async () => {
    const me = auth.currentUser;
    if (!uid || !enabled || !me || me.uid !== uid || !me.email || syncBusyRef.current) return null;
    if (!me.emailVerified && isPasswordUser(me)) return null;
    syncBusyRef.current = true;
    try {
      if (me.emailVerified) {
        try {
          const token = await me.getIdTokenResult();
          if (!token?.claims?.email_verified) await me.getIdToken(true);
        } catch { /* bruker gammelt token */ }
      }
      const res = await syncMyInvites();
      if (res?.ok) lastSyncRef.current = Date.now();
      return res;
    } finally {
      syncBusyRef.current = false;
    }
  }, [uid, enabled]);

  useEffect(() => {
    let alive = true;
    let retry = null;
    runInviteSync().then((res) => {
      if (alive && res && !res.ok) retry = setTimeout(() => { if (alive) runInviteSync(); }, 20000);
    });
    return () => {
      alive = false;
      clearTimeout(retry);
    };
  }, [runInviteSync, emailVerified]);

  useEffect(() => {
    if (!uid || !enabled) return undefined;
    const again = () => {
      if (Date.now() - lastSyncRef.current < INVITE_SYNC_GAP_MS) return;
      runInviteSync();
    };
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
      const onVisible = () => { if (document.visibilityState !== 'hidden') again(); };
      window.addEventListener('focus', again);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        window.removeEventListener('focus', again);
        document.removeEventListener('visibilitychange', onVisible);
      };
    }
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') again(); });
    return () => sub.remove();
  }, [uid, enabled, runInviteSync]);

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

  // Invitasjoner som venter og ikke er lagt til side med «Senere».
  const pendingCount = [
    ...familyInvites.map((inv) => inviteKey('family', inv)),
    ...friendInvites.map((inv) => inviteKey('friend', inv)),
    ...mergedGameInvites.map((inv) => inviteKey('game', inv)),
  ].filter((key) => !dismissed.has(key)).length;
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
    const open = (kind, list) => (list || []).find((inv) => !dismissed.has(inviteKey(kind, inv)));
    const family = open('family', familyInvites);
    if (family) return { kind: 'family', inv: family };
    const friend = open('friend', friendInvites);
    if (friend) return { kind: 'friend', inv: friend };
    const game = open('game', mergedGameInvites);
    if (game) return { kind: 'game', inv: game };
    return null;
  }, [familyInvites, friendInvites, mergedGameInvites, dismissed]);

  const later = useCallback(() => {
    if (!current) return;
    setError('');
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(inviteKey(current.kind, current.inv));
      try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...next])); } catch { /* privatmodus */ }
      return next;
    });
  }, [current]);

  const answerError = (e) => {
    const code = e?.message || '';
    if (code === 'already-handled') return t('member.inviteAlreadyHandled');
    if (code === 'forbidden') return t('member.inviteForbidden');
    return inviteResponseMessage(code) || (code && !/^[a-z-]+$/.test(code) ? code : t('common.error'));
  };

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
        await claimEmployeeSeat(familyId).catch(() => {});
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
      // Invitasjonen gjelder ikke lenger: den er lukket i innboksen, og vinduet forsvinner.
      // Si fra i en egen melding, siden feilteksten i vinduet ikke rekker å vises.
      if (current.kind === 'family' && isStaleInviteCode(e?.message)) {
        notifyUser(t('member.familyInviteTitle'), answerError(e));
      }
      setError(answerError(e));
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
      setError(answerError(e));
    } finally {
      setBusy(false);
    }
  };

  const inv = current.inv;
  const companyInvite = current.kind === 'family' && isCompanyGroupType(inv.groupType);
  const copy = current.kind === 'family'
    ? groupInviteCopy(inv.groupType, inv.familyName)
    : null;
  const title = companyInvite
    ? t('member.companyInviteTitle')
    : current.kind === 'family'
    ? (copy?.title || t('member.familyInviteTitle'))
    : (current.kind === 'friend'
      ? t('friend.requestTitle')
      : t('member.gameInviteTitle'));
  const lead = companyInvite
    ? `${t('member.companyInviteLead')} «${copy?.bodyName || inv.familyName}».`
    : current.kind === 'family'
    ? `${t('member.familyInviteLead')} «${copy?.bodyName || inv.familyName || t('group.family')}».`
    : (current.kind === 'friend'
      ? (inv.fromName
        ? t('friend.requestFrom').replace('{name}', inv.fromName)
        : t('friend.wantsToBeFriend'))
      : `${inv.hostName || 'Noen'} inviterer deg til ${inv.gameTitle || GAME_TYPE_LABELS[inv.gameType] || 'spill'}.`);
  const question = t('member.homeInviteQuestion');
  const hint = companyInvite
    ? t('member.companyInviteHint')
    : current.kind === 'family'
    ? t('member.familyInviteHint')
    : (current.kind === 'friend'
      ? t('friend.privacyNotice')
      : t('member.gameInviteHint'));
  const remaining = pendingCount;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={later}
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
          <TouchableOpacity
            nativeID="invite-later"
            onPress={later}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Svar senere"
            style={styles.laterBtn}
          >
            <Text style={styles.laterTxt}>Senere</Text>
          </TouchableOpacity>
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
  laterBtn: {
    position: 'absolute',
    top: 10,
    right: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  laterTxt: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 14,
  },
});
