import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Screen } from '../../components/ui';
import { AvatarBubble } from '../../components/AvatarPicker';
import { friendChatId, otherUidFromFriendChatId } from '../../src/utils/friendsLogic';
import { formatMessageStamp } from '../../src/utils/aiChats';
import { useChatDock, useChatDockPreferred } from '../../src/context/ChatDockContext';

/**
 * Native / full-screen fallback for friend DMs.
 * On web, always hand off to ChatDock (same look + layout as family member chat).
 */
export default function FriendChatThreadScreen() {
  const nav = useNavigation();
  const { params } = useRoute();
  const { t } = useI18n();
  const { uid, activeProfile, meParent, meChild } = useApp();
  const dockPreferred = useChatDockPreferred();
  const { openThread } = useChatDock();

  const chatId = params?.chatId || friendChatId(uid, params?.friendUid);
  const friendUid = useMemo(
    () => params?.friendUid || otherUidFromFriendChatId(chatId, uid) || null,
    [params?.friendUid, chatId, uid],
  );
  const title = params?.title || t('friend.chat');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const redirected = useRef(false);

  const myName = activeProfile?.name || meParent?.name || meChild?.name || '';

  // Web: never show the old full-screen friend thread — open ChatDock and leave this route.
  useEffect(() => {
    if (!dockPreferred || redirected.current || !chatId) return;
    if (!friendUid && !params?.friendUid) {
      // Still wait for uid so we can derive friendUid from chatId.
      if (!uid) return;
    }
    const resolvedFriend = friendUid || params?.friendUid;
    if (!resolvedFriend) return;
    redirected.current = true;
    openThread({
      kind: 'friend',
      friendUid: resolvedFriend,
      chatId,
      title,
      memberIds: uid ? [uid, resolvedFriend] : [resolvedFriend],
      photoURL: params?.photoURL || null,
      avatarId: params?.avatarId || null,
    });
    // Drop /my-friends/chat/... from the address bar so linking does not bounce
    // back onto this full-screen route after we hand off to ChatDock.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        const next = `${window.location.origin}/hjem`;
        window.history.replaceState(window.history.state || {}, '', next);
      } catch { /* ignore */ }
    }
    try {
      nav.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'Home' }],
        }),
      );
    } catch {
      if (nav.canGoBack?.()) nav.goBack();
      else nav.navigate('Home');
    }
  }, [dockPreferred, friendUid, chatId, title, uid, openThread, nav, params]);

  const loadMessages = useCallback(async () => {
    if (!friendUid && !chatId) return;
    try {
      const fn = httpsCallable(functions, 'listFriendChatMessagesAdmin');
      const res = await fn({ friendUid, chatId });
      if (res?.data?.ok) setMessages(res.data.messages || []);
    } catch { /* ignore */ }
  }, [friendUid, chatId]);

  useEffect(() => {
    if (dockPreferred) return undefined;
    loadMessages();
    const id = setInterval(loadMessages, 4000);
    return () => clearInterval(id);
  }, [loadMessages, dockPreferred]);

  const send = async () => {
    if (!text.trim() || sending || !uid || !friendUid) return;
    setSending(true);
    try {
      const fn = httpsCallable(functions, 'sendFriendChatAdmin');
      const res = await fn({
        friendUid,
        text: text.trim(),
        senderName: myName,
      });
      if (res?.data?.ok) {
        setText('');
        await loadMessages();
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false);
    }
  };

  if (dockPreferred) {
    return (
      <Screen>
        <View style={styles.handoff}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.head}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          <AvatarBubble
            photoURL={params?.photoURL}
            avatarId={params?.avatarId}
            name={title}
            size={32}
          />
          <View style={styles.headText}>
            <Text style={styles.headTitle} numberOfLines={1}>{title}</Text>
            <Text style={styles.headSub} numberOfLines={1}>{t('tabs.chat')}</Text>
          </View>
          <TouchableOpacity onPress={() => nav.goBack()} hitSlop={8} accessibilityLabel="Lukk">
            <Ionicons name="close" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => listRef.current?.scrollToEnd?.({ animated: true })}
          renderItem={({ item }) => {
            const mine = item.senderId === uid;
            return (
              <View style={[styles.row, mine && styles.rowMine]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  {!mine && item.senderName ? (
                    <Text style={styles.sender}>{item.senderName}</Text>
                  ) : null}
                  <Text style={[styles.msgTxt, mine && styles.msgTxtMine]}>{item.text}</Text>
                  <Text style={[styles.stamp, mine && styles.stampMine]}>
                    {formatMessageStamp(item.createdAt || item.createdAtMs)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={(
            <Text style={styles.empty}>{t('friend.chatEmpty')}</Text>
          )}
        />

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t('friend.chatPlaceholder') || t('chat.placeholder')}
            placeholderTextColor="#8b98a5"
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!text.trim() || sending}
            accessibilityLabel={t('chat.send')}
          >
            <Ionicons name="send" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  handoff: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.brand,
    minHeight: 52,
  },
  backBtn: { padding: 2 },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  headSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  list: { padding: 10, paddingBottom: 20, flexGrow: 1, backgroundColor: colors.card },
  empty: { textAlign: 'center', color: colors.muted, marginTop: 40 },
  row: { alignItems: 'flex-start', marginBottom: 6 },
  rowMine: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleMine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: '#eef1f4', borderBottomLeftRadius: 4 },
  sender: { fontSize: 11, fontWeight: '700', color: colors.muted, marginBottom: 2 },
  msgTxt: { fontSize: 14, fontWeight: '500', color: colors.ink, lineHeight: 19 },
  msgTxtMine: { color: '#fff' },
  stamp: { fontSize: 10, color: colors.muted, marginTop: 4, fontWeight: '600' },
  stampMine: { color: 'rgba(255,255,255,0.8)' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eff3f4',
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 80,
    borderRadius: 18,
    backgroundColor: '#f0f2f5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.ink,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.45 },
});
