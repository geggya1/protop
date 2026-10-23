/**
 * Offentlig nyhetsvegg for selskapet.
 * Feed på Nyheter-fanen, kort på forsiden. Bilder beskjæres før opplasting.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image, Alert,
  Modal, Pressable, KeyboardAvoidingView, Platform, Linking, ScrollView,
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
import { notifyUsers } from '../../src/utils/notifications';
import { notifyUser } from '../../src/utils/dialog';
import { isSuperAdmin } from '../../src/utils/groups';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import {
  NEWS_CATEGORIES, POST_ASPECTS, categoryLabel, presentNewsPost,
} from '../../src/project/companyPage';
import { useCroppedUpload } from './useCroppedUpload';

const CATEGORY_COLOR = {
  selskap: '#2563eb',
  baerekraft: '#15915a',
  kompetanse: '#7c3aed',
  prosjekt: '#c2410c',
};

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

function postDate(ts) {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

function wasEdited(post) {
  const created = postTime(post?.createdAt);
  const updated = postTime(post?.updatedAt);
  return created > 0 && updated > created + 2000;
}

export default function CompanyNewsWall({ variant = 'feed', onOpenPost }) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { familyId, family, uid, members } = useApp();
  const access = useCompanyAccess();
  const owner = isSuperAdmin(family, uid);
  const canPublish = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.canEdit('companyPublic'));
  // Endre/slette andres innlegg krever admin; forfatteren kan alltid styre sitt eget.
  const canModerate = (owner && !access.previewLocks('companyProfile'))
    || (access.ready && access.canAdmin('companyPublic'));
  // «Vis som» skal vise den valgte ansattes egne innlegg, ikke eierens.
  const actingUid = access.previewing ? (access.viewingAs?.personUid || null) : uid;
  const me = (members || []).find((m) => m.uid === uid);
  const myName = me?.name || family?.company?.navn || 'Bedriften';
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('selskap');
  const [body, setBody] = useState('');
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  const [editingPostId, setEditingPostId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const crop = useCroppedUpload({
    familyId,
    folder: 'companyWall',
    aspect: 16 / 9,
    aspectPair: [16, 9],
    aspects: POST_ASPECTS,
    title: 'Beskjær nyhetsbilde',
    maxEdge: 1600,
  });

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
    setTitle('');
    setCategory('selskap');
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
    setTitle(post.title || '');
    setCategory(post.category || 'selskap');
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
    if (!text && !imageUrl && !linkUrl && !title.trim()) return;
    if (busy) return;
    setBusy(true);
    try {
      if (editingPostId) {
        await updateCompanyWallPost(familyId, editingPostId, {
          body: text,
          title,
          category,
          imageUrl,
          imageUrls: imageUrl ? [imageUrl] : [],
          linkUrl,
          editorUid: actingUid,
          isAdmin: canModerate,
        });
      } else {
        await createCompanyWallPost({
          companyId: familyId,
          authorUid: uid,
          authorName: myName,
          body: text,
          title,
          category,
          imageUrl,
          linkUrl,
        });
        const others = (members || []).map((m) => m.uid).filter((id) => id && id !== uid);
        const notifyBody = text
          ? `${myName}: ${(title || text).slice(0, 80)}`
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
    familyId, busy, body, title, category, pendingImageUrl, pendingLinkUrl, editingPostId,
    uid, actingUid, myName, members, canModerate, resetComposer,
  ]);

  const addWithPhoto = useCallback(async () => {
    if (!familyId || busy || crop.busy) return;
    try {
      const url = await crop.choose();
      if (url) setPendingImageUrl(url);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke å lese bildet.');
    }
  }, [familyId, busy, crop]);

  const canSubmit = !!(title.trim() || body.trim() || pendingImageUrl || pendingLinkUrl.trim()) && !busy && !crop.busy;
  const cards = variant === 'cards' ? posts.slice(0, 3) : posts;

  const composer = (
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
            <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
              <TextInput
                style={[styles.linkInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Overskrift"
                placeholderTextColor={colors.placeholder}
              />
              <View style={styles.categories}>
                {NEWS_CATEGORIES.map((row) => {
                  const on = category === row.id;
                  return (
                    <TouchableOpacity
                      key={row.id}
                      onPress={() => setCategory(row.id)}
                      style={[styles.categoryChip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                    >
                      <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 12 }}>{row.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
              {!!crop.error && <Text style={{ color: colors.danger }}>{crop.error}</Text>}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={addWithPhoto}
                style={[styles.secondaryBtn, { borderColor: colors.line }]}
                disabled={busy || crop.busy}
                accessibilityRole="button"
                accessibilityLabel="Last opp og beskjær bilde"
              >
                <Ionicons name="image-outline" size={18} color={colors.ink} />
                <Text style={{ color: colors.ink }}>{crop.busy ? 'Beskjærer…' : 'Bilde'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={publish}
                disabled={!canSubmit}
                accessibilityRole="button"
                accessibilityLabel="Publiser"
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
  );

  if (variant === 'cards') {
    if (!cards.length) {
      return (
        <View nativeID="company-news-cards" id="company-news-cards">
          <Text style={[styles.emptySub, { color: colors.muted }]}>
            {canPublish
              ? 'Ingen nyheter ennå. Publiser den første under fanen Nyheter.'
              : 'Når bedriften publiserer nyheter, vises de her.'}
          </Text>
        </View>
      );
    }
    return (
      <View nativeID="company-news-cards" id="company-news-cards" style={styles.cardGrid}>
        {cards.map((post) => {
          const card = presentNewsPost(post);
          return (
            <TouchableOpacity
              key={post.id}
              onPress={() => onOpenPost?.(post)}
              accessibilityRole="button"
              style={[styles.newsCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            >
              {card.imageUrl ? (
                <Image source={{ uri: card.imageUrl }} style={styles.newsImage} />
              ) : null}
              <View style={styles.newsBody}>
                <Text style={[styles.newsKicker, { color: CATEGORY_COLOR[card.category] || colors.brand }]}>
                  {categoryLabel(card.category).toUpperCase()}
                  {postDate(post.createdAt) ? `   ${postDate(post.createdAt)}` : ''}
                </Text>
                <Text style={[styles.newsTitle, { color: colors.ink }]} numberOfLines={2}>{card.title}</Text>
                {card.excerpt ? (
                  <Text style={[styles.newsExcerpt, { color: colors.muted }]} numberOfLines={3}>{card.excerpt}</Text>
                ) : null}
                <Text style={[styles.more, { color: colors.brand }]}>Les mer →</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

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
            Oppdateringer fra bedriften, med bilde, overskrift og kategori.
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
        const canEdit = canModerate || (!!actingUid && post.authorUid === actingUid);
        const author = memberByUid[post.authorUid];
        const editingThis = editingPostId === post.id;
        const card = presentNewsPost(post);
        const { text: displayBody, links: displayLinks } = splitBodyAndLinks(post.body || '', post.linkUrl);
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
                  {categoryLabel(card.category)}
                  {timeAgo(post.createdAt) ? ` · ${timeAgo(post.createdAt)}` : ''}
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
                    <Ionicons name="pencil-outline" size={18} color={editingThis ? colors.brand : colors.muted} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => softDeleteCompanyWallPost(familyId, post.id, {
                      editorUid: actingUid,
                      isAdmin: canModerate,
                    }).catch((e) => notifyUser('Feil', e?.message || 'Klarte ikke slette.'))}
                    hitSlop={8}
                    accessibilityLabel="Slett innlegg"
                  >
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            {!!post.title && <Text style={[styles.postTitle, { color: colors.ink }]}>{post.title}</Text>}
            {!!displayBody && <Text style={[styles.postBody, { color: colors.ink }]}>{displayBody}</Text>}
            {!!post.imageUrl && <Image source={{ uri: post.imageUrl }} style={styles.image} />}
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
      {composer}
      {crop.modal}
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
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
  },
  publishTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  post: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  postTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  author: { fontSize: 14, fontWeight: '400' },
  when: { fontSize: 12 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  postTitle: { fontSize: 16, fontWeight: '600', lineHeight: 21 },
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
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  newsCard: {
    flexGrow: 1, flexBasis: 220, minWidth: 200, maxWidth: 420,
    borderWidth: 1, borderRadius: 16, overflow: 'hidden', ...webShadow,
  },
  newsImage: { width: '100%', height: 132 },
  newsBody: { padding: 12, gap: 6 },
  newsKicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.3 },
  newsTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  newsExcerpt: { fontSize: 13, lineHeight: 18 },
  more: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  modalAvoid: { width: '100%' },
  modalSheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '88%' },
  modalSheetDesk: { margin: 'auto', width: 520, maxWidth: '92%', borderRadius: 16 },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 4 },
  modalTitle: { fontSize: 18, fontWeight: '600' },
  modalScroll: { maxHeight: 420 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: {
    borderWidth: 1, borderRadius: 12, minHeight: 110,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
  },
  linkInput: {
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 8,
  },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  preview: { width: 120, height: 72, borderRadius: 8 },
  modalActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
});
