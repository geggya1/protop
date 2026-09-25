/**
 * Familievegg — hva som skjer hjemme, samlet for familien.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, Alert, Modal, Pressable, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { AvatarBubble } from '../../components/AvatarPicker';
import {
  listenFamilyWall, createFamilyWallPost, updateFamilyWallPost,
  softDeleteFamilyWallPost, reactToFamilyWallPost, normalizeWallLinkUrl,
  splitBodyAndLinks,
} from '../../src/utils/familyWall';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { notifyUsers } from '../../src/utils/notifications';

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


const PROMPTS = [
  'Hva skjer i kveld?',
  'Noe gøy fra i dag',
  'Middagstips?',
  'Se hva vi fant',
];

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

export default function FamilyWallHubScreen({ inShell = false }) {
  const { familyId, uid, members, isParent } = useApp();
  const { isDesktop } = useLayout();
  const me = members.find((m) => m.uid === uid);
  const myName = me?.name || 'Meg';
  const [posts, setPosts] = useState([]);
  const [body, setBody] = useState('');
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  const [editingPostId, setEditingPostId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenFamilyWall(familyId, (list) => {
      setPosts((list || []).filter((p) => p.deleted !== true));
    });
  }, [familyId]);

  const thisWeekCount = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return posts.filter((p) => postTime(p.createdAt) >= weekAgo).length;
  }, [posts]);

  const authorsThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const names = new Set(
      posts.filter((p) => postTime(p.createdAt) >= weekAgo).map((p) => p.authorName).filter(Boolean),
    );
    return [...names];
  }, [posts]);

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
    // Prefer explicit link field; otherwise lift first URL out of the body
    // so posts never show a long raw URL in the feed.
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
        await updateFamilyWallPost(familyId, editingPostId, {
          body: text,
          imageUrl,
          imageUrls: imageUrl ? [imageUrl] : [],
          linkUrl,
          editorUid: uid,
          isAdmin: !!isParent,
        });
      } else {
        await createFamilyWallPost({
          familyId,
          authorUid: uid,
          authorName: myName,
          body: text,
          imageUrl,
          linkUrl,
        });
        const others = (members || []).map((m) => m.uid).filter(Boolean);
        const notifyBody = text
          ? `${myName}: ${text.slice(0, 80)}`
          : linkUrl
            ? `${myName} delte en lenke`
            : `${myName} delte et bilde`;
        await notifyUsers(others, {
          eventType: 'wallPost',
          title: 'Ny post på familieveggen',
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
    uid, myName, members, isParent, resetComposer,
  ]);

  const addWithPhoto = useCallback(async () => {
    if (!familyId || busy) return;
    try {
      const picked = await pickImage({ edit: false });
      if (!picked) return;
      setBusy(true);
      const path = `families/${familyId}/wall/${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      if (url) setPendingImageUrl(url);
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setBusy(false);
    }
  }, [familyId, busy]);

  const canPublish = !!(body.trim() || pendingImageUrl || pendingLinkUrl.trim()) && !busy;

  useHelpScene(composerOpen ? 'inner' : 'hub', {
    onRetreat: () => setComposerOpen(false),
  });

  const shellBtn = useMemo(
    () => (
      <HelpTarget id="add" onAdvance={openComposer}>
        <ShellAddButton
          label="Del"
          onPress={openComposer}
          accessibilityLabel="Del på familieveggen"
        />
      </HelpTarget>
    ),
    [openComposer],
  );
  useShellTitleRight(shellBtn, { active: !composerOpen });

  return (
    <Screen>
      <ModulePageFrame name="wall">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <ModuleHubIntro>
        {!inShell && <Text style={styles.title}>Familievegg</Text>}
        <Mute>
          Her ser dere hva som skjer hjemme — små oppdateringer, bilder og det som er verdt å dele.
        </Mute>
        </ModuleHubIntro>

        <HelpTarget id="content" style={{ width: '100%' }}>
        <View style={styles.stats}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{thisWeekCount}</Text>
            <Text style={styles.statLbl}>innlegg denne uken</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>{posts.length}</Text>
            <Text style={styles.statLbl}>totalt på veggen</Text>
          </View>
        </View>
        </HelpTarget>
        {authorsThisWeek.length ? (
          <Text style={styles.whoLine}>
            Denne uken: {authorsThisWeek.join(', ')}
          </Text>
        ) : null}

        {posts.map((post) => {
          const reacted = post.reactions?.[uid];
          const canEdit = isParent || post.authorUid === uid;
          const author = memberByUid[post.authorUid];
          const editingThis = editingPostId === post.id;
          const { text: displayBody, links: displayLinks } = splitBodyAndLinks(
            post.body || '',
            post.linkUrl,
          );
          return (
            <View key={post.id} style={[styles.card, editingThis && styles.cardEditing]}>
              <View style={styles.cardTop}>
                <AvatarBubble
                  photoURL={author?.photoURL}
                  avatarId={author?.avatarId}
                  name={post.authorName || 'Ukjent'}
                  size={32}
                  color={author?.color}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>{post.authorName || 'Ukjent'}</Text>
                  <Text style={styles.when}>
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
                      onPress={() => softDeleteFamilyWallPost(familyId, post.id)}
                      hitSlop={8}
                      accessibilityLabel="Slett innlegg"
                    >
                      <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
              {!!displayBody && <Text style={styles.postBody}>{displayBody}</Text>}
              {!!post.imageUrl && (
                <Image source={{ uri: post.imageUrl }} style={styles.image} />
              )}
              {displayLinks.length ? (
                <View style={styles.linkRow}>
                  {displayLinks.map((href) => (
                    <TouchableOpacity
                      key={href}
                      style={styles.linkBtn}
                      onPress={() => openExternalLink(href)}
                      accessibilityRole="link"
                      accessibilityLabel="Åpne lenke i nytt vindu"
                    >
                      <Ionicons name="link-outline" size={14} color={colors.brand} />
                      <Text style={styles.linkBtnTxt}>Link</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.reactBtn}
                onPress={() => reactToFamilyWallPost(familyId, post.id, uid)}
              >
                <Text style={styles.reactTxt}>{reacted ? '❤️' : '🤍'} {post.reactionCount || 0}</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {!posts.length && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Veggen er tom — så langt</Text>
            <Text style={styles.emptySub}>
              Trykk Del for å dele et bilde fra middagen, en beskjed før helgen, eller det barna vil vise frem.
              Familien ser det her, uten at det forsvinner i chat.
            </Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>

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
              style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
              onPress={() => {}}
            >
              {!isDesktop ? <View style={styles.sheetHandle} /> : null}
              <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>
                {editingPostId ? 'Rediger innlegg' : 'Del på familieveggen'}
              </Text>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.modalScroll}
              >
                <TextInput
                  style={styles.input}
                  value={body}
                  onChangeText={setBody}
                  placeholder="Hva skjer hjemme?"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  autoFocus
                />
                {!editingPostId ? (
                  <View style={styles.promptRow}>
                    {PROMPTS.map((p) => (
                      <TouchableOpacity key={p} style={styles.prompt} onPress={() => setBody(p)}>
                        <Text style={styles.promptTxt}>{p}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {pendingImageUrl ? (
                  <View style={styles.pendingWrap}>
                    <Image source={{ uri: pendingImageUrl }} style={styles.pendingImage} />
                    <TouchableOpacity
                      style={styles.pendingRemove}
                      onPress={() => setPendingImageUrl(null)}
                      hitSlop={8}
                      accessibilityLabel="Fjern bilde"
                    >
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.photoLink, busy && { opacity: 0.5 }]}
                  onPress={addWithPhoto}
                  disabled={busy}
                >
                  <Ionicons name="image-outline" size={18} color={colors.brand} />
                  <Text style={styles.photoLinkTxt}>
                    {pendingImageUrl ? 'Bytt bilde' : 'Legg ved bilde'}
                  </Text>
                </TouchableOpacity>
                <View style={styles.linkField}>
                  <Ionicons name="link-outline" size={18} color={colors.muted} />
                  <TextInput
                    style={styles.linkInput}
                    value={pendingLinkUrl}
                    onChangeText={setPendingLinkUrl}
                    placeholder="Ekstern lenke (valgfritt)"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                  />
                </View>
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.secondaryBtn, isDesktop && styles.modalBtnDesk]}
                  onPress={closeComposer}
                  disabled={busy}
                >
                  <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    isDesktop && styles.modalBtnDesk,
                    !canPublish && { opacity: 0.5 },
                  ]}
                  onPress={publish}
                  disabled={!canPublish}
                  accessibilityLabel={editingPostId ? 'Lagre innlegg' : 'Del innlegg'}
                >
                  <Text style={styles.primaryBtnTxt}>
                    {editingPostId ? 'Lagre' : 'Del'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { padding: 16, paddingBottom: 120 },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 16 },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center',
  },
  statNum: { fontSize: 20, fontWeight: '500', color: colors.ink },
  statLbl: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 2, textAlign: 'center' },
  whoLine: { marginTop: 8, color: colors.muted, fontSize: 13, fontWeight: '400' },
  input: {
    minHeight: 72, textAlignVertical: 'top',
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    backgroundColor: colors.sunken, color: colors.ink, fontSize: 15, fontWeight: '400',
  },
  promptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  prompt: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: colors.brandSoft,
  },
  promptTxt: { color: colors.brand, fontSize: 12, fontWeight: '400' },
  photoLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginTop: 12, marginBottom: 4,
  },
  photoLinkTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  linkField: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10,
    borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, backgroundColor: colors.sunken,
  },
  linkInput: {
    flex: 1, paddingVertical: 10, color: colors.ink, fontSize: 14, fontWeight: '400',
  },
  pendingWrap: { position: 'relative', alignSelf: 'stretch', marginTop: 10 },
  pendingImage: {
    width: '100%', height: 160, borderRadius: 12, backgroundColor: '#e2e8f0',
  },
  pendingRemove: {
    position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    marginTop: 12, backgroundColor: colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.line, gap: 8,
  },
  cardEditing: { borderColor: colors.brand },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  author: { fontWeight: '500', color: colors.ink },
  when: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  postBody: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: '400' },
  image: { width: '100%', height: 200, borderRadius: 12, backgroundColor: '#e2e8f0' },
  linkBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: colors.brandSoft,
  },
  linkBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reactBtn: { paddingVertical: 4, alignSelf: 'flex-start' },
  reactTxt: { fontWeight: '400', fontSize: 14 },
  emptyBox: { marginTop: 28, alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  emptyTitle: { fontWeight: '500', fontSize: 17, color: colors.ink, textAlign: 'center' },
  emptySub: {
    color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20,
    textAlign: 'center', maxWidth: 380,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalAvoid: { width: '100%' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28, maxHeight: '88%',
  },
  modalSheetDesk: {
    maxWidth: 420, width: '100%',
    borderRadius: 12, marginBottom: 0, padding: 18, paddingBottom: 18,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 14,
  },
  modalTitle: { fontWeight: '400', fontSize: 18, color: colors.ink, marginBottom: 12 },
  modalTitleDesk: { fontWeight: '500', fontSize: 16, marginBottom: 10 },
  modalScroll: { flexGrow: 0, maxHeight: 360 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '400' },
  modalBtnDesk: { paddingVertical: 10, borderRadius: 8 },
});
