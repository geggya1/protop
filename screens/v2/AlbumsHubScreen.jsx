/**
 * Familiealbum — private bilder/video utenfor chat.
 * Multi-opplasting, varianter (thumb/display/original), info, slett og utvalg.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  Image, Alert, Modal, Pressable, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import AlbumUploadProgress from '../../components/AlbumUploadProgress';
import AlbumMediaViewer from '../../components/AlbumMediaViewer';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import {
  listenAlbums, listenAlbumPhotos, createAlbum, addAlbumPhoto, updateAlbumShare,
  softDeleteAlbum, softDeletePhoto, softDeletePhotos,
} from '../../src/utils/familyAlbums';
import {
  filterVisibleAlbums, albumViewerSummary, albumShareStateFromDoc,
  buildAlbumSharePatch, friendUidsFromViewerList,
} from '../../src/utils/albumVisibility';
import { familyShareMemberUids } from '../../src/utils/grandparentAccess';
import WishlistSharePicker from '../../components/WishlistSharePicker';
import { shareAlbumWithFriends, listenSharedAlbums } from '../../src/utils/friends';
import { pickAlbumMedia, alertPhotoError } from '../../src/utils/media';
import {
  processAndUploadAlbumMedia, albumThumbUrl, downloadAlbumOriginals,
} from '../../src/utils/albumMedia';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

function queueItemId() {
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Album sheets: web uses a portal (RN Modal is unreliable in Safari/Chrome and
 * a hidden Modal can leave a full-screen layer that eats taps on album detail).
 */
function AlbumSheet({ visible, busy, isDesktop, onClose, children }) {
  if (!visible) return null;

  const sheet = (
    <Pressable
      style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
      onPress={() => !busy && onClose()}
    >
      <Pressable
        style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
        onPress={(e) => e.stopPropagation?.()}
      >
        {children}
      </Pressable>
    </Pressable>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && document.body) {
    return createPortal(
      <div style={webPortalRootStyle}>{sheet}</div>,
      document.body,
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={() => !busy && onClose()}
    >
      {sheet}
    </Modal>
  );
}

const webPortalRootStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 2147483646,
  display: 'flex',
  flexDirection: 'column',
};

function friendlyUploadError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || 'Feilet');
  if (/internal|INTERNAL/i.test(msg) || /functions\/internal/i.test(code)) {
    return 'Serverfeil ved opplasting. Prøv igjen om litt.';
  }
  if (/not-found|NOT_FOUND|functions\/not-found/i.test(`${code} ${msg}`)) {
    return 'Opplastingstjenesten er ikke klar ennå. Prøv igjen snart.';
  }
  if (/permission|unauth|PERMISSION|UNAUTH/i.test(`${code} ${msg}`)) {
    return 'Mangler tilgang til å laste opp.';
  }
  // Strip Firebase "functions/" prefix noise
  return msg.replace(/^Firebase:\s*/i, '').replace(/\s*\(functions\/[^)]+\)\.?/i, '').trim() || 'Feilet';
}

export default function AlbumsHubScreen({ inShell = false }) {
  const { isDesktop } = useLayout();
  const {
    familyId, uid, members, friendPeople, isParent, isChild, isActingAsChild, isGrandparent,
    shellIntent, clearShellIntent,
  } = useApp();
  const manageAlbums = isParent && !isActingAsChild && !isGrandparent;
  const childViewer = isChild || isActingAsChild;
  const myName = members.find((m) => m.uid === uid)?.name || '';
  const [albums, setAlbums] = useState([]);
  const [sharedAlbums, setSharedAlbums] = useState([]);
  const [activeId, setActiveId] = useState(null);
  /** When viewing an album shared from another family */
  const [externalFamilyId, setExternalFamilyId] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [shareMode, setShareMode] = useState('family');
  const [shareViewerUids, setShareViewerUids] = useState([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const albumFamilyId = externalFamilyId || familyId;
  const viewingShared = !!externalFamilyId;
  const canEditAlbum = manageAlbums && !viewingShared;
  const [pendingDelete, setPendingDelete] = useState(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [viewerPhoto, setViewerPhoto] = useState(null);
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState(null);
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const uploadingRef = useRef(false);
  const queueRef = useRef([]);

  useHelpScene(createOpen || activeId ? 'inner' : 'hub', {
    onRetreat: () => {
      if (createOpen) setCreateOpen(false);
      else if (activeId) {
        setActiveId(null);
        setExternalFamilyId(null);
      }
    },
  });

  useEffect(() => {
    if (!familyId) return undefined;
    return listenAlbums(familyId, setAlbums);
  }, [familyId]);

  useEffect(() => {
    if (!uid) {
      setSharedAlbums([]);
      return undefined;
    }
    return listenSharedAlbums(uid, setSharedAlbums);
  }, [uid]);

  useEffect(() => {
    if (!albumFamilyId || !activeId) {
      setPhotos([]);
      return undefined;
    }
    return listenAlbumPhotos(albumFamilyId, activeId, setPhotos);
  }, [albumFamilyId, activeId]);

  useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setViewerPhoto(null);
  }, [activeId, externalFamilyId]);

  const openOwnAlbum = useCallback((id) => {
    setExternalFamilyId(null);
    setActiveId(id);
  }, []);

  const openSharedAlbum = useCallback((row) => {
    const fid = row?.familyId;
    const aid = row?.albumId || row?.id;
    if (!fid || !aid) {
      Alert.alert('Album', 'Delingen mangler familie eller album-id.');
      return;
    }
    setExternalFamilyId(fid);
    setActiveId(aid);
  }, []);

  const closeAlbumDetail = useCallback(() => {
    setActiveId(null);
    setExternalFamilyId(null);
  }, []);

  const visibleAlbums = useMemo(
    () => filterVisibleAlbums(albums, { uid, isParent: manageAlbums, isGrandparent }),
    [albums, uid, manageAlbums, isGrandparent],
  );

  const openCreate = useCallback(() => {
    setNewTitle('');
    setShareMode('family');
    setShareViewerUids(members.map((m) => m.uid).filter(Boolean));
    setCreateOpen(true);
  }, [members]);

  const create = useCallback(async () => {
    if (busy) return;
    if (!familyId) {
      Alert.alert('Velg familie', 'Du må være i en familie for å opprette album.');
      return;
    }
    const title = newTitle.trim() || 'Nytt album';
    setBusy(true);
    try {
      const share = buildAlbumSharePatch({
        mode: shareMode,
        viewerUids: shareViewerUids,
        uid,
        familyMemberUids: familyShareMemberUids(members),
      });
      const id = await createAlbum(familyId, {
        title,
        createdBy: uid,
        creatorName: myName,
        visibility: share.visibility,
        viewerUids: share.viewerUids,
      });
      const friendUids = friendUidsFromViewerList(share.viewerUids, { members, uid });
      if (friendUids.length) {
        await shareAlbumWithFriends({
          familyId,
          albumId: id,
          albumTitle: title,
          ownerUid: uid,
          friendUids,
        });
      }
      setNewTitle('');
      setCreateOpen(false);
      setExternalFamilyId(null);
      setActiveId(id);
    } catch (err) {
      Alert.alert('Feil', friendlyUploadError(err) || 'Klarte ikke opprette album.');
    } finally {
      setBusy(false);
    }
  }, [familyId, newTitle, uid, myName, busy, shareMode, shareViewerUids, members]);

  const openShareEditor = useCallback((album) => {
    if (!album || viewingShared) return;
    const state = albumShareStateFromDoc(album);
    setShareMode(state.mode);
    setShareViewerUids(state.viewerUids);
    setShareOpen(true);
  }, [viewingShared]);

  const saveShare = useCallback(async () => {
    if (!familyId || !activeId || shareBusy || viewingShared) return;
    setShareBusy(true);
    try {
      const album = albums.find((a) => a.id === activeId);
      const patch = buildAlbumSharePatch({
        mode: shareMode,
        viewerUids: shareViewerUids,
        uid,
        ownerIds: album ? [album.createdBy].filter(Boolean) : [],
        familyMemberUids: familyShareMemberUids(members),
      });
      await updateAlbumShare(familyId, activeId, patch);
      const friendUids = friendUidsFromViewerList(patch.viewerUids, { members, uid });
      if (friendUids.length) {
        await shareAlbumWithFriends({
          familyId,
          albumId: activeId,
          albumTitle: album?.title || 'Album',
          ownerUid: uid,
          friendUids,
        });
      }
      setShareOpen(false);
    } catch {
      Alert.alert('Feil', 'Klarte ikke lagre deling.');
    } finally {
      setShareBusy(false);
    }
  }, [familyId, activeId, shareBusy, albums, shareMode, shareViewerUids, uid, members, viewingShared]);


  const patchQueueItem = useCallback((id, patch) => {
    const next = queueRef.current.map((x) => (x.id === id ? { ...x, ...patch } : x));
    queueRef.current = next;
    setUploadQueue(next);
  }, []);

  const removeQueueItem = useCallback((id) => {
    const next = queueRef.current.filter((x) => x.id !== id);
    queueRef.current = next;
    setUploadQueue(next);
  }, []);

  const runUploadQueue = useCallback(async (albumId) => {
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    try {
      while (true) {
        const next = queueRef.current.find((x) => x.status === 'pending');
        if (!next) break;
        patchQueueItem(next.id, { status: 'uploading', progress: 0 });
        try {
          const result = await processAndUploadAlbumMedia(next.picked, {
            familyId,
            albumId,
            onProgress: (p) => patchQueueItem(next.id, { progress: p }),
          });
          await addAlbumPhoto(familyId, albumId, {
            ...result,
            createdBy: uid,
            creatorName: myName,
          });
          patchQueueItem(next.id, { status: 'done', progress: 100 });
          await new Promise((r) => setTimeout(r, 280));
          removeQueueItem(next.id);
        } catch (err) {
          patchQueueItem(next.id, {
            status: 'error',
            error: friendlyUploadError(err),
            progress: 100,
          });
          await new Promise((r) => setTimeout(r, 1600));
          removeQueueItem(next.id);
        }
      }
    } finally {
      uploadingRef.current = false;
    }
  }, [familyId, uid, myName, patchQueueItem, removeQueueItem]);

  const addMedia = useCallback(async () => {
    if (!familyId || !activeId) return;
    try {
      const picked = await pickAlbumMedia({ max: 24 });
      if (!picked?.length) return;
      const items = picked.map((file) => {
        const mime = file.mimeType || file.blob?.type || '';
        const video = String(mime).startsWith('video/')
          || /\.(mp4|m4v|mov|webm)$/i.test(file.name || '');
        return {
          id: queueItemId(),
          name: file.name || (video ? 'Video' : 'Bilde'),
          previewUri: video ? null : (file.uri || null),
          mediaType: video ? 'video' : 'image',
          progress: 0,
          status: 'pending',
          picked: file,
        };
      });
      // Hold køen synkron i ref så opplasting starter med riktige elementer.
      queueRef.current = [...queueRef.current, ...items];
      setUploadQueue(queueRef.current);
      runUploadQueue(activeId);
    } catch (e) {
      alertPhotoError(e);
    }
  }, [familyId, activeId, runUploadQueue]);

  useEffect(() => {
    if (shellIntent !== 'create' || !manageAlbums) return;
    clearShellIntent?.();
    if (activeId) addMedia();
    else openCreate();
  }, [shellIntent, manageAlbums, clearShellIntent, activeId, addMedia, openCreate]);

  const confirmDelete = useCallback(async () => {
    if (!familyId || !pendingDelete?.id || viewingShared) return;
    await softDeleteAlbum(familyId, pendingDelete.id);
    if (activeId === pendingDelete.id) closeAlbumDetail();
    setPendingDelete(null);
  }, [familyId, pendingDelete, activeId, viewingShared, closeAlbumDetail]);

  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => {
      if (v) setSelectedIds(new Set());
      return !v;
    });
  }, []);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedPhotos = useMemo(
    () => photos.filter((p) => selectedIds.has(p.id)),
    [photos, selectedIds],
  );

  const confirmPhotoDelete = useCallback(async () => {
    if (!familyId || !activeId || !pendingPhotoDelete?.id) return;
    await softDeletePhoto(familyId, activeId, pendingPhotoDelete.id);
    if (viewerPhoto?.id === pendingPhotoDelete.id) setViewerPhoto(null);
    setPendingPhotoDelete(null);
  }, [familyId, activeId, pendingPhotoDelete, viewerPhoto]);

  const confirmBulkDelete = useCallback(async () => {
    if (!familyId || !activeId || !selectedPhotos.length) {
      setPendingBulkDelete(false);
      return;
    }
    await softDeletePhotos(familyId, activeId, selectedPhotos.map((p) => p.id));
    setSelectedIds(new Set());
    setSelectMode(false);
    setPendingBulkDelete(false);
  }, [familyId, activeId, selectedPhotos]);

  const downloadSelected = useCallback(async () => {
    if (!selectedPhotos.length) return;
    await downloadAlbumOriginals(selectedPhotos);
  }, [selectedPhotos]);

  const shellBtn = useMemo(() => {
    if (!canEditAlbum) return null;
    if (activeId) {
      return (
        <View style={styles.shellActions}>
          <TouchableOpacity
            onPress={toggleSelectMode}
            style={[styles.pencilBtn, selectMode && styles.pencilBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={selectMode ? 'Avslutt utvalg' : 'Velg flere'}
            hitSlop={8}
          >
            <Ionicons
              name={selectMode ? 'close' : 'pencil'}
              size={18}
              color={selectMode ? '#fff' : colors.brand}
            />
          </TouchableOpacity>
          {!selectMode ? (
            <HelpTarget id="add" onAdvance={addMedia}>
              <ShellAddButton label="Legg til bilder" onPress={addMedia} accessibilityLabel="Legg til flere bilder eller video" />
            </HelpTarget>
          ) : null}
        </View>
      );
    }
    return (
      <HelpTarget id="add" onAdvance={openCreate}>
        <ShellAddButton label="Nytt album" onPress={openCreate} />
      </HelpTarget>
    );
  }, [canEditAlbum, activeId, addMedia, openCreate, selectMode, toggleSelectMode]);
  useShellTitleRight(shellBtn, { active: !createOpen && !viewingShared });

  const shareSheet = (
    <AlbumSheet
      visible={shareOpen}
      busy={shareBusy}
      isDesktop={isDesktop}
      onClose={() => setShareOpen(false)}
    >
      {!isDesktop ? <View style={styles.sheetHandle} /> : null}
      <Text style={styles.modalTitle}>Hvem ser albumet?</Text>
      <WishlistSharePicker
        mode={shareMode}
        viewerUids={shareViewerUids}
        members={members}
        friends={friendPeople || []}
        familyId={familyId}
        uid={uid}
        ownerIds={[albums.find((a) => a.id === activeId)?.createdBy, uid].filter(Boolean)}
        hideOtherFamilies
        title="Velg synlighet"
        hint="Bare personer albumet er delt med kan åpne det. Foresatte kan alltid administrere."
        onChange={({ mode, viewerUids }) => {
          setShareMode(mode);
          setShareViewerUids(viewerUids);
        }}
      />
      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => setShareOpen(false)} disabled={shareBusy}>
          <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryBtn} onPress={saveShare} disabled={shareBusy}>
          <Text style={styles.primaryBtnTxt}>{shareBusy ? 'Lagrer…' : 'Lagre'}</Text>
        </TouchableOpacity>
      </View>
    </AlbumSheet>
  );

  if (activeId) {
    const ownAlbum = albums.find((a) => a.id === activeId);
    const sharedMeta = sharedAlbums.find((a) => (a.albumId || a.id) === activeId);
    const album = ownAlbum || (sharedMeta ? {
      id: activeId,
      title: sharedMeta.title || 'Delt album',
      createdBy: sharedMeta.sharedBy,
      visibility: 'shared',
      viewerUids: [uid],
    } : null);
    return (
      <Screen>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.back} onPress={closeAlbumDetail}>
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>{viewingShared ? 'Delt med meg' : 'Alle album'}</Text>
          </TouchableOpacity>
          {!inShell ? <Text style={styles.title}>{album?.title || 'Album'}</Text> : (
            <Text style={styles.albumHeading}>{album?.title || 'Album'}</Text>
          )}
          <Mute>
            {viewingShared
              ? 'Album delt med deg av en venn. Du kan se bildene, men ikke endre deling.'
              : 'Tips: På iPhone trykk «Velg» øverst i bildebiblioteket for å markere flere bilder/videoer.'}
          </Mute>

          {!viewingShared ? (
          <View style={styles.shareBox}>
            <View style={{ flex: 1 }}>
              <Text style={styles.shareLabel}>Hvem ser albumet</Text>
              <Text style={styles.shareValue}>{albumViewerSummary(album, { members, friends: friendPeople || [] })}</Text>
            </View>
            {canEditAlbum ? (
              <TouchableOpacity
                style={styles.shareBtn}
                onPress={() => openShareEditor(album)}
                accessibilityRole="button"
                accessibilityLabel="Endre hvem som ser albumet"
              >
                <Ionicons name="people-outline" size={16} color={colors.brand} />
                <Text style={styles.shareBtnTxt}>Endre</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          ) : null}


          {selectMode ? (
            <View style={styles.selectBar}>
              <Text style={styles.selectCount}>
                {selectedIds.size ? `${selectedIds.size} valgt` : 'Trykk for å velge'}
              </Text>
              <View style={styles.selectActions}>
                <TouchableOpacity
                  style={[styles.selectActionBtn, !selectedIds.size && styles.selectActionDisabled]}
                  disabled={!selectedIds.size}
                  onPress={downloadSelected}
                  accessibilityRole="button"
                  accessibilityLabel="Last ned valgte"
                >
                  <Ionicons name="download-outline" size={16} color={colors.brand} />
                  <Text style={styles.selectActionTxt}>Last ned</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.selectActionBtn, styles.selectActionDanger, !selectedIds.size && styles.selectActionDisabled]}
                  disabled={!selectedIds.size}
                  onPress={() => setPendingBulkDelete(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Slett valgte"
                >
                  <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                  <Text style={[styles.selectActionTxt, { color: '#b91c1c' }]}>Slett</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <View style={styles.grid}>
            {photos.map((p) => {
              const selected = selectedIds.has(p.id);
              const uri = albumThumbUrl(p);
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.thumbWrap, selectMode && selected && styles.thumbSelected]}
                  onPress={() => {
                    if (selectMode) toggleSelected(p.id);
                    else setViewerPhoto(p);
                  }}
                  onLongPress={() => {
                    if (!selectMode) {
                      setSelectMode(true);
                      setSelectedIds(new Set([p.id]));
                    }
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={p.fileName || (p.mediaType === 'video' ? 'Video' : 'Bilde')}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.thumb} />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]}>
                      <Ionicons name="image-outline" size={22} color={colors.muted} />
                    </View>
                  )}
                  {p.mediaType === 'video' ? (
                    <View style={styles.videoBadge}>
                      <Ionicons name="play" size={12} color="#fff" />
                    </View>
                  ) : null}
                  {selectMode ? (
                    <View style={[styles.check, selected && styles.checkOn]}>
                      {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
          {!photos.length && (
            <Mute>Ingen bilder ennå. Bruk «Legg til bilder» øverst til høyre — du kan markere flere samtidig.</Mute>
          )}
        </ScrollView>

        <AlbumUploadProgress items={uploadQueue} />

        <AlbumMediaViewer
          visible={!!viewerPhoto}
          photo={viewerPhoto}
          canDelete={canEditAlbum}
          onClose={() => setViewerPhoto(null)}
          onDelete={() => setPendingPhotoDelete(viewerPhoto)}
        />

        <ConfirmActionModal
          visible={!!pendingPhotoDelete}
          title="Slette bilde?"
          body="Bildet slettes for hele familien. Originalfilen fjernes fra albumet."
          confirmLabel="Slett"
          danger
          onCancel={() => setPendingPhotoDelete(null)}
          onConfirm={confirmPhotoDelete}
        />
        <ConfirmActionModal
          visible={pendingBulkDelete}
          title={`Slette ${selectedIds.size} ${selectedIds.size === 1 ? 'element' : 'elementer'}?`}
          body="Valgte bilder/videoer slettes for hele familien."
          confirmLabel="Slett"
          danger
          onCancel={() => setPendingBulkDelete(false)}
          onConfirm={confirmBulkDelete}
        />
        {shareSheet}
      </Screen>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="albums">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <ModuleHubIntro>
        {!inShell && <Text style={styles.title}>Familiealbum</Text>}
        <Mute>Private øyeblikk for familien — utenfor chat.</Mute>
        </ModuleHubIntro>

        {visibleAlbums.map((a, idx) => (
          <View key={a.id} style={styles.albumRow}>
            <TouchableOpacity
              style={styles.albumMain}
              onPress={() => openOwnAlbum(a.id)}
              accessibilityRole="button"
            >
              {idx === 0 ? (
                <HelpTarget id="content" onAdvance={() => openOwnAlbum(a.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  {a.coverUrl ? (
                    <Image source={{ uri: a.coverUrl }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, styles.coverEmpty]}>
                      <Ionicons name="images-outline" size={22} color={colors.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.albumTitle}>{a.title}</Text>
                    <Text style={styles.albumMeta}>{a.createdByName || 'Familie'}</Text>
                    <Text style={styles.albumMeta}>Ser: {albumViewerSummary(a, { members, friends: friendPeople || [] })}</Text>
                  </View>
                </HelpTarget>
              ) : (
                <>
                  {a.coverUrl ? (
                    <Image source={{ uri: a.coverUrl }} style={styles.cover} />
                  ) : (
                    <View style={[styles.cover, styles.coverEmpty]}>
                      <Ionicons name="images-outline" size={22} color={colors.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.albumTitle}>{a.title}</Text>
                    <Text style={styles.albumMeta}>{a.createdByName || 'Familie'}</Text>
                    <Text style={styles.albumMeta}>Ser: {albumViewerSummary(a, { members, friends: friendPeople || [] })}</Text>
                  </View>
                </>
              )}
            </TouchableOpacity>
            {manageAlbums ? (
              <TouchableOpacity
                onPress={() => setPendingDelete(a)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Slett ${a.title || 'album'}`}
              >
                <Ionicons name="trash-outline" size={18} color="#b91c1c" />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {!visibleAlbums.length && (
          <HelpTarget id="content" style={{ width: '100%' }}>
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Ingen album ennå</Text>
            <Text style={styles.emptySub}>
              Lag et album for ferie, bursdag eller hverdagen. Knappen sitter øverst til høyre.
            </Text>
          </View>
          </HelpTarget>
        )}

        {(sharedAlbums || []).length > 0 ? (
          <>
            <Text style={styles.sharedHeading}>Delt med meg</Text>
            <Mute>Album venner har delt med deg.</Mute>
            {sharedAlbums.map((sa) => {
              const aid = sa.albumId || sa.id;
              return (
                <View key={`shared-${aid}`} style={styles.albumRow}>
                  <TouchableOpacity
                    style={styles.albumMain}
                    onPress={() => openSharedAlbum(sa)}
                    accessibilityRole="button"
                  >
                    <View style={[styles.cover, styles.coverEmpty, styles.sharedCover]}>
                      <Ionicons name="people-outline" size={22} color={colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.albumTitle}>{sa.title || 'Delt album'}</Text>
                      <Text style={styles.albumMeta}>Fra en venn</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        ) : null}
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
      <AlbumSheet
        visible={createOpen}
        busy={busy}
        isDesktop={isDesktop}
        onClose={() => setCreateOpen(false)}
      >
        {!isDesktop ? <View style={styles.sheetHandle} /> : null}
        <Text style={styles.modalTitle}>Nytt album</Text>
        <HelpTarget id="input">
          <TextInput
            style={styles.input}
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Navn (f.eks. Sommer 2026)"
            placeholderTextColor={colors.placeholder}
            autoFocus={Platform.OS === 'web'}
            onSubmitEditing={create}
            returnKeyType="done"
          />
        </HelpTarget>
        <View style={{ marginTop: 12 }}>
          <WishlistSharePicker
            mode={shareMode}
            viewerUids={shareViewerUids}
            members={members}
            friends={friendPeople || []}
            familyId={familyId}
            uid={uid}
            ownerIds={[uid].filter(Boolean)}
            hideOtherFamilies
            title="Hvem ser albumet?"
            hint="Albumet må være delt med personen for at de skal se det. Du kan endre dette senere."
            onChange={({ mode, viewerUids }) => {
              setShareMode(mode);
              setShareViewerUids(viewerUids);
            }}
          />
        </View>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setCreateOpen(false)} disabled={busy}>
            <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.primaryBtn} onPress={create} disabled={busy}>
            <Text style={styles.primaryBtnTxt}>{busy ? 'Oppretter…' : 'Opprett'}</Text>
          </TouchableOpacity>
        </View>
      </AlbumSheet>

      {shareSheet}
      <ConfirmActionModal
        visible={!!pendingDelete}
        title="Slette album?"
        body={`«${pendingDelete?.title || 'Album'}» slettes for hele familien.`}
        confirmLabel="Slett"
        danger
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  shareBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginTop: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  shareLabel: { fontSize: 12, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  shareValue: { fontSize: 14, fontWeight: '500', color: colors.ink, marginTop: 2 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  shareBtnTxt: { color: colors.brand, fontWeight: '600', fontSize: 13 },

  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { padding: 16, paddingBottom: 120 },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  albumHeading: { fontSize: 17, fontWeight: '500', color: colors.ink, marginBottom: 12 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 8 },
  backTxt: { color: colors.brand, fontWeight: '500' },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    backgroundColor: colors.card, color: colors.ink, minHeight: 48, marginTop: 12,
  },
  albumRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 14, padding: 10, marginTop: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  albumMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  cover: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#e2e8f0' },
  coverEmpty: { alignItems: 'center', justifyContent: 'center' },
  sharedCover: { backgroundColor: colors.brandSoft },
  sharedHeading: {
    marginTop: 28,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  albumTitle: { fontWeight: '500', color: colors.ink },
  albumMeta: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '400' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumbWrap: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    position: 'relative',
  },
  thumbSelected: {
    borderWidth: 2,
    borderColor: colors.brand,
  },
  thumb: { width: '100%', height: '100%' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  videoBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15,23,42,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  shellActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pencilBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pencilBtnActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
  },
  selectCount: { color: colors.ink, fontWeight: '500', fontSize: 13, flexShrink: 1 },
  selectActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  selectActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.card,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selectActionDanger: { borderColor: '#fecaca' },
  selectActionDisabled: { opacity: 0.45 },
  selectActionTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  emptyBox: { marginTop: 28, alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  emptyTitle: { fontWeight: '500', fontSize: 17, color: colors.ink, textAlign: 'center' },
  emptySub: {
    color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20,
    textAlign: 'center', maxWidth: 360,
  },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28,
  },
  modalSheetDesk: {
    alignSelf: 'center', marginBottom: 0, maxWidth: 420, width: '100%',
    borderRadius: 12, padding: 18,
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 12,
  },
  modalTitle: { fontSize: 17, fontWeight: '500', color: colors.ink },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '500' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '500' },
});
