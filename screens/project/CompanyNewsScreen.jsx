/**
 * Nyheter for bedriften. Samme saksløp som familieveggen: tekst, bilde, lenke,
 * redigering og markering. Språk og uttrykk er tilpasset bedrift.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { useLayout } from '../../src/theme';
import { isGroupAdmin, updateGroup } from '../../src/utils/groups';
import { normalizeWallLinkUrl, splitBodyAndLinks } from '../../src/utils/familyWall';
import { alertPhotoError, pickImage, uploadImage } from '../../src/utils/media';
import { notifyUsers } from '../../src/utils/notifications';
import { companyLogoOf } from '../../src/project/companyLogo';
import {
  canManageCompanyNews,
  canPublishCompanyNews,
  normalizeCompanyNewsSettings,
} from '../../src/project/companyNews';
import {
  createCompanyNewsPost,
  listenCompanyNews,
  markCompanyNewsPost,
  removeCompanyNewsPost,
  updateCompanyNewsPost,
} from '../../src/project/companyNewsStore';

const PROMPTS = [
  'Status fra prosjektet',
  'Frist å merke seg',
  'Avklart med oppdragsgiver',
  'Endring i bemanning',
];

function postTime(ts) {
  try {
    const date = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    if (!date || Number.isNaN(date.getTime())) return 0;
    return date.getTime();
  } catch {
    return 0;
  }
}

function formatWhen(ts) {
  const time = postTime(ts);
  if (!time) return '';
  return new Date(time).toLocaleString('nb-NO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function wasEdited(post) {
  const created = postTime(post?.createdAt);
  const updated = postTime(post?.updatedAt);
  return created > 0 && updated > created + 2000;
}

function openLink(url) {
  const href = normalizeWallLinkUrl(url);
  if (!href) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(href).catch(() => {
    Alert.alert('Lenke', 'Kunne ikke åpne lenken.');
  });
}

function initial(name) {
  const letter = String(name || '').trim().charAt(0);
  return letter ? letter.toUpperCase() : 'B';
}

export default function CompanyNewsScreen() {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { family, familyId, uid, members, applyFamilyPatch } = useApp();
  const companyName = family?.company?.navn || family?.name || 'Bedriften';
  const logo = companyLogoOf(family?.company);
  const isAdmin = isGroupAdmin(family, uid);
  const settings = useMemo(
    () => normalizeCompanyNewsSettings(family?.companyNews),
    [family?.companyNews],
  );
  const me = (members || []).find((member) => member.uid === uid);
  const myName = me?.name && me.name !== 'Meg' ? me.name : 'Medarbeider';
  const canPublish = canPublishCompanyNews(settings, isAdmin);

  const [posts, setPosts] = useState([]);
  const [body, setBody] = useState('');
  const [pendingImageUrl, setPendingImageUrl] = useState(null);
  const [pendingLinkUrl, setPendingLinkUrl] = useState('');
  const [editingPostId, setEditingPostId] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState(settings);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenCompanyNews(familyId, (list) => {
      setPosts((list || []).filter((post) => post.deleted !== true));
    });
  }, [familyId]);

  useEffect(() => {
    if (!settingsOpen) setDraftSettings(settings);
  }, [settings, settingsOpen]);

  const thisWeekCount = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return posts.filter((post) => postTime(post.createdAt) >= weekAgo).length;
  }, [posts]);

  const authorsThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const names = new Set(
      posts.filter((post) => postTime(post.createdAt) >= weekAgo).map((post) => post.authorName).filter(Boolean),
    );
    return [...names];
  }, [posts]);

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
    const split = splitBodyAndLinks(post.body || '', post.linkUrl);
    setEditingPostId(post.id);
    setBody(split.text);
    setPendingImageUrl(post.imageUrl || post.imageUrls?.[0] || null);
    setPendingLinkUrl(post.linkUrl || split.links[0] || '');
    setComposerOpen(true);
  }, []);

  const publish = useCallback(async () => {
    if (!familyId || busy) return;
    if (!editingPostId && !canPublish) return;
    const split = splitBodyAndLinks(body, settings.links ? pendingLinkUrl : '');
    const text = split.text;
    const imageUrl = settings.images ? (pendingImageUrl || null) : null;
    const linkUrl = settings.links ? (split.links[0] || null) : null;
    if (settings.links && pendingLinkUrl.trim() && !normalizeWallLinkUrl(pendingLinkUrl) && !linkUrl) {
      Alert.alert('Ugyldig lenke', 'Sjekk at lenken er en gyldig nettadresse.');
      return;
    }
    if (!text && !imageUrl && !linkUrl) return;
    setBusy(true);
    try {
      if (editingPostId) {
        await updateCompanyNewsPost(familyId, editingPostId, {
          body: text,
          imageUrl,
          imageUrls: imageUrl ? [imageUrl] : [],
          linkUrl,
          editorUid: uid,
          isAdmin,
        });
      } else {
        await createCompanyNewsPost({
          companyId: familyId,
          authorUid: uid,
          authorName: myName,
          body: text,
          imageUrl,
          linkUrl,
        });
        if (settings.notify) {
          const others = (members || []).map((member) => member.uid).filter((id) => id && id !== uid);
          const notifyBody = text
            ? `${myName}: ${text.slice(0, 90)}`
            : linkUrl
              ? `${myName} delte en lenke`
              : `${myName} delte et bilde`;
          await notifyUsers(others, {
            eventType: 'companyNews',
            title: `Nyhet i ${companyName}`,
            body: notifyBody,
            familyId,
            createdBy: uid,
          }).catch(() => {});
        }
      }
      closeComposer();
    } catch (err) {
      Alert.alert('Nyheter', err?.message || 'Kunne ikke publisere saken.');
    } finally {
      setBusy(false);
    }
  }, [
    familyId, busy, editingPostId, canPublish, body, settings, pendingLinkUrl, pendingImageUrl,
    uid, isAdmin, myName, members, companyName, closeComposer,
  ]);

  const addPhoto = useCallback(async () => {
    if (!familyId || busy || !settings.images) return;
    try {
      const picked = await pickImage({ edit: false });
      if (!picked) return;
      setBusy(true);
      const url = await uploadImage(`families/${familyId}/companyNews/${Date.now()}.jpg`, picked);
      if (url) setPendingImageUrl(url);
    } catch (err) {
      alertPhotoError(err);
    } finally {
      setBusy(false);
    }
  }, [familyId, busy, settings.images]);

  async function saveSettings() {
    if (!familyId || !isAdmin || busy) return;
    const next = normalizeCompanyNewsSettings(draftSettings);
    setBusy(true);
    try {
      await updateGroup(familyId, { companyNews: next });
      applyFamilyPatch?.(familyId, { companyNews: next });
      setSettingsOpen(false);
    } catch (err) {
      Alert.alert('Innstillinger', err?.message || 'Kunne ikke lagre innstillingene.');
    } finally {
      setBusy(false);
    }
  }

  const ready = !!(body.trim() || pendingImageUrl || pendingLinkUrl.trim()) && !busy;

  return (
    <View style={[styles.fill, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {logo?.dataUrl ? (
            <View style={[styles.logoPlate, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Image source={{ uri: logo.dataUrl }} style={styles.logo} resizeMode="contain" accessibilityLabel={`Logo for ${companyName}`} />
            </View>
          ) : null}
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={[styles.kicker, { color: colors.muted }]}>{companyName}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Nyheter</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Interne saker for bedriften. Tekst, bilder og lenker samles her, uten å blande seg med annen prat.
            </Text>
          </View>
          <View style={styles.headerActions}>
            {canPublish ? (
              <TouchableOpacity onPress={openComposer} accessibilityRole="button" accessibilityLabel="Ny sak" style={[styles.primary, { backgroundColor: colors.brand }]}>
                <Ionicons name="add" size={16} color="#fff" />
                <Text style={styles.primaryTxt}>Ny sak</Text>
              </TouchableOpacity>
            ) : null}
            {isAdmin ? (
              <TouchableOpacity
                onPress={() => { setDraftSettings(settings); setSettingsOpen(true); }}
                accessibilityRole="button"
                accessibilityLabel="Innstillinger for nyheter"
                style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Ionicons name="settings-outline" size={18} color={colors.ink} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {!canPublish ? (
          <Text style={[styles.note, { color: colors.muted }]}>Bare administratorer publiserer nyheter i denne bedriften.</Text>
        ) : null}

        <View style={styles.stats}>
          <View style={[styles.stat, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.statNum, { color: colors.ink }]}>{thisWeekCount}</Text>
            <Text style={[styles.statLbl, { color: colors.muted }]}>saker denne uken</Text>
          </View>
          <View style={[styles.stat, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.statNum, { color: colors.ink }]}>{posts.length}</Text>
            <Text style={[styles.statLbl, { color: colors.muted }]}>publisert</Text>
          </View>
        </View>
        {authorsThisWeek.length ? (
          <Text style={[styles.who, { color: colors.muted }]}>Denne uken: {authorsThisWeek.join(', ')}</Text>
        ) : null}

        {posts.map((post) => {
          const manageable = canManageCompanyNews(post, uid, isAdmin);
          const noted = post.reactions?.[uid] === 'noted';
          const split = splitBodyAndLinks(post.body || '', post.linkUrl);
          return (
            <View key={post.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <View style={styles.cardTop}>
                <View style={[styles.avatar, { backgroundColor: colors.sunken }]}>
                  <Text style={[styles.avatarTxt, { color: colors.ink }]}>{initial(post.authorName)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.author, { color: colors.ink }]}>{post.authorName || 'Medarbeider'}</Text>
                  <Text style={[styles.when, { color: colors.muted }]}>
                    {formatWhen(post.createdAt)}
                    {wasEdited(post) ? ' · endret' : ''}
                  </Text>
                </View>
                {manageable ? (
                  <View style={styles.cardActions}>
                    <TouchableOpacity onPress={() => startEdit(post)} accessibilityLabel="Rediger sak" hitSlop={8}>
                      <Ionicons name="pencil-outline" size={18} color={colors.ink} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeCompanyNewsPost(familyId, post.id)} accessibilityLabel="Fjern sak" hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
              {!!split.text && <Text style={[styles.post, { color: colors.ink }]}>{split.text}</Text>}
              {!!post.imageUrl && <Image source={{ uri: post.imageUrl }} style={styles.image} />}
              {settings.links && split.links.length ? (
                <View style={styles.linkRow}>
                  {split.links.map((href) => (
                    <TouchableOpacity key={href} onPress={() => openLink(href)} accessibilityRole="link" style={[styles.linkBtn, { backgroundColor: colors.brandSoft }]}>
                      <Ionicons name="link-outline" size={14} color={colors.brand} />
                      <Text style={{ color: colors.brand }}>Åpne lenke</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {settings.reactions ? (
                <TouchableOpacity
                  onPress={() => markCompanyNewsPost(familyId, post.id, uid)}
                  accessibilityRole="button"
                  accessibilityLabel={noted ? 'Fjern markering' : 'Merk som notert'}
                  style={styles.mark}
                >
                  <Ionicons name={noted ? 'checkmark-circle' : 'checkmark-circle-outline'} size={16} color={noted ? colors.brand : colors.muted} />
                  <Text style={{ color: noted ? colors.brand : colors.muted }}>Notert {post.reactionCount || 0}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}

        {!posts.length ? (
          <View style={[styles.empty, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>Ingen nyheter ennå</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Publiser en sak når bedriften skal vite om en frist, en avklaring eller en endring.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={composerOpen} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={closeComposer}>
        <Pressable style={[styles.backdrop, isDesktop && desktopOverlay]} onPress={closeComposer}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={isDesktop ? undefined : styles.avoid}>
            <Pressable style={[styles.sheet, { backgroundColor: colors.card }, isDesktop && [desktopSheet, styles.sheetDesk]]} onPress={() => {}}>
              <Text style={[styles.sheetTitle, { color: colors.ink }]}>{editingPostId ? 'Rediger sak' : 'Ny sak'}</Text>
              <ScrollView keyboardShouldPersistTaps="handled" style={styles.sheetScroll}>
                <TextInput
                  value={body}
                  onChangeText={setBody}
                  placeholder="Skriv en oppdatering til bedriften"
                  placeholderTextColor={colors.placeholder}
                  multiline
                  autoFocus
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.sunken }]}
                />
                {!editingPostId ? (
                  <View style={styles.prompts}>
                    {PROMPTS.map((prompt) => (
                      <TouchableOpacity key={prompt} onPress={() => setBody(prompt)} style={[styles.prompt, { backgroundColor: colors.brandSoft }]}>
                        <Text style={{ color: colors.brand, fontSize: 13 }}>{prompt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                {pendingImageUrl ? (
                  <View style={styles.pending}>
                    <Image source={{ uri: pendingImageUrl }} style={styles.pendingImage} />
                    <TouchableOpacity onPress={() => setPendingImageUrl(null)} accessibilityLabel="Fjern bilde" style={styles.pendingRemove}>
                      <Ionicons name="close" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : null}
                {settings.images ? (
                  <TouchableOpacity onPress={addPhoto} disabled={busy} style={styles.attach}>
                    <Ionicons name="image-outline" size={18} color={colors.brand} />
                    <Text style={{ color: colors.brand }}>{pendingImageUrl ? 'Bytt bilde' : 'Legg ved bilde'}</Text>
                  </TouchableOpacity>
                ) : null}
                {settings.links ? (
                  <View style={[styles.linkField, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
                    <Ionicons name="link-outline" size={18} color={colors.muted} />
                    <TextInput
                      value={pendingLinkUrl}
                      onChangeText={setPendingLinkUrl}
                      placeholder="Lenke, valgfritt"
                      placeholderTextColor={colors.placeholder}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      style={[styles.linkInput, { color: colors.ink }]}
                    />
                  </View>
                ) : null}
              </ScrollView>
              <View style={styles.sheetActions}>
                <TouchableOpacity onPress={closeComposer} style={[styles.secondary, styles.sheetBtn, { backgroundColor: colors.sunken }]}>
                  <Text style={{ color: colors.ink }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={publish} disabled={!ready} style={[styles.primary, styles.sheetBtn, { backgroundColor: colors.brand, opacity: ready ? 1 : 0.5 }]}>
                  <Text style={styles.primaryTxt}>{editingPostId ? 'Lagre' : 'Publiser'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal visible={settingsOpen} animationType={isDesktop ? 'fade' : 'slide'} transparent onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={[styles.backdrop, isDesktop && desktopOverlay]} onPress={() => setSettingsOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card }, isDesktop && [desktopSheet, styles.sheetDesk]]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Innstillinger for nyheter</Text>
            <Text style={[styles.lead, { color: colors.muted }]}>
              Samme rammer som en intern vegg: saker, bilder, lenker og markering. Her gjelder de bedriften.
            </Text>
            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Hvem kan publisere</Text>
            <View style={styles.prompts}>
              {[['members', 'Alle i bedriften'], ['admins', 'Bare administratorer']].map(([id, label]) => {
                const on = draftSettings.whoCanPost === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setDraftSettings((current) => ({ ...current, whoCanPost: id }))}
                    style={[styles.prompt, { borderWidth: 1, borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                  >
                    <Text style={{ color: on ? colors.brand : colors.ink }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {[
              ['images', 'Bilder', 'Saker kan ha ett vedlagt bilde.'],
              ['links', 'Lenker', 'Nettadresser vises som en lenke.'],
              ['reactions', 'Markering', 'Medarbeidere kan merke en sak som notert.'],
              ['notify', 'Varsle bedriften', 'De andre får varsel når en ny sak publiseres.'],
            ].map(([key, label, help]) => (
              <View key={key} style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink }}>{label}</Text>
                  <Text style={[styles.help, { color: colors.muted }]}>{help}</Text>
                </View>
                <Switch
                  value={!!draftSettings[key]}
                  onValueChange={(value) => setDraftSettings((current) => ({ ...current, [key]: value }))}
                />
              </View>
            ))}
            <Text style={[styles.help, { color: colors.muted }]}>
              Administrator kan redigere og fjerne alle saker. Den som skrev saken kan endre sin egen.
            </Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity onPress={() => setSettingsOpen(false)} style={[styles.secondary, styles.sheetBtn, { backgroundColor: colors.sunken }]}>
                <Text style={{ color: colors.ink }}>Lukk</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveSettings} disabled={busy} style={[styles.primary, styles.sheetBtn, { backgroundColor: colors.brand }]}>
                <Text style={styles.primaryTxt}>{busy ? 'Lagrer…' : 'Lagre'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 820, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  logoPlate: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  logo: { width: 132, height: 48 },
  kicker: { fontSize: 12, letterSpacing: 0.3 },
  title: { fontSize: 26, fontWeight: '600' },
  lead: { fontSize: 14, lineHeight: 20 },
  headerActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, minHeight: 38, paddingHorizontal: 14, justifyContent: 'center' },
  primaryTxt: { color: '#fff' },
  iconBtn: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '600' },
  statLbl: { fontSize: 12, textAlign: 'center' },
  who: { fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontWeight: '600' },
  author: { fontWeight: '600' },
  when: { fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 12 },
  post: { fontSize: 15, lineHeight: 22 },
  image: { width: '100%', height: 220, borderRadius: 10, backgroundColor: '#e2e8f0' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkBtn: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  mark: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  empty: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  avoid: { width: '100%' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '88%' },
  sheetDesk: { maxWidth: 520, width: '100%', borderRadius: 14 },
  sheetTitle: { fontSize: 18, fontWeight: '600' },
  sheetScroll: { flexGrow: 0, maxHeight: 380 },
  input: { minHeight: 96, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, textAlignVertical: 'top' },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  prompt: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  pending: { marginTop: 10 },
  pendingImage: { width: '100%', height: 150, borderRadius: 10 },
  pendingRemove: { position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(15,23,42,0.72)', alignItems: 'center', justifyContent: 'center' },
  attach: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, alignSelf: 'flex-start' },
  linkField: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  linkInput: { flex: 1, paddingVertical: 10, fontSize: 14 },
  sheetActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  secondary: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sheetBtn: { flex: 1 },
  fieldLabel: { fontSize: 12, marginTop: 4 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  help: { fontSize: 12, lineHeight: 17 },
});
