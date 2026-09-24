import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Image, ActivityIndicator, Platform, ScrollView, Animated, PanResponder,
  Pressable, useWindowDimensions, KeyboardAvoidingView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addDoc, collection, doc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db, auth, functions } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { useUnread } from '../src/context/NotificationContext';
import { useChatDock, useChatDockPreferred } from '../src/context/ChatDockContext';
import { colors } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';
import { formatMessageStamp } from '../src/utils/aiChats';
import { setOpenChatId } from '../src/utils/openChat';
import { markChatNotificationsSeen, notifyUsers } from '../src/utils/notifications';
import {
  markChatRead, resolveChatRecipients, stampChatMessage, uniqueMemberIds,
  ensureChatDoc, listenChatMessages,
} from '../src/utils/chats';
import {
  listenFriendChatMessages,
  listFriendChatMessagesViaAdmin,
  markFriendChatRead,
  sendFriendChatMessage,
} from '../src/utils/friendChats';
import { isChildAiAllowed } from '../src/utils/childApps';
import { getAppNav } from '../src/navigation/navRef';
import { pickImage, uploadImage, alertPhotoError } from '../src/utils/media';
import { useParentBottomNavChrome } from '../src/hooks/useParentBottomNavChrome';
import { httpsCallable } from 'firebase/functions';
import { otherUidFromFriendChatId, isFriendChatNavPayload, friendChatId } from '../src/utils/friendsLogic';
import {
  isChatFabDrag,
  pointerClientPoint,
  shouldOpenChatOnFabRelease,
  chatFabSlopForPointerType,
  CHAT_FAB_TAP_SLOP,
} from '../src/utils/chatFabGesture';
import {
  CHAT_WINDOW_TOP,
  CHAT_WINDOW_BOTTOM,
  chatDrawerBottomInset,
} from '../src/utils/chatDockLayout';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch {}
}

const PANEL_W = 340;
const GAP = 12;
const PILL_H = 44;
const PILL_GAP = 8;
const DOCK_RIGHT = 16;
const FAB_BOTTOM = 16;
const PILL_STACK_BOTTOM = 72;
const PILL_COL_W = 200;

function DockBubble({ item, mine }) {
  const { t } = useI18n();
  if (item.deleted) {
    return (
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs, styles.deletedBubble]}>
        {!mine && <Text style={styles.who}>{item.senderName}</Text>}
        <Text style={styles.deletedTxt}>{t('chat.messageDeleted')}</Text>
      </View>
    );
  }
  const isImage = item.type === 'image' && item.imageUrl;
  return (
    <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
      {!mine && <Text style={styles.who}>{item.senderName}</Text>}
      {isImage ? (
        <Image source={{ uri: item.imageUrl }} style={styles.chatImage} resizeMode="cover" />
      ) : null}
      {!!item.text && (
        <Text style={[styles.body, mine && styles.bodyMine]}>{item.text}</Text>
      )}
      {isImage && !item.text ? (
        <Text style={[styles.body, mine && styles.bodyMine]}>{t('chat.imageSent')}</Text>
      ) : null}
      <Text style={[styles.stamp, mine && styles.stampMine]}>
        {formatMessageStamp(item.createdAt || item.createdAtMs)}
      </Text>
    </View>
  );
}

function ChatDockPanel({
  window: win, openIndexFromRight = 0, minimizedStackIndex = 0,
  hasMinimizedColumn = false, onClose, onMinimize, drawer = false, onBack = null,
}) {
  const {
    uid, user, meChild, familyId: appFamilyId, family, members,
  } = useApp();
  const isFriend = isFriendChatNavPayload(win) || win.kind === 'friend' || !!win.friendUid;
  const familyId = isFriend ? null : (win.familyId || appFamilyId);
  const chatId = win.chatId;
  const effectiveUid = uid || auth.currentUser?.uid || null;
  const friendUid = win.friendUid
    || (isFriend && effectiveUid && chatId
      ? otherUidFromFriendChatId(chatId, effectiveUid)
      : null);
  const { markChatSeen } = useUnread();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [memberIds, setMemberIds] = useState(win.memberIds || []);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const name = meChild?.name || user?.displayName || (user?.email || '').split('@')[0] || 'Meg';

  useEffect(() => {
    if (win.minimized) return undefined;
    setOpenChatId(chatId || null);
    if (effectiveUid && chatId) {
      markChatSeen(chatId).catch(() => {});
      markChatNotificationsSeen(effectiveUid, chatId).catch(() => {});
      if (isFriend) markFriendChatRead(chatId, effectiveUid).catch(() => {});
      else if (familyId) markChatRead(familyId, chatId, effectiveUid).catch(() => {});
    }
    return () => setOpenChatId(null);
  }, [chatId, effectiveUid, familyId, isFriend, markChatSeen, win.minimized]);

  useEffect(() => {
    if (isFriend || !familyId || !chatId) return undefined;
    return onSnapshot(doc(db, 'families', familyId, 'chats', chatId), (snap) => {
      if (snap.exists()) {
        const live = uniqueMemberIds(snap.data()?.memberIds);
        if (live.length) setMemberIds(live);
      }
    });
  }, [familyId, chatId, isFriend]);

  useEffect(() => {
    if (!chatId || win.minimized) return undefined;
    if (isFriend) {
      return listenFriendChatMessages(chatId, (next) => {
        setMsgs(next);
        setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 40);
      }, {
        uid: effectiveUid,
        friendUid,
      });
    }
    if (!familyId) return undefined;
    return listenChatMessages(
      familyId,
      chatId,
      effectiveUid,
      (next) => {
        setMsgs(next);
        setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 40);
      },
      () => setMsgs([]),
    );
  }, [familyId, chatId, effectiveUid, friendUid, win.minimized, isFriend]);

  const recipientIdsFor = (senderUid) => resolveChatRecipients({
    chatId,
    senderUid,
    memberIds,
    paramMemberIds: win.memberIds,
    familyMemberIds: Array.isArray(family?.members) ? family.members : [],
    contextMemberIds: (members || []).map((m) => m.uid),
  });

  const sendFriendViaAdmin = async (msg) => {
    const fn = httpsCallable(functions, 'sendFriendChatAdmin');
    const res = await fn({
      friendUid,
      text: msg,
      senderName: name,
    });
    if (!res?.data?.ok) throw new Error(res?.data?.error || 'send-failed');
  };

  const sendMessage = async (payload) => {
    const senderUid = effectiveUid;
    if (!senderUid) {
      throw new Error('missing sender');
    }

    if (isFriend) {
      if (!chatId || !friendUid) throw new Error('missing chat target');
      const body = payload.type === 'image'
        ? (payload.text?.trim() || '')
        : payload.text;
      // Prefer Admin for text (creates chat doc if missing); client for images.
      if (payload.type === 'image' && payload.imageUrl) {
        try {
          await sendFriendChatMessage({
            chatId,
            senderUid,
            senderName: name,
            text: body,
            type: 'image',
            imageUrl: payload.imageUrl,
            imagePath: payload.imagePath || null,
          });
        } catch {
          const fallback = String(body || '').trim() || t('chat.imageSent');
          await sendFriendViaAdmin(fallback);
        }
        return;
      }
      try {
        await sendFriendViaAdmin(String(body || '').trim());
      } catch {
        await sendFriendChatMessage({
          chatId,
          senderUid,
          senderName: name,
          text: body,
          type: 'text',
        });
      }
      return;
    }

    if (!familyId || !chatId) {
      throw new Error('missing chat target');
    }
    // Sørg for at chat-dokumentet finnes før første melding (f.eks. familie fra skuff).
    try {
      await ensureChatDoc(familyId, chatId, {
        type: String(chatId).startsWith('dm_') ? 'dm'
          : String(chatId).startsWith('g_') ? 'group'
            : 'family',
        title: win.title || 'Chat',
        memberIds: memberIds.length ? memberIds : (win.memberIds || []),
      });
    } catch { /* sending may still succeed */ }
    const msgRef = await addDoc(collection(db, 'families', familyId, 'chats', chatId, 'messages'), {
      senderId: senderUid,
      senderName: name,
      createdAt: serverTimestamp(),
      ...payload,
    });
    const preview = payload.type === 'image'
      ? (payload.text?.trim() || t('chat.imageSent'))
      : payload.text;
    const recipients = recipientIdsFor(senderUid);
    const isDm = String(chatId || '').startsWith('dm_');
    const isGroup = String(chatId || '').startsWith('g_');
    const stampIds = uniqueMemberIds(
      isDm || isGroup
        ? [senderUid, ...recipients, ...(memberIds || []), ...(win.memberIds || [])]
        : [
          senderUid, ...recipients, ...(memberIds || []), ...(win.memberIds || []),
          ...(Array.isArray(family?.members) ? family.members : []),
          ...(members || []).map((m) => m.uid),
        ],
    );
    try {
      await stampChatMessage(familyId, chatId, {
        senderId: senderUid,
        text: preview,
        memberIds: stampIds,
        unreadFor: recipients.length ? recipients : undefined,
        messageId: msgRef.id,
      });
    } catch { /* ignore */ }
    try {
      await notifyUsers(recipients, {
        eventType: 'messageReceived',
        title: t('chat.newMessage'),
        body: preview,
        familyId,
        chatId,
        createdBy: senderUid,
        notificationId: `msg_${msgRef.id}`,
      });
    } catch { /* ignore */ }
  };

  const refreshFriendMsgs = async () => {
    if (!isFriend || !chatId) return;
    try {
      const next = await listFriendChatMessagesViaAdmin({ chatId, friendUid });
      setMsgs(next);
      setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 40);
    } catch { /* live listener / next poll will catch up */ }
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || sending) return;
    if (!isFriend && (!familyId || !chatId)) return;
    if (isFriend && (!chatId || !friendUid)) return;
    setSending(true);
    setText('');
    try {
      await sendMessage({ type: 'text', text: msg });
      // Admin send can succeed while client onSnapshot is still recovering —
      // pull immediately so the sender sees their own message.
      if (isFriend) await refreshFriendMsgs();
    } catch (err) {
      console.warn('[chat] send failed', err?.code || err?.message || err);
      setText(msg);
      Alert.alert(
        'Kunne ikke sende',
        'Meldingen ble ikke sendt. Prøv igjen.',
      );
    } finally {
      setSending(false);
    }
  };

  const attachImage = async () => {
    if (uploading || !chatId) return;
    if (!isFriend && !familyId) return;
    try {
      const picked = await pickImage({ camera: false });
      if (!picked?.uri) return;
      setUploading(true);
      const path = isFriend
        ? `friendChats/${chatId}/attachments/${Date.now()}.jpg`
        : `families/${familyId}/chats/${chatId}/attachments/${Date.now()}.jpg`;
      const imageUrl = await uploadImage(path, picked);
      const caption = text.trim();
      setText('');
      try {
        await sendMessage({ type: 'image', imageUrl, imagePath: path, text: caption });
        if (isFriend) await refreshFriendMsgs();
      } catch (err) {
        console.warn('[chat] image send failed', err?.code || err?.message || err);
        setText(caption);
        throw err;
      }
    } catch (err) {
      alertPhotoError(err, t);
    } finally {
      setUploading(false);
    }
  };

  if (win.minimized && !drawer) {
    const bottom = PILL_STACK_BOTTOM + minimizedStackIndex * (PILL_H + PILL_GAP);
    return (
      <TouchableOpacity
        style={[styles.pill, { right: DOCK_RIGHT, bottom }]}
        onPress={() => onMinimize(false)}
        accessibilityRole="button"
        accessibilityLabel={win.title}
      >
        <AvatarBubble
          photoURL={win.photoURL}
          avatarId={win.avatarId}
          name={win.title}
          size={28}
        />
        <Text style={styles.pillTxt} numberOfLines={1}>{win.title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Lukk">
          <Ionicons name="close" size={16} color="#fff" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  const columnOffset = hasMinimizedColumn ? (PILL_COL_W + GAP) : 0;
  const right = DOCK_RIGHT + columnOffset + openIndexFromRight * (PANEL_W + GAP);

  const body = (
    <>
      <View style={styles.head}>
        {drawer && onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityLabel="Tilbake">
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <AvatarBubble
          photoURL={win.photoURL}
          avatarId={win.avatarId}
          name={win.title}
          size={32}
        />
        <View style={styles.headText}>
          <Text style={styles.headTitle} numberOfLines={1}>{win.title}</Text>
          <Text style={styles.headSub} numberOfLines={1}>{t('tabs.chat')}</Text>
        </View>
        {!drawer ? (
          <TouchableOpacity onPress={() => onMinimize(true)} hitSlop={8} accessibilityLabel="Minimer">
            <Ionicons name="remove" size={20} color="#fff" />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Lukk">
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          ref={listRef}
          style={styles.list}
          data={msgs}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.listInner}
          renderItem={({ item }) => (
            <View style={[styles.row, item.senderId === effectiveUid && styles.rowMine]}>
              <DockBubble item={item} mine={item.senderId === effectiveUid} />
            </View>
          )}
          keyboardShouldPersistTaps="handled"
        />
      </View>

      <View style={styles.composer}>
        <TouchableOpacity onPress={attachImage} disabled={uploading} style={styles.iconBtn}>
          {uploading
            ? <ActivityIndicator size="small" color={colors.brand} />
            : <Ionicons name="image-outline" size={22} color={colors.brand} />}
        </TouchableOpacity>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('chat.placeholder')}
          placeholderTextColor="#8b98a5"
          style={styles.input}
          onSubmitEditing={send}
          returnKeyType="send"
          blurOnSubmit
        />
        <TouchableOpacity
          onPress={send}
          disabled={sending || !text.trim()}
          style={[styles.sendBtn, (sending || !text.trim()) && styles.sendBtnDisabled]}
          accessibilityLabel={t('chat.send')}
        >
          {sending
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="send" size={16} color="#fff" />}
        </TouchableOpacity>
      </View>
    </>
  );

  if (drawer) {
    return (
      <KeyboardAvoidingView
        style={styles.drawerPanel}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        accessibilityRole="dialog"
      >
        {body}
      </KeyboardAvoidingView>
    );
  }

  return (
    <View
      style={[styles.panel, { right }]}
      accessibilityRole="dialog"
    >
      {body}
    </View>
  );
}

function ComposePicker({ onClose, onPick, drawer = false }) {
  const { t } = useI18n();
  const {
    familyId, family, members, uid, isChild, meChild, friendPeople,
  } = useApp();
  const { unreadByChat } = useUnread();
  const [query, setQuery] = useState('');
  const showAiChat = !isChild || isChildAiAllowed(meChild);
  const others = useMemo(
    () => (members || []).filter((m) => m.uid && m.uid !== uid),
    [members, uid],
  );
  const friends = useMemo(
    () => (friendPeople || []).filter((p) => p.uid && p.uid !== uid),
    [friendPeople, uid],
  );
  const memberIdList = useMemo(
    () => uniqueMemberIds([
      ...(members || []).map((m) => m.uid),
      ...(Array.isArray(family?.members) ? family.members : []),
    ]),
    [members, family?.members],
  );

  const contactCount = 1 + others.length + friends.length; // family row + people
  const showSearch = contactCount > 8;
  const q = query.trim().toLowerCase();
  const filterName = (name) => !q || String(name || '').toLowerCase().includes(q);
  const filteredOthers = useMemo(
    () => others.filter((p) => filterName(p.name)),
    [others, q],
  );
  const filteredFriends = useMemo(
    () => friends.filter((p) => filterName(p.name) || filterName(p.username)),
    [friends, q],
  );
  const familyName = family?.name || 'Familien';
  const showFamilyRow = !q || filterName(familyName);

  const openAi = () => {
    onClose?.();
    const nav = getAppNav();
    if (nav?.navigate) {
      nav.navigate('AiChat');
      return;
    }
  };

  const openFriend = async (p) => {
    if (!uid || !p?.uid) return;
    try {
      const { ensureFriendChatDoc } = await import('../src/utils/friendChats');
      const { friendChatId } = await import('../src/utils/friendsLogic');
      let chatId = friendChatId(uid, p.uid);
      try {
        chatId = await ensureFriendChatDoc(uid, p.uid, {
          title: p.name || 'Chat',
          names: { [uid]: '', [p.uid]: p.name || '' },
        }) || chatId;
      } catch { /* Admin path still works when sending */ }
      onPick({
        kind: 'friend',
        friendUid: p.uid,
        chatId,
        title: p.name || t('friend.chat'),
        memberIds: [uid, p.uid],
        photoURL: p.photoURL || p.photoUrl || null,
        avatarId: p.avatarId || null,
      });
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    }
  };

  return (
    <View style={drawer ? styles.drawerCompose : styles.composeCard}>
      <View style={styles.composeHead}>
        <Text style={styles.composeTitle}>
          {drawer ? (t('tabs.chat') || 'Chat') : t('chat.newChat')}
        </Text>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>
      {drawer ? (
        <Text style={styles.composeHint}>Velg familie eller kontakt</Text>
      ) : null}
      {showSearch ? (
        <View style={styles.composeSearchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.muted} />
          <TextInput
            style={styles.composeSearch}
            value={query}
            onChangeText={setQuery}
            placeholder="Søk…"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      <ScrollView style={styles.drawerComposeScroll}>
        {showAiChat && (!q || filterName(t('chat.aiChat'))) ? (
          <TouchableOpacity
            style={styles.composeRow}
            onPress={openAi}
            accessibilityRole="button"
            accessibilityLabel={t('chat.aiChat')}
          >
            <View style={[styles.groupAv, styles.aiAv]}>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.composeName}>{t('chat.aiChat')}</Text>
              <Text style={styles.composeSub} numberOfLines={1}>{t('chat.aiPreview')}</Text>
            </View>
          </TouchableOpacity>
        ) : null}

        {showFamilyRow || filteredOthers.length > 0 ? (
          <Text style={styles.composeSection}>{t('friend.sectionFamily')}</Text>
        ) : null}

        {showFamilyRow ? (
          <TouchableOpacity
            style={styles.composeRow}
            onPress={async () => {
              await ensureChatDoc(familyId, 'family', {
                type: 'family',
                title: familyName,
                memberIds: memberIdList,
              });
              onPick({
                familyId,
                chatId: 'family',
                title: familyName,
                memberIds: memberIdList,
              });
            }}
          >
            <View style={[styles.groupAv, { backgroundColor: colors.brandSoft }]}>
              <Ionicons name="people" size={18} color={colors.brand} />
            </View>
            <Text style={styles.composeName}>{familyName}</Text>
          </TouchableOpacity>
        ) : null}

        {filteredOthers.map((p) => (
          <TouchableOpacity
            key={p.uid}
            style={styles.composeRow}
            onPress={async () => {
              const id = ['dm', ...[uid, p.uid].sort()].join('_');
              await ensureChatDoc(familyId, id, {
                type: 'dm',
                title: p.name,
                memberIds: [uid, p.uid],
              });
              onPick({
                familyId,
                chatId: id,
                title: p.name,
                memberIds: [uid, p.uid],
                photoURL: p.photoURL || p.photoUrl,
                avatarId: p.avatarId,
              });
            }}
          >
            <AvatarBubble
              photoURL={p.photoURL || p.photoUrl}
              avatarId={p.avatarId}
              name={p.name}
              size={36}
            />
            <Text style={styles.composeName}>{p.name}</Text>
          </TouchableOpacity>
        ))}

        {filteredFriends.length > 0 ? (
          <Text style={[styles.composeSection, styles.composeSectionGap]}>
            {t('friend.sectionFriends')}
          </Text>
        ) : null}

        {filteredFriends.map((p) => {
          const fChatId = friendChatId(uid, p.uid);
          const unread = Number(unreadByChat?.[fChatId]) || 0;
          return (
            <TouchableOpacity
              key={`friend-${p.uid}`}
              style={styles.composeRow}
              onPress={() => openFriend(p)}
              accessibilityRole="button"
            >
              <AvatarBubble
                photoURL={p.photoURL || p.photoUrl}
                avatarId={p.avatarId}
                name={p.name}
                size={36}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.composeName}>{p.name}</Text>
                {p.username ? (
                  <Text style={styles.composeSub} numberOfLines={1}>@{p.username}</Text>
                ) : (
                  <Text style={styles.composeSub} numberOfLines={1}>{t('friend.friendLabel')}</Text>
                )}
              </View>
              {unread > 0 ? (
                <View style={styles.composeUnread}>
                  <Text style={styles.composeUnreadTxt}>{unread > 9 ? '9+' : String(unread)}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}

        {q && !showFamilyRow && filteredOthers.length === 0 && filteredFriends.length === 0 ? (
          <Text style={styles.composeEmpty}>Ingen treff</Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const FAB_SIZE = 56;
const FAB_MARGIN = 16;
const DRAWER_WIDTH_RATIO = 0.8;

function clampFabPos(x, y, winW, winH, extraBottom = 0) {
  return {
    x: Math.min(Math.max(FAB_MARGIN, x), Math.max(FAB_MARGIN, winW - FAB_SIZE - FAB_MARGIN)),
    y: Math.min(
      Math.max(FAB_MARGIN, y),
      Math.max(FAB_MARGIN, winH - FAB_SIZE - FAB_MARGIN - 24 - extraBottom),
    ),
  };
}

function defaultFabPos(winW, winH, extraBottom = 0) {
  return clampFabPos(
    winW - FAB_SIZE - FAB_MARGIN,
    winH - FAB_SIZE - FAB_MARGIN - 24 - extraBottom,
    winW,
    winH,
    extraBottom,
  );
}

function readAnimatedPos(pan) {
  const x = typeof pan.x.__getValue === 'function' ? pan.x.__getValue() : pan.x._value;
  const y = typeof pan.y.__getValue === 'function' ? pan.y.__getValue() : pan.y._value;
  return { x, y };
}

/**
 * Mobile web: real HTML button + native pointer listeners.
 * RN Animated.View / onPointerDown / PanResponder swallow taps (the FAB
 * could be dragged but clicking it did nothing). Same recipe as MailPaneResizeHandle.
 */
function WebMovableChatFab({ onPress, open, label }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const extraBottom = useParentBottomNavChrome();
  const [pos, setPos] = useState(() => defaultFabPos(winW, winH, extraBottom));
  const nodeRef = useRef(null);
  const posRef = useRef(pos);
  posRef.current = pos;
  const dimsRef = useRef({ winW, winH, extraBottom });
  dimsRef.current = { winW, winH, extraBottom };
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  useEffect(() => {
    const next = clampFabPos(posRef.current.x, posRef.current.y, winW, winH, extraBottom);
    posRef.current = next;
    setPos(next);
  }, [winW, winH, extraBottom]);

  useEffect(() => {
    const el = nodeRef.current;
    if (!el || typeof el.addEventListener !== 'function' || typeof window === 'undefined') {
      return undefined;
    }

    const start = { x: 0, y: 0, pointerX: 0, pointerY: 0 };
    let dragging = false;
    let moved = false;
    let openedFromPointer = false;
    let openedAt = 0;
    let activePointerId = null;
    let slop = CHAT_FAB_TAP_SLOP;

    const applyPos = (next) => {
      posRef.current = next;
      el.style.left = `${next.x}px`;
      el.style.top = `${next.y}px`;
    };

    const firePress = () => {
      const now = Date.now();
      if (now - openedAt < 400) return;
      openedAt = now;
      onPressRef.current?.();
    };

    const onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button != null && e.button !== 0) return;
      e.stopPropagation();
      const pt = pointerClientPoint(e);
      if (!pt.valid) return;
      dragging = true;
      moved = false;
      openedFromPointer = false;
      activePointerId = e.pointerId;
      slop = chatFabSlopForPointerType(e.pointerType);
      start.x = posRef.current.x;
      start.y = posRef.current.y;
      start.pointerX = pt.x;
      start.pointerY = pt.y;
      try { el.setPointerCapture?.(e.pointerId); } catch { /* ignore */ }
    };

    const onMove = (e) => {
      if (!dragging) return;
      if (activePointerId != null && e.pointerId !== activePointerId) return;
      const pt = pointerClientPoint(e);
      // Android Chrome often emits move events with missing coords (0,0) —
      // treating those as real moves marked every tap as a drag.
      if (!pt.valid) return;
      const dx = pt.x - start.pointerX;
      const dy = pt.y - start.pointerY;
      if (isChatFabDrag(dx, dy, slop)) moved = true;
      if (!moved) return;
      e.preventDefault();
      const { winW: w, winH: h, extraBottom: bottom } = dimsRef.current;
      applyPos(clampFabPos(start.x + dx, start.y + dy, w, h, bottom));
    };

    const onUp = (e) => {
      if (!dragging) return;
      if (activePointerId != null && e.pointerId !== activePointerId) return;
      dragging = false;
      activePointerId = null;
      try { el.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
      const { winW: w, winH: h, extraBottom: bottom } = dimsRef.current;
      const next = clampFabPos(posRef.current.x, posRef.current.y, w, h, bottom);
      applyPos(next);
      setPos(next);
      if (shouldOpenChatOnFabRelease({ moved })) {
        openedFromPointer = true;
        firePress();
      }
    };

    const onClick = (e) => {
      e.stopPropagation();
      if (moved || openedFromPointer) {
        e.preventDefault();
        return;
      }
      firePress();
    };

    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        firePress();
      }
    };

    el.addEventListener('pointerdown', onDown, true);
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKey);
    window.addEventListener('pointermove', onMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
    return () => {
      el.removeEventListener('pointerdown', onDown, true);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('click', onClick);
      el.removeEventListener('keydown', onKey);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
    };
  }, []);

  return (
    <button
      ref={nodeRef}
      type="button"
      aria-label={label}
      data-testid="chat-fab"
      style={{
        position: 'absolute',
        left: pos.x,
        top: pos.y,
        zIndex: 3,
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        border: 'none',
        padding: 0,
        margin: 0,
        background: colors.brand,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        boxShadow: '0 6px 20px rgba(37, 99, 235, 0.45)',
        pointerEvents: 'auto',
        appearance: 'none',
        WebkitAppearance: 'none',
      }}
    >
      <span style={{ pointerEvents: 'none', display: 'flex' }}>
        <Ionicons name={open ? 'close' : 'chatbubbles'} size={26} color="#fff" />
      </span>
    </button>
  );
}

function NativeMovableChatFab({ onPress, open, label }) {
  const { width: winW, height: winH } = useWindowDimensions();
  const extraBottom = useParentBottomNavChrome();
  const startRef = useRef({ x: 0, y: 0 });
  const posRef = useRef(defaultFabPos(winW, winH, extraBottom));
  const movedRef = useRef(false);
  const pan = useRef(new Animated.ValueXY(posRef.current)).current;

  useEffect(() => {
    posRef.current = clampFabPos(posRef.current.x, posRef.current.y, winW, winH, extraBottom);
    pan.setValue(posRef.current);
  }, [winW, winH, pan, extraBottom]);

  const panHandlers = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      movedRef.current = false;
      startRef.current = { ...posRef.current };
    },
    onPanResponderMove: (_, g) => {
      // Only translate after drag threshold so small jitter still counts as a tap.
      if (!isChatFabDrag(g.dx, g.dy, chatFabSlopForPointerType('touch'))) return;
      movedRef.current = true;
      pan.setValue(clampFabPos(
        startRef.current.x + g.dx,
        startRef.current.y + g.dy,
        winW,
        winH,
        extraBottom,
      ));
    },
    onPanResponderRelease: () => {
      posRef.current = clampFabPos(
        readAnimatedPos(pan).x,
        readAnimatedPos(pan).y,
        winW,
        winH,
        extraBottom,
      );
      pan.setValue(posRef.current);
      if (shouldOpenChatOnFabRelease({ moved: movedRef.current })) onPress?.();
    },
    onPanResponderTerminate: () => {
      posRef.current = clampFabPos(
        readAnimatedPos(pan).x,
        readAnimatedPos(pan).y,
        winW,
        winH,
        extraBottom,
      );
      pan.setValue(posRef.current);
    },
  }), [onPress, pan, winW, winH, extraBottom]);

  return (
    <Animated.View
      style={[styles.mobileFab, { left: pan.x, top: pan.y }]}
      {...panHandlers.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={open ? 'close' : 'chatbubbles'} size={26} color="#fff" />
    </Animated.View>
  );
}

function MovableChatFab({ onPress, open }) {
  const { t } = useI18n();
  const label = open ? 'Lukk' : t('tabs.chat');
  if (Platform.OS === 'web') {
    return <WebMovableChatFab onPress={onPress} open={open} label={label} />;
  }
  return <NativeMovableChatFab onPress={onPress} open={open} label={label} />;
}

function useFullScreenChatRoute() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const nav = getAppNav();
    if (!nav?.addListener) return undefined;
    const BLOCKED = new Set(['FriendChatThread', 'ChatThread', 'AiChat']);
    const sync = () => {
      try {
        const name = nav.getCurrentRoute?.()?.name;
        setBlocked(BLOCKED.has(name));
      } catch {
        setBlocked(false);
      }
    };
    sync();
    const unsub = nav.addListener('state', sync);
    return unsub;
  }, []);
  return blocked;
}

/**
 * Facebook-stil chat-dock (desktop) / høyre-skuff + flyttbar FAB (mobil web).
 */
export default function ChatDockHost() {
  const preferred = useChatDockPreferred();
  const {
    windows, composeOpen, setComposeOpen,
    drawerOpen, closeDrawer, toggleDrawer,
    openThread, closeThread, minimizeThread, restoreThread,
    mobileDrawer,
  } = useChatDock();
  const { t } = useI18n();
  const { width: winW } = useWindowDimensions();
  const extraBottom = useParentBottomNavChrome();
  const slide = useRef(new Animated.Value(0)).current;
  const hideChrome = useFullScreenChatRoute();

  useEffect(() => {
    if (!mobileDrawer) return;
    Animated.timing(slide, {
      toValue: drawerOpen ? 1 : 0,
      duration: 240,
      // Web has no native driver — forcing it breaks gestures/taps on some browsers.
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [drawerOpen, mobileDrawer, slide]);

  if (!preferred) return null;
  // Full-screen chat routes: hide FAB/dock chrome so it cannot cover send/back controls.
  if (hideChrome && !drawerOpen && windows.every((w) => w.minimized)) return null;

  if (mobileDrawer) {
    const drawerW = Math.round(winW * DRAWER_WIDTH_RATIO);
    const drawerBottom = chatDrawerBottomInset(extraBottom);
    const activeWin = windows.find((w) => !w.minimized) || null;
    const translateX = slide.interpolate({
      inputRange: [0, 1],
      outputRange: [drawerW + 24, 0],
    });

    const content = (
      <View style={styles.host} pointerEvents="box-none">
        {drawerOpen ? (
          <Pressable
            style={styles.drawerBackdrop}
            onPress={closeDrawer}
            accessibilityLabel="Lukk"
          />
        ) : null}

        <Animated.View
          style={[
            styles.drawerShell,
            { width: drawerW, bottom: drawerBottom, transform: [{ translateX }] },
          ]}
          pointerEvents={drawerOpen ? 'auto' : 'none'}
        >
          {activeWin && !composeOpen ? (
            <ChatDockPanel
              window={{ ...activeWin, minimized: false }}
              drawer
              onBack={() => {
                closeThread(activeWin.chatId);
                setComposeOpen(true);
              }}
              onClose={closeDrawer}
              onMinimize={() => {}}
            />
          ) : (
            <ComposePicker
              drawer
              onClose={closeDrawer}
              onPick={(thread) => openThread(thread)}
            />
          )}
        </Animated.View>

        {!drawerOpen && !hideChrome ? (
          <MovableChatFab open={false} onPress={toggleDrawer} />
        ) : null}
      </View>
    );

    if (createPortal && typeof document !== 'undefined') {
      return createPortal(content, document.body);
    }
    return content;
  }

  const openWindows = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);
  const hasMinimizedColumn = minimized.length > 0;
  // Windows sit at bottom:16 — hide compose FAB so it cannot cover send.
  const hideFab = hideChrome || openWindows.length > 0 || composeOpen;

  const content = (
    <View style={styles.host} pointerEvents="box-none">
      {composeOpen && !hideChrome ? (
        <View style={[
          styles.composeWrap,
          hasMinimizedColumn && { right: DOCK_RIGHT + PILL_COL_W + GAP },
        ]}>
          <ComposePicker
            onClose={() => setComposeOpen(false)}
            onPick={(thread) => openThread(thread)}
          />
        </View>
      ) : null}

      {openWindows.map((w, i) => (
        <ChatDockPanel
          key={w.chatId}
          window={w}
          openIndexFromRight={openWindows.length - 1 - i}
          hasMinimizedColumn={hasMinimizedColumn}
          onClose={() => closeThread(w.chatId)}
          onMinimize={(min) => (min ? minimizeThread(w.chatId) : restoreThread(w.chatId))}
        />
      ))}

      {minimized.map((w, i) => (
        <ChatDockPanel
          key={`min-${w.chatId}`}
          window={w}
          minimizedStackIndex={i}
          onClose={() => closeThread(w.chatId)}
          onMinimize={(min) => (min ? minimizeThread(w.chatId) : restoreThread(w.chatId))}
        />
      ))}

      {!hideFab ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setComposeOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t('chat.newChat')}
        >
          <Ionicons name={composeOpen ? 'close' : 'create-outline'} size={22} color={colors.ink} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  if (createPortal && typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
}

const styles = StyleSheet.create({
  host: {
    ...Platform.select({
      web: { position: 'fixed', inset: 0, zIndex: 90000, pointerEvents: 'none' },
      default: { ...StyleSheet.absoluteFillObject, zIndex: 90000 },
    }),
  },
  /** Same floating frame for every thread: bottom-right, top near the header. */
  panel: {
    position: 'absolute',
    top: CHAT_WINDOW_TOP,
    right: DOCK_RIGHT,
    bottom: CHAT_WINDOW_BOTTOM,
    width: PANEL_W,
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    ...Platform.select({
      web: {
        pointerEvents: 'auto',
        boxShadow: '0 8px 28px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
      },
      default: {
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 6 },
      },
    }),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.brand,
    minHeight: 52,
  },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  headSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 1 },
  list: { flex: 1, minHeight: 0, backgroundColor: colors.card },
  listInner: { paddingHorizontal: 10, paddingVertical: 10, gap: 6 },
  row: { alignItems: 'flex-start', marginBottom: 6 },
  rowMine: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mine: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  theirs: { backgroundColor: '#eef1f4', borderBottomLeftRadius: 4 },
  deletedBubble: { opacity: 0.7 },
  who: { fontSize: 11, fontWeight: '700', color: colors.muted, marginBottom: 2 },
  body: { fontSize: 14, fontWeight: '500', color: colors.ink, lineHeight: 19 },
  bodyMine: { color: '#fff' },
  deletedTxt: { fontSize: 13, fontStyle: 'italic', color: colors.muted },
  stamp: { fontSize: 10, color: colors.muted, marginTop: 4, fontWeight: '600' },
  stampMine: { color: 'rgba(255,255,255,0.8)' },
  chatImage: { width: 180, height: 140, borderRadius: 10, marginBottom: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#eff3f4',
    backgroundColor: colors.card,
    flexShrink: 0,
    ...Platform.select({
      web: { pointerEvents: 'auto' },
      default: {},
    }),
  },
  iconBtn: { padding: 4 },
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
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 22,
    width: PILL_COL_W,
    height: PILL_H,
    ...Platform.select({
      web: { pointerEvents: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' },
      default: { elevation: 6 },
    }),
  },
  pillTxt: { color: '#fff', fontWeight: '700', fontSize: 13, flex: 1 },
  fab: {
    position: 'absolute',
    right: DOCK_RIGHT,
    bottom: FAB_BOTTOM,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...Platform.select({
      web: {
        pointerEvents: 'auto',
        cursor: 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.16)',
      },
      default: { elevation: 6 },
    }),
  },
  composeWrap: {
    position: 'absolute',
    top: CHAT_WINDOW_TOP,
    right: DOCK_RIGHT,
    bottom: CHAT_WINDOW_BOTTOM,
    width: PANEL_W,
    ...Platform.select({
      web: {
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
      },
      default: {},
    }),
  },
  composeCard: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
        display: 'flex',
        flexDirection: 'column',
      },
      default: { elevation: 8 },
    }),
  },
  composeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eff3f4',
  },
  composeTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  composeHint: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  composeSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f4f6f8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line || '#e5e7eb',
  },
  composeSearch: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    padding: 0,
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  composeSection: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 4,
  },
  composeSectionGap: { marginTop: 6 },
  composeEmpty: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    color: colors.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  composeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composeName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  composeSub: { fontSize: 12, fontWeight: '500', color: colors.muted, marginTop: 1 },
  composeUnread: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composeUnreadTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  groupAv: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  aiAv: { backgroundColor: '#f3e8ff' },

  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    ...Platform.select({
      web: { pointerEvents: 'auto' },
      default: {},
    }),
  },
  /** Mobile web: pop from FAB — 80% width, raised above bottom nav. */
  drawerShell: {
    position: 'absolute',
    top: CHAT_WINDOW_TOP,
    right: 0,
    // `bottom` applied at render via chatDrawerBottomInset(extraBottom)
    bottom: CHAT_WINDOW_BOTTOM,
    zIndex: 2,
    backgroundColor: colors.card,
    overflow: 'hidden',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(0,0,0,0.08)',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 0,
    borderBottomLeftRadius: 12,
    ...Platform.select({
      web: {
        boxShadow: '-8px -4px 28px rgba(0,0,0,0.18)',
        display: 'flex',
        flexDirection: 'column',
      },
      default: {
        elevation: 16,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 20,
        shadowOffset: { width: -4, height: 0 },
      },
    }),
  },
  drawerPanel: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.card,
    ...Platform.select({
      web: {
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        pointerEvents: 'auto',
      },
      default: {},
    }),
  },
  drawerCompose: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.card,
    paddingTop: 8,
    ...Platform.select({
      web: {
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
      },
      default: {},
    }),
  },
  drawerComposeScroll: {
    flex: 1,
    minHeight: 0,
  },
  listWrap: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.card,
  },
  mobileFab: {
    position: 'absolute',
    zIndex: 3,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        pointerEvents: 'auto',
        cursor: 'grab',
        boxShadow: '0 6px 20px rgba(37, 99, 235, 0.45)',
      },
      default: {
        elevation: 8,
        shadowColor: colors.brand,
        shadowOpacity: 0.35,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
    }),
  },
});
