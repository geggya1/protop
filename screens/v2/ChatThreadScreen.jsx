import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, Image, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import {
  addDoc, collection, doc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db, auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius } from '../../src/theme';
import { Screen } from '../../components/ui';
import ConfirmDialog from '../../components/ConfirmDialog';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { formatMessageStamp } from '../../src/utils/aiChats';
import { setOpenChatId } from '../../src/utils/openChat';
import { markChatNotificationsSeen, notifyUsers } from '../../src/utils/notifications';
import { useUnread } from '../../src/context/NotificationContext';
import {
  markChatRead, resolveChatRecipients, stampChatMessage, uniqueMemberIds,
  canManageChatMessage, updateChatMessage, deleteChatMessage,
  listenChatMessages,
} from '../../src/utils/chats';
import {
  SwipeStampRow,
  SwipeTimestampHost,
  useSwipeTimestampReveal,
} from '../../components/SwipeTimestamp';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';

export default function ChatThreadScreen() {
  const nav = useNavigation();
  useHelpScene('inner', { onRetreat: () => nav.goBack() });
  const { params } = useRoute();
  const { familyId: familyIdParam, chatId, title, memberIds: memberIdsParam } = params || {};
  const {
    uid, user, meChild, isChild, familyId: familyIdFromApp, family, members, isAdmin,
  } = useApp();
  const familyId = familyIdParam || familyIdFromApp;
  const effectiveUid = uid || auth.currentUser?.uid || null;
  const { markChatSeen } = useUnread();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [msgs, setMsgs] = useState([]);
  const [memberIds, setMemberIds] = useState(memberIdsParam || []);
  const [uploading, setUploading] = useState(false);
  const [editMsg, setEditMsg] = useState(null);
  const [editText, setEditText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const pendingRef = useRef(null);
  const listRef = useRef(null);
  const name = meChild?.name || user?.displayName || (user?.email || '').split('@')[0] || 'Meg';
  const { reveal, panResponder, stampWidth } = useSwipeTimestampReveal();

  useEffect(() => {
    setOpenChatId(chatId || null);
    const userUid = effectiveUid;
    if (userUid && chatId) {
      markChatSeen(chatId).catch(() => {});
      markChatNotificationsSeen(userUid, chatId).catch(() => {});
      if (familyId) markChatRead(familyId, chatId, userUid).catch(() => {});
    }
    return () => setOpenChatId(null);
  }, [chatId, effectiveUid, familyId, markChatSeen]);

  useEffect(() => {
    if (!familyId || !chatId) return undefined;
    return onSnapshot(doc(db, 'families', familyId, 'chats', chatId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const live = uniqueMemberIds(data.memberIds);
        if (live.length) setMemberIds(live);
      }
    });
  }, [familyId, chatId]);

  useEffect(() => {
    if (!familyId || !chatId) return undefined;
    return listenChatMessages(
      familyId,
      chatId,
      effectiveUid,
      (next) => {
        setMsgs(next);
        const last = next.filter((m) => !m.deleted).slice(-1)[0];
        const userUid = effectiveUid;
        if (last?.senderId && last.senderId !== userUid && familyId && chatId && userUid) {
          markChatRead(familyId, chatId, userUid).catch(() => {});
          markChatSeen(chatId).catch(() => {});
          markChatNotificationsSeen(userUid, chatId).catch(() => {});
        }
        setTimeout(() => listRef.current?.scrollToEnd?.({ animated: true }), 50);
      },
      () => setMsgs([]),
    );
  }, [familyId, chatId, effectiveUid, markChatSeen]);

  const recipientIdsFor = (senderUid) => resolveChatRecipients({
    chatId,
    senderUid,
    memberIds,
    paramMemberIds: memberIdsParam,
    familyMemberIds: Array.isArray(family?.members) ? family.members : [],
    contextMemberIds: (members || []).map((m) => m.uid),
  });

  const notifyRecipients = async (senderUid, body, messageId) => {
    try {
      await notifyUsers(recipientIdsFor(senderUid), {
        eventType: 'messageReceived',
        title: t('chat.newMessage'),
        body,
        familyId,
        chatId,
        createdBy: senderUid,
        notificationId: messageId ? `msg_${messageId}` : undefined,
      });
    } catch (err) {
      console.warn('[chat] notifyRecipients', err);
    }
  };

  const sendMessage = async (payload) => {
    if (!familyId || !chatId) return;
    const senderUid = effectiveUid;
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
        ? [senderUid, ...recipients, ...(memberIds || []), ...(memberIdsParam || [])]
        : [
          senderUid,
          ...recipients,
          ...(memberIds || []),
          ...(memberIdsParam || []),
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
    } catch (err) {
      console.warn('[chat] stampChatMessage', err);
    }
    await notifyRecipients(senderUid, preview, msgRef.id);
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || !familyId || !chatId) return;
    setText('');
    try {
      await sendMessage({ type: 'text', text: msg });
    } catch (err) {
      console.warn('[chat] send failed', err?.code || err?.message || err);
      setText(msg);
    }
  };

  const attachImage = async () => {
    if (uploading || !familyId || !chatId) return;
    try {
      const picked = await pickImage({ camera: false });
      if (!picked?.uri) return;
      setUploading(true);
      const path = `families/${familyId}/chats/${chatId}/attachments/${Date.now()}.jpg`;
      const imageUrl = await uploadImage(path, picked);
      const caption = text.trim();
      setText('');
      await sendMessage({
        type: 'image',
        imageUrl,
        imagePath: path,
        text: caption,
      });
    } catch (err) {
      alertPhotoError(err, t);
    } finally {
      setUploading(false);
    }
  };

  const openEdit = useCallback((item) => {
    if (!canManageChatMessage(item, effectiveUid, isAdmin)) return;
    pendingRef.current = item;
    setEditText(item.text || '');
    setEditMsg(item);
  }, [effectiveUid, isAdmin]);

  const openDelete = useCallback((item) => {
    if (!canManageChatMessage(item, effectiveUid, isAdmin)) return;
    pendingRef.current = item;
    setPendingDelete(item);
  }, [effectiveUid, isAdmin]);

  const saveEdit = async () => {
    const target = editMsg || pendingRef.current;
    if (!target || !familyId || !chatId || busy) return;
    const trimmed = editText.trim();
    if (!trimmed && target.type !== 'image') return;
    setBusy(true);
    setActionError('');
    try {
      await updateChatMessage(familyId, chatId, target.id, {
        text: trimmed,
        editedBy: effectiveUid,
      });
      setEditMsg(null);
      setEditText('');
      pendingRef.current = null;
    } catch (err) {
      console.warn('[chat] updateChatMessage', err);
      setActionError(err?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const confirmDeleteMessage = async () => {
    const target = pendingDelete || pendingRef.current;
    if (!target || !familyId || !chatId || busy) return;
    setPendingDelete(null);
    setBusy(true);
    setActionError('');
    try {
      await deleteChatMessage(familyId, chatId, target.id, {
        deletedBy: effectiveUid,
      });
      pendingRef.current = null;
    } catch (err) {
      console.warn('[chat] deleteChatMessage', err);
      setActionError(err?.message || t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const renderItem = useCallback(({ item }) => {
    const mine = item.senderId === effectiveUid;
    const canManage = canManageChatMessage(item, effectiveUid, isAdmin);
    const stamp = formatMessageStamp(item.createdAt);

    if (item.deleted) {
      return (
        <SwipeStampRow
          reveal={reveal}
          stampWidth={stampWidth}
          align={mine ? 'right' : 'left'}
          stamp={<Text style={styles.stampTxt}>{stamp}</Text>}
        >
          <View style={[styles.bubble, styles.deletedBubble, mine ? styles.mineDeleted : styles.theirsDeleted]}>
            {!mine && <Text style={styles.who}>{item.senderName}</Text>}
            <Text style={styles.deletedTxt}>{t('chat.messageDeleted')}</Text>
          </View>
        </SwipeStampRow>
      );
    }

    const isImage = item.type === 'image' && item.imageUrl;
    return (
      <SwipeStampRow
        reveal={reveal}
        stampWidth={stampWidth}
        align={mine ? 'right' : 'left'}
        stamp={<Text style={styles.stampTxt}>{stamp}</Text>}
      >
        <View style={[styles.msgBlock, mine && styles.msgBlockMine]}>
          <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
            {!mine && <Text style={styles.who}>{item.senderName}</Text>}
            {isImage && (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.chatImage}
                resizeMode="cover"
                accessibilityLabel={t('chat.imageAttachment')}
              />
            )}
            {!!item.text && (
              <Text style={[styles.body, mine && styles.bodyMine, isImage && styles.caption]}>
                {item.text}
              </Text>
            )}
            {isImage && !item.text && (
              <Text style={[styles.body, mine && styles.bodyMine, styles.imageLabel]}>
                {t('chat.imageSent')}
              </Text>
            )}
            {item.editedAt ? (
              <Text style={[styles.editedLbl, mine && styles.editedLblMine]}>
                {t('chat.edited')}
              </Text>
            ) : null}
          </View>

          {canManage ? (
            <View style={[styles.msgActions, mine && styles.msgActionsMine]}>
              <TouchableOpacity
                style={styles.msgActionBtn}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.editMessage')}
                hitSlop={10}
              >
                <Ionicons name="pencil-outline" size={14} color={colors.brand} />
                <Text style={styles.msgActionTxt}>{t('common.edit')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.msgActionBtn}
                onPress={() => openDelete(item)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.deleteMessage')}
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={14} color={colors.danger} />
                <Text style={[styles.msgActionTxt, styles.msgActionDanger]}>{t('common.delete')}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </SwipeStampRow>
    );
  }, [effectiveUid, isAdmin, reveal, stampWidth, t, openEdit, openDelete]);

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.threadHead}>
          <View style={styles.threadHeadRow}>
            {nav.canGoBack?.() && (
              <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Tilbake">
                <Ionicons name="chevron-back" size={22} color={colors.ink} />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.threadTitle} numberOfLines={1}>{title || t('tabs.chat')}</Text>
              <Text style={styles.threadHint}>
                Dra mot venstre for dato og tid
                {isAdmin ? ' · Admin kan endre/slette alle meldinger' : ' · Endre eller slett egne meldinger under boblen'}
              </Text>
            </View>
          </View>
        </View>
        <SwipeTimestampHost panResponder={panResponder}>
          <FlatList
            ref={listRef}
            data={msgs}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8 }}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
          />
        </SwipeTimestampHost>
        <View style={styles.composer}>
          <TouchableOpacity
            onPress={attachImage}
            style={styles.attachBtn}
            disabled={uploading}
            accessibilityLabel={t('chat.attachImage')}
          >
            {uploading ? (
              <ActivityIndicator color={colors.brand} size="small" />
            ) : (
              <Ionicons name="image-outline" size={22} color={colors.brand} />
            )}
          </TouchableOpacity>
          <HelpTarget id="input" style={{ flex: 1 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={t('chat.placeholder')}
            style={[styles.input, isChild && { minHeight: 44 }]}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          </HelpTarget>
          <TouchableOpacity onPress={send} style={styles.send} accessibilityLabel={t('chat.send')}>
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={!!pendingDelete}
        title={t('chat.deleteMessage')}
        message={t('chat.deleteMessageConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onCancel={() => {
          setPendingDelete(null);
          pendingRef.current = null;
        }}
        onConfirm={confirmDeleteMessage}
      />

      <ConfirmDialog
        visible={!!actionError}
        title={t('common.error')}
        message={actionError}
        confirmText={t('common.ok')}
        onConfirm={() => setActionError('')}
        onClose={() => setActionError('')}
      />

      <Modal
        visible={!!editMsg}
        transparent
        animationType="fade"
        onRequestClose={() => setEditMsg(null)}
      >
        <Pressable style={styles.editBackdrop} onPress={() => setEditMsg(null)}>
          <Pressable style={styles.editCard} onPress={() => {}}>
            <Text style={styles.editTitle}>{t('chat.editMessage')}</Text>
            <TextInput
              style={styles.editInput}
              value={editText}
              onChangeText={setEditText}
              multiline
              autoFocus
              placeholder={t('chat.placeholder')}
            />
            <View style={styles.editActions}>
              <TouchableOpacity onPress={() => { setEditMsg(null); pendingRef.current = null; }}>
                <Text style={styles.editCancel}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSave, busy && { opacity: 0.7 }]}
                onPress={saveEdit}
                disabled={busy || (!editText.trim() && editMsg?.type !== 'image')}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.editSaveTxt}>{t('chat.saveEdit')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  threadHead: {
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    backgroundColor: colors.card,
  },
  threadHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { padding: 2, marginRight: 2 },
  threadTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  threadHint: { fontSize: 10, fontWeight: '600', color: colors.muted, marginTop: 1 },
  stampTxt: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textAlign: 'right' },
  msgBlock: { maxWidth: '88%', alignSelf: 'flex-start' },
  msgBlockMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubble: { maxWidth: '100%', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, overflow: 'hidden' },
  mine: { backgroundColor: colors.brand },
  theirs: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  who: { fontSize: 11, fontWeight: '700', color: colors.muted, marginBottom: 2 },
  body: { fontSize: 14, color: colors.ink, fontWeight: '600', lineHeight: 20 },
  bodyMine: { color: '#fff' },
  caption: { marginTop: 6, fontSize: 13 },
  imageLabel: { fontSize: 12, opacity: 0.9 },
  editedLbl: { fontSize: 10, fontWeight: '600', color: colors.muted, marginTop: 4, fontStyle: 'italic' },
  editedLblMine: { color: 'rgba(255,255,255,0.8)' },
  msgActions: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4, paddingHorizontal: 2,
  },
  msgActionsMine: { justifyContent: 'flex-end' },
  msgActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 },
  msgActionTxt: { fontSize: 12, fontWeight: '800', color: colors.brand },
  msgActionDanger: { color: colors.danger },
  deletedBubble: { opacity: 0.85 },
  mineDeleted: { alignSelf: 'flex-end', backgroundColor: '#cbd5e1' },
  theirsDeleted: { alignSelf: 'flex-start', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: colors.line },
  deletedTxt: { fontSize: 13, fontWeight: '600', color: '#64748b', fontStyle: 'italic' },
  chatImage: { width: 180, height: 180, borderRadius: 10, backgroundColor: '#e2e8f0' },
  composer: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.card,
    borderTopWidth: 1, borderTopColor: colors.line, alignItems: 'center',
  },
  attachBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, backgroundColor: colors.bg,
  },
  send: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  editBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20,
  },
  editCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 18, gap: 12,
  },
  editTitle: { fontSize: 17, fontWeight: '900', color: colors.ink },
  editInput: {
    minHeight: 88, maxHeight: 180, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink, textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 14 },
  editCancel: { fontSize: 15, fontWeight: '700', color: colors.muted },
  editSave: {
    backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10,
    minWidth: 88, alignItems: 'center',
  },
  editSaveTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
