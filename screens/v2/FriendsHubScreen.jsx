import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Screen, Loader } from '../../components/ui';
import { AvatarBubble } from '../../components/AvatarPicker';
import {
  listenFriends,
  listenIncomingFriendRequests,
  listenOutgoingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  refreshMyFriends,
  withdrawFriendRequest,
  dismissOutgoingFriendRequest,
  resendFriendRequest,
  refreshOutgoingFriendRequests,
} from '../../src/utils/friends';
import { ensureFriendChatDoc } from '../../src/utils/friendChats';
import {
  friendChatId,
  friendProfileOwnerUid,
  canMutatePersonalFriends,
} from '../../src/utils/friendsLogic';
import { preferAuthUid } from '../../src/utils/inviteAuthUid';
import HelpTarget from '../../components/HelpTarget';
import { ModulePageFrame } from '../../components/ModulePageBg';
import AddFriendModal from '../../components/AddFriendModal';
import FriendQrModal from '../../components/FriendQrModal';
import { useChatDock, useChatDockPreferred } from '../../src/context/ChatDockContext';

/** react-native-web's Alert.alert is a no-op — use window.alert/confirm on web. */
function showAlert(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function confirmAction(title, message, confirmLabel, onYes) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Avbryt', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onYes },
  ]);
}

/**
 * Venner-hub: profilens personlige venner.
 * Venner får aldri tilgang til familieplattformen.
 * Parent viewing a child profile shows THAT child's friends — never the parent's.
 */
export default function FriendsHubScreen({ inShell = false }) {
  const nav = useNavigation();
  const { t } = useI18n();
  const {
    uid, family, familyId, activeProfile, meParent, meChild, requestShellTab,
    isActingAsChild, activeChild,
  } = useApp();
  const dockPreferred = useChatDockPreferred();
  const { openThread } = useChatDock();
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [ready, setReady] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [toast, setToast] = useState('');

  const childAuthUid = preferAuthUid(activeChild?.uid, activeChild?.id);
  const friendOwnerUid = friendProfileOwnerUid({
    authUid: uid,
    isActingAsChild,
    childUid: childAuthUid,
  });
  const canMutateFriends = canMutatePersonalFriends({
    authUid: uid,
    friendOwnerUid,
    isActingAsChild,
  });
  const viewingChildFriends = isActingAsChild && !!friendOwnerUid;
  const childFirstName = (activeChild?.name || '').trim().split(/\s+/)[0] || '';
  const friendsFamilyId = familyId || family?.id || null;
  const actingAsChildUid = (isActingAsChild && friendOwnerUid && friendOwnerUid !== uid)
    ? friendOwnerUid
    : null;

  useEffect(() => {
    if (!friendOwnerUid) {
      setFriends([]);
      setReady(true);
      return undefined;
    }
    const unsub = listenFriends(uid, (list) => {
      setFriends(list);
      setReady(true);
    }, {
      forUid: friendOwnerUid,
      familyId: familyId || family?.id || null,
    });
    return unsub;
  }, [uid, friendOwnerUid, familyId, family?.id]);

  useEffect(() => {
    // Incoming/outgoing requests belong to the profile owner (self, or child when parent acts).
    if (!uid || !canMutateFriends || !friendOwnerUid) {
      setRequests([]);
      return undefined;
    }
    return listenIncomingFriendRequests(uid, setRequests, {
      asUid: actingAsChildUid,
      familyId: friendsFamilyId,
    });
  }, [uid, canMutateFriends, friendOwnerUid, actingAsChildUid, friendsFamilyId]);

  useEffect(() => {
    if (!uid || !canMutateFriends || !friendOwnerUid) {
      setOutgoing([]);
      return undefined;
    }
    return listenOutgoingFriendRequests(uid, setOutgoing, {
      asUid: actingAsChildUid,
      familyId: friendsFamilyId,
    });
  }, [uid, canMutateFriends, friendOwnerUid, actingAsChildUid, friendsFamilyId]);

  const outgoingVisible = useMemo(
    () => (outgoing || []).filter((r) => {
      const st = String(r.status || 'pending');
      // Hide accepted — those show under Mine venner
      return st === 'pending' || st === 'declined' || st === 'withdrawn';
    }),
    [outgoing],
  );

  const statusLabel = (status) => {
    const st = String(status || 'pending');
    if (st === 'declined') return t('friend.statusDeclined');
    if (st === 'withdrawn') return t('friend.statusWithdrawn');
    return t('friend.statusPending');
  };

  const myName = activeProfile?.name || meParent?.name || meChild?.name || '';

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  const openChat = async (person) => {
    const otherUid = person.friendUid || person.uid;
    const selfUid = friendOwnerUid || uid;
    if (!otherUid || !selfUid) return;
    try {
      // Prefer computed id; Admin send/list creates the chat doc if missing.
      let chatId = friendChatId(selfUid, otherUid);
      try {
        chatId = await ensureFriendChatDoc(selfUid, otherUid, {
          title: person.name || 'Chat',
          names: { [selfUid]: myName, [otherUid]: person.name || '' },
        }) || chatId;
      } catch {
        /* rules may block client create — Admin path still works */
      }
      const thread = {
        kind: 'friend',
        friendUid: otherUid,
        chatId,
        title: person.name || t('friend.chat'),
        memberIds: [selfUid, otherUid],
        photoURL: person.photoURL || person.photoUrl || null,
        avatarId: person.avatarId || null,
      };
      if (dockPreferred) {
        openThread(thread);
        return;
      }
      nav.navigate('FriendChatThread', thread);
    } catch (e) {
      showAlert(t('common.error'), e?.message || t('common.error'));
    }
  };

  const onAccept = async (req) => {
    if (busyId) return;
    setBusyId(req.id);
    try {
      await acceptFriendRequest({
        uid: friendOwnerUid || uid,
        requestId: req.id || req.requestId,
        request: req,
        asUid: actingAsChildUid,
        familyId: friendsFamilyId,
      });
      setRequests((prev) => prev.filter((r) => r.id !== req.id && r.requestId !== req.id));
      const list = await refreshMyFriends({
        forUid: actingAsChildUid || undefined,
        familyId: friendsFamilyId,
      }).catch(() => null);
      if (list) setFriends(list);
    } catch (e) {
      showAlert(
        t('common.error'),
        e?.message === 'already-handled' ? t('friend.alreadyHandled') : t('common.error'),
      );
    } finally {
      setBusyId(null);
    }
  };

  const onDecline = async (req) => {
    if (busyId) return;
    setBusyId(req.id);
    try {
      await declineFriendRequest({
        uid: friendOwnerUid || uid,
        requestId: req.id || req.requestId,
        asUid: actingAsChildUid,
        familyId: friendsFamilyId,
      });
      setRequests((prev) => prev.filter((r) => r.id !== req.id && r.requestId !== req.id));
    } catch (e) {
      showAlert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setBusyId(null);
    }
  };

  const onResend = async (req) => {
    const id = req.id || req.requestId;
    if (!id || busyId) return;
    setBusyId(id);
    try {
      const res = await resendFriendRequest({
        requestId: id,
        asUid: actingAsChildUid,
        familyId: friendsFamilyId,
      });
      const parts = [t('friend.resentOk')];
      if (res?.emailSent) parts.push(t('friend.emailSent'));
      else if (res?.emailError) parts.push(`${t('friend.emailFailed')}: ${res.emailError}`);
      if (res?.smsSent) parts.push(t('friend.smsSent'));
      else if (res?.smsError) parts.push(`${t('friend.smsFailed')}: ${res.smsError}`);
      showToast(parts.join(' '));
      setOutgoing((prev) => prev.map((r) => (
        (r.id === id || r.requestId === id)
          ? { ...r, lastResentAt: new Date().toISOString() }
          : r
      )));
    } catch (e) {
      showAlert(
        t('common.error'),
        e?.message === 'already-handled' ? t('friend.alreadyHandled') : (e?.message || t('common.error')),
      );
    } finally {
      setBusyId(null);
    }
  };

  const onWithdraw = (req) => {
    const id = req.id || req.requestId;
    if (!id || busyId) return;
    confirmAction(
      t('friend.withdrawTitle'),
      t('friend.withdrawBody'),
      t('friend.withdrawInvite'),
      async () => {
        setBusyId(id);
        try {
          await withdrawFriendRequest({
            requestId: id,
            asUid: actingAsChildUid,
            familyId: friendsFamilyId,
          });
          setOutgoing((prev) => prev.map((r) => (
            (r.id === id || r.requestId === id)
              ? { ...r, status: 'withdrawn' }
              : r
          )));
          showToast(t('friend.withdrawnOk'));
        } catch (e) {
          showAlert(t('common.error'), e?.message || t('common.error'));
        } finally {
          setBusyId(null);
        }
      },
    );
  };


  const onDismissOutgoing = (req) => {
    const id = req.id || req.requestId;
    if (!id || busyId) return;
    confirmAction(
      t('friend.dismissOutgoingTitle'),
      t('friend.dismissOutgoingBody'),
      t('friend.dismissOutgoing'),
      async () => {
        setBusyId(id);
        try {
          await dismissOutgoingFriendRequest({
            uid: friendOwnerUid || uid,
            requestId: id,
            asUid: actingAsChildUid,
            familyId: friendsFamilyId,
          });
          setOutgoing((prev) => prev.filter((r) => r.id !== id && r.requestId !== id));
          showToast(t('friend.dismissedOk'));
        } catch (e) {
          showAlert(t('common.error'), e?.message || t('common.error'));
        } finally {
          setBusyId(null);
        }
      },
    );
  };

  const onRemove = (friend) => {
    confirmAction(
      t('friend.removeTitle'),
      t('friend.removeBody'),
      t('friend.remove'),
      async () => {
        try {
          await removeFriend({
            uid: friendOwnerUid || uid,
            friendUid: friend.friendUid || friend.id,
            asUid: actingAsChildUid,
            familyId: friendsFamilyId,
          });
        } catch (e) {
          showAlert(t('common.error'), e?.message || t('common.error'));
        }
      },
    );
  };

  if (!ready && uid) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name={null} hero={false}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!inShell ? <Text style={styles.pageTitle}>{t('friend.title')}</Text> : null}
          <Text style={styles.hint}>
            {viewingChildFriends
              ? t('friend.subtitleChildProfile', { name: childFirstName || t('friend.child') })
              : t('friend.subtitle')}
          </Text>

          {canMutateFriends ? (
            <HelpTarget id="friends-add">
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setAddOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('friend.add')}
                >
                  <Ionicons name="person-add-outline" size={18} color="#fff" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.addBtnTxt}>{t('friend.add')}</Text>
                    <Text style={styles.addBtnSub}>{t('friend.addBtnSub')}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.qrBtn}
                  onPress={() => setQrOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('friend.qrTitle')}
                >
                  <Ionicons name="qr-code-outline" size={22} color={colors.brand} />
                  <Text style={styles.qrBtnTxt}>{t('friend.myQrShort')}</Text>
                </TouchableOpacity>
              </View>
            </HelpTarget>
          ) : null}

          {toast ? (
            <View style={styles.toast} accessibilityLiveRegion="polite">
              <Ionicons name="checkmark-circle" size={16} color="#166534" />
              <Text style={styles.toastTxt}>{toast}</Text>
            </View>
          ) : null}

          {canMutateFriends && requests.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('friend.requests')} ({requests.length})</Text>
              {requests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <AvatarBubble
                    avatarId={req.fromAvatarId}
                    photoURL={req.fromPhotoURL}
                    name={req.fromName}
                    size={40}
                  />
                  <View style={styles.requestBody}>
                    <Text style={styles.personName} numberOfLines={1}>{req.fromName || 'Noen'}</Text>
                    <Text style={styles.personSub}>{t('friend.wantsToBeFriend')}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.acceptBtn}
                    onPress={() => onAccept(req)}
                    disabled={!!busyId}
                  >
                    <Text style={styles.acceptTxt}>{t('friend.accept')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.declineBtn}
                    onPress={() => onDecline(req)}
                    disabled={!!busyId}
                  >
                    <Text style={styles.declineTxt}>{t('friend.decline')}</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {canMutateFriends && outgoingVisible.length > 0 ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {t('friend.outgoingSection')} ({outgoingVisible.length})
              </Text>
              <Text style={styles.sectionHint}>{t('friend.outgoingHint')}</Text>
              {outgoingVisible.map((req) => {
                const id = req.id || req.requestId;
                const st = String(req.status || 'pending');
                const name = req.toName
                  || (req.toUsername ? `@${req.toUsername}` : '')
                  || req.toEmail
                  || req.toPhone
                  || 'Venn';
                const pending = st === 'pending';
                return (
                  <View key={id} style={styles.outgoingRow}>
                    <AvatarBubble
                      avatarId={null}
                      photoURL={null}
                      name={name}
                      size={40}
                    />
                    <View style={styles.requestBody}>
                      <Text style={styles.personName} numberOfLines={1}>{name}</Text>
                      <Text style={[
                        styles.statusPill,
                        pending && styles.statusPending,
                        st === 'declined' && styles.statusDeclined,
                        st === 'withdrawn' && styles.statusWithdrawn,
                      ]}
                      >
                        {statusLabel(st)}
                      </Text>
                    </View>
                    {pending ? (
                      <View style={styles.outgoingActions}>
                        <TouchableOpacity
                          style={styles.resendBtn}
                          onPress={() => onResend(req)}
                          disabled={!!busyId}
                          accessibilityRole="button"
                        >
                          <Text style={styles.resendTxt}>{t('friend.resendInvite')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.withdrawBtn}
                          onPress={() => onWithdraw(req)}
                          disabled={!!busyId}
                          accessibilityRole="button"
                        >
                          <Text style={styles.withdrawTxt}>{t('friend.withdrawInvite')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.dismissBtn}
                        onPress={() => onDismissOutgoing(req)}
                        disabled={!!busyId}
                        accessibilityRole="button"
                        accessibilityLabel={t('friend.dismissOutgoing')}
                      >
                        <Ionicons name="close" size={20} color={colors.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {viewingChildFriends
                ? `${t('friend.childFriendsSection', { name: childFirstName || t('friend.child') })} (${friends.length})`
                : `${t('friend.friendsSection')} (${friends.length})`}
            </Text>
            <Text style={styles.sectionHint}>
              {viewingChildFriends ? t('friend.childFriendsHint') : t('friend.friendsHint')}
            </Text>
            {!friendOwnerUid && isActingAsChild ? (
              <Text style={styles.empty}>{t('friend.childNoAccountFriends')}</Text>
            ) : friends.length === 0 ? (
              <Text style={styles.empty}>
                {viewingChildFriends ? t('friend.childNoFriends') : t('friend.noFriends')}
              </Text>
            ) : (
              friends.map((f) => (
                <View key={f.id} style={styles.personRow}>
                  <TouchableOpacity
                    style={styles.personMain}
                    onPress={() => openChat(f)}
                    accessibilityRole="button"
                  >
                    <AvatarBubble
                      avatarId={f.avatarId}
                      photoURL={f.photoURL}
                      name={f.name}
                      size={40}
                    />
                    <View style={styles.personBody}>
                      <Text style={styles.personName} numberOfLines={1}>{f.name}</Text>
                      <Text style={styles.personSub}>
                        {f.username ? `@${f.username}` : t('friend.friendLabel')}
                      </Text>
                    </View>
                    <Ionicons name="chatbubble-outline" size={18} color={colors.brand} />
                  </TouchableOpacity>
                  {canMutateFriends ? (
                    <TouchableOpacity
                      style={styles.moreBtn}
                      onPress={() => onRemove(f)}
                      accessibilityLabel={t('friend.remove')}
                    >
                      <Ionicons name="ellipsis-horizontal" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </ModulePageFrame>
      {canMutateFriends ? (
        <>
          <AddFriendModal
            visible={addOpen}
            asUid={actingAsChildUid}
            familyId={friendsFamilyId}
            onClose={() => {
              setAddOpen(false);
              refreshOutgoingFriendRequests({
                asUid: actingAsChildUid,
                familyId: friendsFamilyId,
              })
                .then((list) => { if (list) setOutgoing(list); })
                .catch(() => {});
            }}
          />
          <FriendQrModal visible={qrOpen} onClose={() => setQrOpen(false)} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  pageTitle: { fontSize: 22, fontWeight: '400', color: colors.text, marginBottom: 6 },
  hint: { color: colors.muted, fontSize: 14, marginBottom: 12, lineHeight: 20 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 14, alignItems: 'stretch' },
  addBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  addBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  addBtnSub: { color: 'rgba(255,255,255,0.82)', fontSize: 11, marginTop: 1, fontWeight: '500' },
  qrBtn: {
    width: 88,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brand,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  qrBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 11, textAlign: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  toastTxt: { flex: 1, color: '#166534', fontSize: 13, fontWeight: '400' },
  section: { marginBottom: 22 },
  sectionTitle: { fontSize: 15, fontWeight: '400', color: colors.text, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: colors.muted, marginBottom: 10, lineHeight: 17 },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: 8 },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 10,
  },
  personMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  personBody: { flex: 1, minWidth: 0 },
  personName: { fontSize: 15, fontWeight: '400', color: colors.text },
  personSub: { fontSize: 12, color: colors.muted, marginTop: 1 },
  moreBtn: {
    alignSelf: 'flex-start', padding: 8 },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  requestBody: { flex: 1, minWidth: 0 },
  acceptBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  acceptTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },
  declineBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 5 },
  declineTxt: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  outgoingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 3,
    fontSize: 11,
    fontWeight: '400',
    overflow: 'hidden',
  },
  statusPending: { color: '#b45309' },
  statusDeclined: { color: '#b91c1c' },
  statusWithdrawn: { color: colors.muted },
  outgoingActions: { alignItems: 'flex-end', gap: 4 },
  resendBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft || '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  resendTxt: { color: colors.brand, fontWeight: '400', fontSize: 11 },
  withdrawBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4 },
  withdrawTxt: { color: colors.muted, fontWeight: '400', fontSize: 11 },
  dismissBtn: {
    alignSelf: 'flex-start',
    padding: 8,
    borderRadius: 8,
  },
});
