import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, TextInput, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useUnread } from '../../src/context/NotificationContext';
import { useI18n } from '../../src/i18n';
import { colors, useLayout } from '../../src/theme';
import { Screen, Loader } from '../../components/ui';
import { AvatarBubble } from '../../components/AvatarPicker';
import { formatThreadTime } from '../../src/utils/aiChats';
import { ensureChatDoc, memberIdsKey, uniqueMemberIds } from '../../src/utils/chats';
import { ensureFriendChatDoc } from '../../src/utils/friendChats';
import { friendChatId } from '../../src/utils/friendsLogic';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { useChatDock, useChatDockPreferred } from '../../src/context/ChatDockContext';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { ModulePageFrame, ModuleHubIntro } from '../../components/ModulePageBg';
import { isChildAiAllowed } from '../../src/utils/childApps';

const AVATAR = 40;

function ThreadRow({
  avatar, name, preview, timeLabel, unreadCount = 0, onPress,
}) {
  const n = Number(unreadCount) || 0;
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.65}>
      <View style={styles.avWrap}>
        {avatar}
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {!!timeLabel && <Text style={styles.time}>{timeLabel}</Text>}
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, n > 0 && styles.previewUnread]} numberOfLines={1}>{preview}</Text>
          {n > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeTxt}>{n > 99 ? '99+' : String(n)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function ChatListScreen({ compactHeader = false, showCompose = true }) {
  useChildAppGuard('chat');
  useHelpScene('hub');
  const nav = useNavigation();
  const { t } = useI18n();
  const { isDesktop } = useLayout();
  const dockPreferred = useChatDockPreferred();
  const { openThread } = useChatDock();
  const { familyId, family, members, uid, isChild, meChild, shellIntent, clearShellIntent, friendPeople, activeProfile, meParent } = useApp();
  const { unreadByChat } = useUnread();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [familyPreview, setFamilyPreview] = useState(t('chat.allTogether'));
  const [familyUpdatedAt, setFamilyUpdatedAt] = useState(null);
  const [dmMeta, setDmMeta] = useState({});
  const showAiChat = !isChild || isChildAiAllowed(meChild);

  const memberKey = useMemo(() => memberIdsKey(members), [members]);
  const familyMembersKey = useMemo(
    () => memberIdsKey(Array.isArray(family?.members) ? family.members : []),
    [family?.members],
  );
  const memberIdList = useMemo(
    () => uniqueMemberIds([...memberKey.split('|'), ...familyMembersKey.split('|')]),
    [memberKey, familyMembersKey],
  );

  useEffect(() => {
    if (shellIntent !== 'create') return;
    clearShellIntent?.();
    setPickerOpen(true);
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    if (!familyId || memberIdList.length === 0) return undefined;
    ensureChatDoc(familyId, 'family', {
      type: 'family',
      title: family?.name || 'Familien',
      memberIds: memberIdList,
    }).catch(() => {});
    return undefined;
  }, [familyId, family?.name, memberKey, familyMembersKey, memberIdList]);

  useEffect(() => {
    if (!familyId) return undefined;
    const qy = query(
      collection(db, 'families', familyId, 'chats', 'family', 'messages'),
      orderBy('createdAt', 'desc'),
      limit(1),
    );
    return onSnapshot(qy, (snap) => {
      const d = snap.docs[0];
      if (!d) return;
      const data = d.data();
      setFamilyPreview(data.text || (data.type === 'image' ? t('chat.imageSent') : t('chat.allTogether')));
      setFamilyUpdatedAt(data.createdAt || null);
    }, () => {});
  }, [familyId, t]);

  const others = useMemo(
    () => members.filter((m) => m.uid && m.uid !== uid),
    [members, uid],
  );
  const othersKey = useMemo(
    () => others.map((p) => p.uid).filter(Boolean).sort().join('|'),
    [others],
  );

  useEffect(() => {
    if (!familyId || !othersKey) return undefined;
    const people = othersKey.split('|').filter(Boolean);
    const unsubs = people.map((personUid) => {
      const id = ['dm', ...[uid, personUid].sort()].join('_');
      const qy = query(
        collection(db, 'families', familyId, 'chats', id, 'messages'),
        orderBy('createdAt', 'desc'),
        limit(1),
      );
      return onSnapshot(qy, (snap) => {
        const d = snap.docs[0];
        setDmMeta((prev) => ({
          ...prev,
          [personUid]: d ? {
            preview: d.data().text || (d.data().type === 'image' ? '📷' : ''),
            at: d.data().createdAt || null,
          } : prev[personUid],
        }));
      }, () => {});
    });
    return () => unsubs.forEach((u) => u && u());
  }, [familyId, othersKey, uid]);

  const openDm = async (person) => {
    if (!person?.uid) return;
    setPickerOpen(false);
    if (person.isFriend || person.role === 'friend') {
      const myName = activeProfile?.name || meParent?.name || meChild?.name || '';
      let chatId = friendChatId(uid, person.uid);
      try {
        chatId = await ensureFriendChatDoc(uid, person.uid, {
          title: person.name,
          names: { [uid]: myName, [person.uid]: person.name || '' },
        }) || chatId;
      } catch { /* Admin path still works in FriendChatThread */ }
      const thread = {
        kind: 'friend',
        friendUid: person.uid,
        chatId,
        title: person.name,
        memberIds: [uid, person.uid],
        photoURL: person.photoURL || person.photoUrl || null,
        avatarId: person.avatarId || null,
      };
      if (dockPreferred) {
        openThread(thread);
        return;
      }
      nav.navigate('FriendChatThread', thread);
      return;
    }
    const id = ['dm', ...[uid, person.uid].sort()].join('_');
    await ensureChatDoc(familyId, id, {
      type: 'dm',
      title: person.name,
      memberIds: [uid, person.uid],
    });
    const thread = {
      familyId,
      chatId: id,
      title: person.name,
      memberIds: [uid, person.uid],
      photoURL: person.photoURL || person.photoUrl || null,
      avatarId: person.avatarId || null,
    };
    if (dockPreferred) {
      openThread(thread);
      return;
    }
    nav.navigate('ChatThread', thread);
  };

  const openFamily = () => {
    const thread = {
      familyId,
      chatId: 'family',
      title: family?.name || 'Familien',
      memberIds: memberIdList,
    };
    if (dockPreferred) {
      openThread(thread);
      return;
    }
    nav.navigate('ChatThread', thread);
  };

  const openAi = () => {
    setPickerOpen(false);
    nav.navigate('AiChat');
  };

  if (!familyId) return <Screen><Loader /></Screen>;

  const friends = friendPeople || [];
  const pickerContactCount = 1 + others.length + friends.length;
  const showPickerSearch = pickerContactCount > 8;
  const pq = pickerQuery.trim().toLowerCase();
  const filterPickerName = (name) => !pq || String(name || '').toLowerCase().includes(pq);
  const filteredPickerOthers = others.filter((p) => filterPickerName(p.name));
  const filteredPickerFriends = friends.filter(
    (p) => filterPickerName(p.name) || filterPickerName(p.username),
  );

  return (
    <Screen>
      <ModulePageFrame name="chat">
      <View style={[styles.wrap, isDesktop && styles.wrapDesk]}>
        {showCompose && (
          <View style={styles.toolbar}>
            <ModuleHubIntro>
            {!compactHeader && (
              <View style={{ flex: 1 }}>
                <Text style={styles.pageTitle}>{t('tabs.chat')}</Text>
                <Text style={styles.pageSub}>{t('chat.subtitleShort')}</Text>
              </View>
            )}
            </ModuleHubIntro>
            <HelpTarget id="add" onAdvance={() => setPickerOpen(true)}>
              <TouchableOpacity
                style={[styles.composeBtn, isDesktop && styles.composeBtnDesk]}
                onPress={() => setPickerOpen(true)}
                accessibilityLabel={t('chat.newChat')}
              >
                <Ionicons name="create-outline" size={18} color={colors.brand} />
              </TouchableOpacity>
            </HelpTarget>
          </View>
        )}

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {showAiChat ? (
            <>
              <Text style={[styles.section, isDesktop && styles.sectionDesk]}>{t('chat.assistant')}</Text>
              <ThreadRow
                name={t('chat.aiChat')}
                preview={t('chat.aiPreview')}
                onPress={openAi}
                avatar={(
                  <View style={[styles.groupAv, styles.aiAv]}>
                    <Ionicons name="sparkles" size={18} color={colors.accent} />
                  </View>
                )}
              />
            </>
          ) : null}

          <Text style={[styles.section, showAiChat && styles.sectionGap, isDesktop && styles.sectionDesk]}>{t('chat.familyChat')}</Text>
          <HelpTarget id="content" onAdvance={openFamily}>
            <ThreadRow
              name={family?.name || 'Familien'}
              preview={familyPreview}
              timeLabel={formatThreadTime(familyUpdatedAt)}
              unreadCount={unreadByChat.family || 0}
              onPress={openFamily}
              avatar={(
                <View style={styles.groupAv}>
                  <Text style={styles.groupEmoji}>👨‍👩‍👧‍👦</Text>
                </View>
              )}
            />
          </HelpTarget>

          <Text style={[styles.section, styles.sectionGap, isDesktop && styles.sectionDesk]}>{t('chat.directMessages')}</Text>
          {others.length === 0 ? (
            <Text style={styles.empty}>{isChild ? t('chat.emptyChild') : t('chat.emptyParent')}</Text>
          ) : others.map((p) => {
            const meta = dmMeta[p.uid] || {};
            const dmId = ['dm', ...[uid, p.uid].sort()].join('_');
            return (
              <ThreadRow
                key={p.uid}
                name={p.name}
                preview={meta.preview || (p.role === 'child' ? t('chat.child') : t('chat.parent'))}
                timeLabel={formatThreadTime(meta.at)}
                unreadCount={unreadByChat[dmId] || 0}
                onPress={() => openDm(p)}
                avatar={(
                  <AvatarBubble
                    avatarId={p.avatarId}
                    photoURL={p.photoURL}
                    name={p.name}
                    size={AVATAR}
                  />
                )}
              />
            );
          })}

          {(friendPeople || []).length > 0 ? (
            <>
              <Text style={[styles.section, styles.sectionGap, isDesktop && styles.sectionDesk]}>{t('friend.sectionFriends')}</Text>
              {friendPeople.map((p) => (
                <ThreadRow
                  key={`friend-${p.uid}`}
                  name={p.name}
                  preview={t('friend.friendLabel')}
                  onPress={() => openDm(p)}
                  avatar={(
                    <AvatarBubble
                      avatarId={p.avatarId}
                      photoURL={p.photoURL}
                      name={p.name}
                      size={AVATAR}
                    />
                  )}
                />
              ))}
            </>
          ) : null}
          <View style={{ height: 24 }} />
        </ScrollView>
      </View>

      <Modal
        visible={pickerOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'fade'}
        onRequestClose={() => { setPickerOpen(false); setPickerQuery(''); }}
      >
        <Pressable
          style={[styles.overlay, isDesktop && desktopOverlay]}
          onPress={() => { setPickerOpen(false); setPickerQuery(''); }}
        >
          <Pressable style={[styles.sheet, isDesktop && desktopSheet]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>{t('chat.newChat')}</Text>
            {showAiChat ? (
              <TouchableOpacity style={styles.pickRow} onPress={openAi}>
                <View style={[styles.groupAv, styles.aiAv]}>
                  <Ionicons name="sparkles" size={18} color={colors.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickName}>{t('chat.aiChat')}</Text>
                  <Text style={styles.pickSub}>{t('chat.aiPreview')}</Text>
                </View>
              </TouchableOpacity>
            ) : null}
            {showPickerSearch ? (
              <View style={styles.pickerSearchWrap}>
                <Ionicons name="search-outline" size={16} color={colors.muted} />
                <TextInput
                  style={styles.pickerSearch}
                  value={pickerQuery}
                  onChangeText={setPickerQuery}
                  placeholder="Søk…"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {pickerQuery ? (
                  <TouchableOpacity onPress={() => setPickerQuery('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.sheetSection}>{t('friend.sectionFamily')}</Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {filteredPickerOthers.map((p) => (
                <TouchableOpacity key={p.uid} style={styles.pickRow} onPress={() => openDm(p)}>
                  <AvatarBubble avatarId={p.avatarId} photoURL={p.photoURL} name={p.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{p.name}</Text>
                    <Text style={styles.pickSub}>{p.role === 'child' ? t('chat.child') : t('chat.parent')}</Text>
                  </View>
                </TouchableOpacity>
              ))}
              {filteredPickerFriends.length > 0 ? (
                <>
                  <Text style={styles.sheetSection}>{t('friend.sectionFriends')}</Text>
                  {filteredPickerFriends.map((p) => (
                    <TouchableOpacity key={`f-${p.uid}`} style={styles.pickRow} onPress={() => openDm(p)}>
                      <AvatarBubble avatarId={p.avatarId} photoURL={p.photoURL} name={p.name} size={36} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickName}>{p.name}</Text>
                        <Text style={styles.pickSub}>{t('friend.friendLabel')}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </>
              ) : null}
            </ScrollView>
            {others.length === 0 && friends.length === 0 ? (
              <Text style={styles.empty}>{t('chat.noRecipients')}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setPickerOpen(false); setPickerQuery(''); }}
            >
              <Text style={styles.cancelTxt}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bgWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    zIndex: 0,
  },
  bgArt: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  wrap: { flex: 1, paddingHorizontal: 12, paddingTop: 2, zIndex: 1, backgroundColor: 'transparent' },
  wrapDesk: { maxWidth: 680, paddingTop: 4 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    minHeight: 32,
  },
  pageTitle: { fontSize: 20, fontWeight: '700', color: colors.ink },
  pageSub: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 1 },
  composeBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: 'auto',
  },
  composeBtnDesk: { borderRadius: 8 },
  section: {
    fontSize: 11, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.5,
    paddingTop: 8, paddingBottom: 2, paddingHorizontal: 4,
  },
  sectionDesk: { fontWeight: '600', letterSpacing: 0.42 },
  sectionGap: { marginTop: 6 },
  list: { flex: 1, backgroundColor: 'transparent' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  avWrap: { width: AVATAR, height: AVATAR },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 },
  name: { flex: 1, fontWeight: '700', fontSize: 14, color: colors.ink },
  time: { fontSize: 11, fontWeight: '600', color: colors.muted },
  preview: { flex: 1, color: colors.muted, fontWeight: '500', fontSize: 12 },
  previewUnread: { color: colors.ink, fontWeight: '700' },
  unreadBadge: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: '#e11d48', alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  groupAv: {
    width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2,
    backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center',
  },
  aiAv: { backgroundColor: '#f3e8ff' },
  groupEmoji: { fontSize: 16 },
  empty: { padding: 14, color: colors.muted, fontWeight: '600', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    padding: 16, maxHeight: '75%',
  },
  sheetTitle: { fontWeight: '900', fontSize: 17, color: colors.ink, marginBottom: 8 },
  sheetSection: {
    fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.5, marginTop: 10, marginBottom: 4,
  },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f4f6f8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line || '#e5e7eb',
  },
  pickerSearch: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  pickName: { fontWeight: '700', fontSize: 14, color: colors.ink },
  pickSub: { color: colors.muted, fontWeight: '500', fontSize: 11, marginTop: 1 },
  cancelBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 10 },
  cancelTxt: { fontWeight: '700', color: colors.muted, fontSize: 14 },
});
