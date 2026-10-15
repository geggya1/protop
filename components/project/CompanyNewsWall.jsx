/**
 * Offentlig nyhetsvegg for selskapet — inspirert av familieveggen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image, Alert,
  Modal, Pressable, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { AvatarBubble } from '../AvatarPicker';
import {
  listenCompanyWall, createCompanyWallPost, updateCompanyWallPost,
  softDeleteCompanyWallPost, reactToCompanyWallPost,
} from '../../src/project/companyWall';
import {
  normalizeWallLinkUrl, splitBodyAndLinks,
} from '../../src/utils/familyWall';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { notifyUsers } from '../../src/utils/notifications';
import { isSuperAdmin } from '../../src/utils/groups';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';

function openExternalLink(url) {
  const href = normalizeWallLinkUrl(url);
  if (!href) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(href).catch(() => {
    Alert.alert('Feil', 'Klarte ikke åpne lenken.');
  });
}

function timeAgo(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${Math.max(1, mins)} min siden`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} t siden`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'I går';
    return `${days} dager siden`;
  } catch {
    return '';
  }
}

function postTime(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d) return 0;
    return d.getTime();
  } catch {
    return 0;
  }
}

function wasEdited(post) {
  const created = postTime(post?.createdAt);
  const updated = postTime(post?.updatedAt);
  return created > 0 && updated > created + 2000;
}

export default function CompanyNewsWall() {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const {
    familyId, family, uid, members,
  } = useApp();
  const access = useCompanyAccess();
  const owner = isSuperAdmin(family, uid);
  const canPublish = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.can('companyProfile', 'write'));
  const me = (members || []).find((m) => m.uid === uid);
  const myName = me?.name || family?.company?.navn || 'Bedriften';
  const [posts, setPosts] = useState([]);
  const [body, setBody] = useState('');
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  const [editingPostId, setEditingPostId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenCompanyWall(familyId, (list) => {
      setPosts((list || []).filter((p) => p.deleted !== true));
    });
  }, [familyId]);

  const memberByUid = useMemo(() => {
    const map = {};
    (members || []).forEach((m) => {
      if (m.uid) map[m.uid] = m;
    });
    return map;
  }, [members]);

  const resetComposer = useCallback(() => {
    setBody('');
    setPendingImageUrl(null);
    setPendingLinkUrl('');
    setEditingPostId(null);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    resetComposer();
  }, [resetComposer]);

  const openComposer = useCallback(() => {
    resetComposer();
    setComposerOpen(true);
  }, [resetComposer]);

  const startEdit = useCallback((post) => {
    if (!post?.id) return;
    const { text, links } = splitBodyAndLinks(post.body || '', post.linkUrl);
    setEditingPostId(post.id);
    setBody(text);
    setPendingImageUrl(post.imageUrl || post.imageUrls?.[0] || null);
    setPendingLinkUrl(post.linkUrl || links[0] || '');
    setComposerOpen(true);
  }, []);

  const publish = useCallback(async () => {
    if (!familyId) return;
    const split = splitBodyAndLinks(body, pendingLinkUrl);
    const text = split.text;
    const imageUrl = pendingImageUrl || null;
    const linkUrl = split.links[0] || null;
    if (pendingLinkUrl.trim() && !normalizeWallLinkUrl(pendingLinkUrl) && !linkUrl) {
      Alert.alert('Ugyldig lenke', 'Sjekk at lenken er en gyldig nettadresse.');
      return;
    }
    if (!text && !imageUrl && !linkUrl) return;
    if (busy) return;
    setBusy(true);
    try {
      if (editingPostId) {
        await updateCompanyWallPost(familyId, editingPostId, {
          body: text,
          imageUrl,
          imageUrls: imageUrl ? [imageUrl] : [],
          linkUrl,
          editorUid: uid,
          isAdmin: canPublish,
        });
      } else {
        await createCompanyWallPost({
          companyId: familyId,
          authorUid: uid,
          authorName: myName,
          body: text,
          imageUrl,
          linkUrl,
        });
        const others = (members || []).map((m) => m.uid).filter((id) => id && id !== uid);
        const notifyBody = text
          ? `${myName}: ${text.slice(0, 80)}`
          : linkUrl
            ? `${myName} delte en lenke`
            : `${myName} delte et bilde`;
        await notifyUsers(others, {
          eventType: 'companyWallPost',
          title: 'Nyhet fra bedriften',
          body: notifyBody,
          familyId,
          createdBy: uid,
        }).catch(() => {});
      }
      setComposerOpen(false);
      resetComposer();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke publisere.');
    } finally {
      setBusy(false);
    }
  }, [
    familyId, busy, body, pendingImageUrl, pendingLinkUrl, editingPostId,
    uid, myName, members, canPublish, resetComposer,
  ]);

  const addWithPhoto = useCallback(async () => {
    if (!familyId || busy) return;
    try {
      const picked = await pickImage({ edit: false });
      if (!picked) return;
      setBusy(true);
      const path = `families/${familyId}/companyWall/${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      if (url) setPendingImageUrl(url);
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setBusy(false);
    }
  }, [familyId, busy]);

  const canSubmit = !!(body.trim() || pendingImageUrl || pendingLinkUrl.trim()) && !busy;

  return (
    <View
      nativeID="company-news-wall"
      id="company-news-wall"
      style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            Nyheter
          </Text>
          <Text style={[styles.lead, { color: colors.muted }]}>
            Offentlige oppdateringer fra bedriften — her inne i ProTop.
          </Text>
        </View>
        {canPublish ? (
          <TouchableOpacity
            onPress={openComposer}
            accessibilityRole="button"
            accessibilityLabel="Publiser nyhet"
            style={[styles.publishBtn, { backgroundColor: colors.brand }]}
          >
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.publishTxt}>Publiser</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {posts.length ? posts.map((post) => {
        const reacted = post.reactions?.[uid];
        const canEdit = canPublish || post.authorUid === uid;
        const author = memberByUid[post.authorUid];
        const editingThis = editingPostId === post.id;
        const { text: displayBody, links: displayLinks } = splitBodyAndLinks(
          post.body || '',
          post.linkUrl,
        );
        return (
          <View
            key={post.id}
            style={[
              styles.post,
              { borderColor: colors.line, backgroundColor: colors.sunken },
              editingThis && { borderColor: colors.brand },
            ]}
          >
            <View style={styles.postTop}>
              <AvatarBubble
                photoURL={author?.photoURL}
                avatarId={author?.avatarId}
                name={post.authorName || 'Ukjent'}
                size={32}
                color={author?.color}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.author, { color: colors.ink }]}>{post.authorName || 'Ukjent'}</Text>
                <Text style={[styles.when, { color: colors.muted }]}>
                  {timeAgo(post.createdAt)}
                  {wasEdited(post) ? ' · redigert' : ''}
                </Text>
              </View>
              {canEdit ? (
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    onPress={() => startEdit(post)}
                    hitSlop={8}
                    accessibilityLabel="Rediger innlegg"
                  >
                    <Ionicons
                      name="pencil-outline"
                      size={18}
                      color={editingThis ? colors.brand : colors.muted}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => softDeleteCompanyWallPost(familyId, post.id)}
                    hitSlop={8}
                    accessibilityLabel="Slett innlegg"
                  >
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            {!!displayBody && (
              <Text style={[styles.postBody, { color: colors.ink }]}>{displayBody}</Text>
            )}
            {!!post.imageUrl && (
              <Image source={{ uri: post.imageUrl }} style={styles.image} />
            )}
            {displayLinks.length ? (
              <View style={styles.linkRow}>
                {displayLinks.map((href) => (
                  <TouchableOpacity
                    key={href}
                    style={[styles.linkBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
                    onPress={() => openExternalLink(href)}
                    accessibilityRole="link"
                    accessibilityLabel="Åpne lenke"
                  >
                    <Ionicons name="link-outline" size={14} color={colors.brand} />
                    <Text style={[styles.linkBtnTxt, { color: colors.brand }]}>Lenke</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.reactBtn}
              onPress={() => reactToCompanyWallPost(familyId, post.id, uid)}
            >
              <Text style={[styles.reactTxt, { color: colors.muted }]}>
                {reacted ? '❤️' : '🤍'} {post.reactionCount || 0}
              </Text>
            </TouchableOpacity>
          </View>
        );
      }) : (
        <View style={[styles.empty, { backgroundColor: colors.sunken }]}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>Ingen nyheter ennå</Text>
          <Text style={[styles.emptySub, { color: colors.muted }]}>
            {canPublish
              ? 'Publiser en oppdatering, et bilde eller en lenke som alle i bedriften skal se.'
              : 'Når bedriften publiserer nyheter, dukker de opp her.'}
          </Text>
        </View>
      )}

      <Modal
        visible={composerOpen}
        animationType={isDesktop ? 'fade' : 'slide'}
        transparent
        onRequestClose={closeComposer}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closeComposer}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={isDesktop ? undefined : styles.modalAvoid}
          >
            <Pressable
              style={[styles.modalSheet, { backgroundColor: colors.card }, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
              onPress={() => {}}
            >
              {!isDesktop ? <View style={[styles.sheetHandle, { backgroundColor: colors.line }]} /> : null}
              <Text style={[styles.modalTitle, { color: colors.ink }]}>
                {editingPostId ? 'Rediger nyhet' : 'Publiser nyhet'}
              </Text>
              <TextInput
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken }]}
                value={body}
                onChangeText={setBody}
                placeholder="Hva skjer i bedriften?"
                placeholderTextColor={colors.placeholder}
                multiline
                textAlignVertical="top"
              />
              <TextInput
                style={[styles.linkInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken }]}
                value={pendingLinkUrl}
                onChangeText={setPendingLinkUrl}
                placeholder="Lenke (valgfritt)"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {pendingImageUrl ? (
                <View style={styles.previewRow}>
                  <Image source={{ uri: pendingImageUrl }} style={styles.preview} />
                  <TouchableOpacity onPress={() => setPendingImageUrl(null)}>
                    <Text style={{ color: colors.danger }}>Fjern bilde</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={addWithPhoto}
                  style={[styles.secondaryBtn, { borderColor: colors.line }]}
                  disabled={busy}
                >
                  <Ionicons name="image-outline" size={18} color={colors.ink} />
                  <Text style={{ color: colors.ink }}>Bilde</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={publish}
                  disabled={!canSubmit}
                  style={[
                    styles.primaryBtn,
                    { backgroundColor: canSubmit ? colors.brand : colors.sunken },
                  ]}
                >
                  <Text style={{ color: canSubmit ? '#fff' : colors.muted, fontWeight: '400' }}>
                    {busy ? 'Lagrer…' : (editingPostId ? 'Lagre' : 'Publiser')}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </View>
  );
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 8px 22px rgba(15, 23, 42, 0.05)' }
  : {};

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 12, ...webShadow },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  lead: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  publishTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  post: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  postTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontSize: 14, fontWeight: '400' },
  when: { fontSize: 12 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postBody: { fontSize: 15, lineHeight: 21 },
  image: { width: '100%', height: 180, borderRadius: 10 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  linkBtnTxt: { fontSize: 13, fontWeight: '400' },
  reactBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  reactTxt: { fontSize: 13 },
  empty: { borderRadius: 12, padding: 14, gap: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '400' },
  emptySub: { fontSize: 13, lineHeight: 18 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  modalAvoid: { width: '100%' },
  modalSheet: {
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, gap: 10, maxHeight: '88%',
  },
  modalSheetDesk: {
    margin: 'auto', width: 480, maxWidth: '92%',
    borderRadius: 16, justifyTopLeftRadius: 16, borderTopRightRadius: 16,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  input: {
    borderWidth: 1, borderRadius: 12, minHeight: 110,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
  },
  linkInput: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 72, height: 72, borderRadius: 8 },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  primaryBtn: {
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10,
  },
});
