import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, FlatList, Platform, Linking,
  Modal, TextInput, ScrollView, Image, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import DocumentFileDetailSheet from '../../components/documents/DocumentFileDetailSheet';
import DocumentBilagEditSheet from '../../components/documents/DocumentBilagEditSheet';
import { InfoDialog } from '../../components/ConfirmDialog';
import ConfirmDialog from '../../components/ConfirmDialog';
import { DeskBtn } from '../../components/DeskBtn';
import HelpTarget from '../../components/HelpTarget';
import PlusActionMenu from '../../components/PlusActionMenu';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { pickDocument, uploadDocument, FAMILY_DOCUMENT_ACCEPT } from '../../src/utils/media';
import { useDocumentScanCrop } from '../../src/hooks/useDocumentScanCrop';
import { isImageUpload } from '../../src/utils/documentScanCrop';
import { mergeDocumentPages, canMergeDocumentPages } from '../../src/utils/documentImageMerge';
import { ocrReceiptWithAi, blobToDataUrl } from '../../src/utils/receiptOcr';
import {
  listenFolder, listenFolderFiles, addFolderFile, updateFolderFile, deleteFolderFile,
  createFolder, getChildFolders, canManageFolder, canEditFile, canUploadToFolder,
  canCreateSubfolder, memberSummary, formatFileSize, fileIcon, filesFromNativeFile, FOLDER_PRESETS,
  isImageFile, emptyBilag, formatBilagAmount, filterDocumentFiles, sortFilesForDocumentList,
  isReceiptFile,
} from '../../src/utils/familyDocuments';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

/** What the user intends to upload — only «receipt» triggers bilag + AI-OCR. */
const UPLOAD_INTENTS = {
  receipt: {
    id: 'receipt',
    icon: 'receipt-outline',
    label: 'Kvittering eller bilag',
    hint: 'AI leser leverandør, beløp og dato',
    cropTitle: 'Juster kvittering',
    mergeName: 'kvittering.jpg',
  },
  document: {
    id: 'document',
    icon: 'document-text-outline',
    label: 'Dokument',
    hint: 'F.eks. fødselsattest, kontrakt eller diplom',
    cropTitle: 'Juster dokument',
    mergeName: 'dokument.jpg',
  },
  drawing: {
    id: 'drawing',
    icon: 'color-palette-outline',
    label: 'Tegning eller skisse',
    hint: 'Bilder, skisser og tegninger',
    cropTitle: 'Juster tegning',
    mergeName: 'tegning.jpg',
  },
  other: {
    id: 'other',
    icon: 'folder-outline',
    label: 'Annet',
    hint: 'Bilder, PDF-er og andre filer',
    cropTitle: 'Juster utsnitt',
    mergeName: 'dokument.jpg',
  },
};

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

function FolderRow({ folder, fileCount, onPress, isDesktop }) {
  return (
    <TouchableOpacity
      style={[styles.folderRow, isDesktop && styles.folderRowDesk]}
      onPress={onPress}
      accessibilityRole="button"
      activeOpacity={0.75}
    >
      <View style={[styles.folderIcon, isDesktop && styles.folderIconDesk, { backgroundColor: `${folder.color || '#0ea5e9'}18` }]}>
        <Text style={styles.folderEmoji}>{folder.emoji || '📁'}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.folderName, isDesktop && styles.folderNameDesk]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={styles.folderMeta}>
          {fileCount == null ? '…' : fileCount === 0 ? 'Tom mappe' : `${fileCount} fil${fileCount === 1 ? '' : 'er'}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

function DocumentImageViewer({ visible, file, onClose }) {
  if (!file?.downloadUrl) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.viewerRoot}>
        <View style={styles.viewerTop}>
          <Text style={styles.viewerTitle} numberOfLines={1}>{file.name || 'Bilde'}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Lukk bilde"
          >
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        <Pressable style={styles.viewerImageWrap} onPress={onClose}>
          <Image
            source={{ uri: file.downloadUrl }}
            style={styles.viewerImage}
            resizeMode="contain"
            accessibilityLabel={file.name || 'Bilde'}
          />
        </Pressable>
      </View>
    </Modal>
  );
}

export default function DocumentFolderScreen({
  folderId, allFolders = [], section = null, childId = null, fileCounts = {},
  onBack, backLabel = 'Dokumenter', onOpenSubfolder, onOpenSettings,
}) {
  const { familyId, uid, members, isAdmin } = useApp();
  const { isDesktop } = useLayout();
  useHelpScene('inner', { onRetreat: onBack });
  const [folder, setFolder] = useState(null);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [viewerFile, setViewerFile] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPreset, setNewPreset] = useState('other');
  const [creating, setCreating] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [bilagFile, setBilagFile] = useState(null);
  const [mergePrompt, setMergePrompt] = useState(null);
  const [pendingDeleteFile, setPendingDeleteFile] = useState(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const [cropTitle, setCropTitle] = useState('Juster utsnitt');
  const uploadingRef = useRef(false);
  const mergeResolveRef = useRef(null);
  const pendingDropRef = useRef(null);
  const { prepareUpload, prepareUploads, cropModal } = useDocumentScanCrop({
    title: cropTitle,
  });

  const opTimeout = (promise, ms, message) => Promise.race([
    promise,
    new Promise((_, reject) => { setTimeout(() => reject(new Error(message)), ms); }),
  ]);

  const myName = members.find((m) => m.uid === uid)?.name || '';
  const canManage = canManageFolder(folder, uid, isAdmin);
  const canUpload = canUploadToFolder(folder, uid, isAdmin);
  const canCreate = canCreateSubfolder(folder, uid, isAdmin);

  const childFolders = useMemo(
    () => getChildFolders(allFolders, folder, section, uid, childId),
    [allFolders, folder, section, uid, childId],
  );

  const visibleFiles = useMemo(
    () => filterDocumentFiles(sortFilesForDocumentList(files), searchQuery),
    [files, searchQuery],
  );

  useEffect(() => {
    if (!familyId || !folderId) return undefined;
    return listenFolder(familyId, folderId, setFolder);
  }, [familyId, folderId]);

  useEffect(() => {
    if (!familyId || !folderId) return undefined;
    return listenFolderFiles(familyId, folderId, setFiles);
  }, [familyId, folderId]);

  const askMergePages = useCallback((count) => new Promise((resolve) => {
    if (!canMergeDocumentPages() || count < 2) {
      resolve(false);
      return;
    }
    mergeResolveRef.current = resolve;
    setMergePrompt({ count });
  }), []);

  const runOcrForFile = useCallback(async (fileMeta, picked) => {
    if (!familyId || !fileMeta?.id) return null;
    setOcrBusy(true);
    try {
      let imageBase64 = '';
      // Alltid send base64 når vi har blob — mer pålitelig enn kun storagePath
      // (CF kan mangle lesetilgang / race rett etter opplasting).
      if (picked?.blob) {
        imageBase64 = await blobToDataUrl(picked.blob);
      } else if (!fileMeta.storagePath && picked?.uri && Platform.OS === 'web') {
        try {
          const res = await fetch(picked.uri);
          const blob = await res.blob();
          imageBase64 = await blobToDataUrl(blob);
        } catch { /* ignore */ }
      }
      const { bilag } = await ocrReceiptWithAi(familyId, {
        storagePath: fileMeta.storagePath || '',
        imageBase64,
        hint: fileMeta.name || '',
      });
      const nextBilag = emptyBilag({ ...bilag, ocrStatus: 'done' });
      const displayName = nextBilag.supplier
        ? `${nextBilag.supplier}${nextBilag.date ? ` ${nextBilag.date}` : ''}`
        : fileMeta.name;
      await updateFolderFile(familyId, folderId, fileMeta.id, {
        kind: 'receipt',
        bilag: nextBilag,
        name: displayName.slice(0, 120),
      });
      const updated = {
        ...fileMeta,
        kind: 'receipt',
        bilag: nextBilag,
        name: displayName.slice(0, 120),
      };
      setBilagFile(updated);
      return updated;
    } catch (err) {
      const failed = emptyBilag({
        ocrStatus: 'failed',
        notes: String(err?.message || 'OCR feilet').slice(0, 200),
      });
      try {
        await updateFolderFile(familyId, folderId, fileMeta.id, {
          kind: 'receipt',
          bilag: failed,
        });
      } catch { /* ignore */ }
      setBilagFile({ ...fileMeta, kind: 'receipt', bilag: failed });
      return null;
    } finally {
      setOcrBusy(false);
    }
  }, [familyId, folderId]);

  const uploadPicked = useCallback(async (picked, { skipOcr = false, intent = 'document' } = {}) => {
    if (!picked || !familyId || !folderId) return null;
    const ready = picked.cropped || picked.merged ? picked : await prepareUpload(picked);
    if (!ready) return null;
    const fileName = ready.name || picked.name || `dokument-${Date.now()}`;
    const safeName = fileName.replace(/[^\w.\-()+ ]/g, '_');
    const path = `families/${familyId}/documents/${folderId}/${Date.now()}-${safeName}`;
    const downloadUrl = await uploadDocument({
      familyId,
      folderId,
      path,
      picked: ready,
      contentType: ready.mimeType || picked.mimeType,
    });
    const isImg = isImageUpload(ready) || isImageUpload(picked);
    const asReceipt = intent === 'receipt';
    const bilag = asReceipt
      ? emptyBilag({ ocrStatus: (!isImg || skipOcr) ? 'edited' : 'pending' })
      : null;
    const ref = await opTimeout(
      addFolderFile(familyId, folderId, {
        name: fileName,
        mimeType: ready.mimeType || picked.mimeType || 'application/octet-stream',
        size: ready.size || picked.size || ready.blob?.size || 0,
        storagePath: path,
        downloadUrl,
        uploadedBy: uid,
        uploadedByName: myName,
        kind: asReceipt ? 'receipt' : 'file',
        bilag,
        pageCount: ready.pageCount || null,
      }),
      30000,
      'firestore-timeout',
    );
    if (ready.revoke && ready.uri && typeof URL !== 'undefined') {
      try { URL.revokeObjectURL(ready.uri); } catch { /* ignore */ }
    }
    const fileMeta = {
      id: ref.id,
      name: fileName,
      mimeType: ready.mimeType || picked.mimeType,
      size: ready.size || 0,
      storagePath: path,
      downloadUrl,
      kind: asReceipt ? 'receipt' : 'file',
      bilag,
      pageCount: ready.pageCount || null,
    };
    if (asReceipt && isImg && !skipOcr) {
      await runOcrForFile(fileMeta, ready);
    }
    return fileMeta;
  }, [familyId, folderId, uid, myName, prepareUpload, runOcrForFile]);

  const uploadMany = useCallback(async (items, intentId = 'document') => {
    if (!items?.length || !familyId || !folderId || uploadingRef.current) return;
    const intent = UPLOAD_INTENTS[intentId] || UPLOAD_INTENTS.document;
    setCropTitle(intent.cropTitle);
    uploadingRef.current = true;
    setUploading(true);
    setUploadError('');
    let ok = 0;
    let lastError = null;
    try {
      const prepared = await prepareUploads(items);
      if (!prepared.length) return;

      const images = prepared.filter((p) => isImageUpload(p));
      const others = prepared.filter((p) => !isImageUpload(p));
      let workList = [...others];

      if (images.length >= 2 && canMergeDocumentPages()) {
        const shouldMerge = await askMergePages(images.length);
        if (shouldMerge) {
          try {
            const merged = await mergeDocumentPages(images, {
              name: images[0]?.name || intent.mergeName,
            });
            workList = [merged, ...others];
            images.forEach((img) => {
              if (img.revoke && img.uri && typeof URL !== 'undefined') {
                try { URL.revokeObjectURL(img.uri); } catch { /* ignore */ }
              }
            });
          } catch {
            workList = [...images, ...others];
          }
        } else {
          workList = [...images, ...others];
        }
      } else {
        workList = [...images, ...others];
      }

      for (const item of workList) {
        try {
          await uploadPicked(item, { skipOcr: false, intent: intent.id });
          ok += 1;
        } catch (err) {
          lastError = err;
        }
      }
      if (ok === 0) {
        throw lastError || new Error('upload-failed');
      }
      if (ok < workList.length) {
        setUploadError(`${ok} av ${workList.length} filer ble lastet opp.`);
      }
    } catch (e) {
      const code = String(e?.message || '');
      const msg = code.includes('for stor')
        ? 'Filen er for stor (maks 500 MB).'
        : code.includes('Ikke innlogget')
          ? 'Du må være innlogget for å laste opp filer.'
          : code.includes('storage-rest-403') || code.includes('storage/unauthorized') || code.includes('tilgang')
            ? 'Ingen tilgang til fillagring. Prøv å logge inn på nytt.'
            : code.includes('callable-timeout') || code.includes('storage-rest-timeout') || code.includes('firestore-timeout') || code.includes('storage-upload-timeout')
              ? 'Opplasting tok for lang tid. Sjekk nett og prøv igjen.'
              : 'Klarte ikke laste opp filen. Sjekk nett og prøv igjen.';
      setUploadError(msg);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  }, [familyId, folderId, uploadPicked, prepareUploads, askMergePages]);

  const openUploadChooser = useCallback((pendingItems = null) => {
    if (!canUpload || uploadingRef.current) return;
    pendingDropRef.current = pendingItems;
    setUploadMenuOpen(true);
  }, [canUpload]);

  const startUploadWithIntent = useCallback(async (intentId) => {
    const pending = pendingDropRef.current;
    pendingDropRef.current = null;
    if (pending?.length) {
      await uploadMany(pending, intentId);
      return;
    }
    try {
      // pickDocument må kjøre i trykk-handler (iOS Safari).
      const picked = await pickDocument({
        multiple: Platform.OS === 'web',
        accept: FAMILY_DOCUMENT_ACCEPT,
      });
      if (!picked || (Array.isArray(picked) && !picked.length)) return;
      const items = Array.isArray(picked) ? picked : [picked];
      await uploadMany(items, intentId);
    } catch {
      setUploadError('Klarte ikke laste opp filen.');
    }
  }, [uploadMany]);

  const pickAndUpload = useCallback(() => {
    openUploadChooser(null);
  }, [openUploadChooser]);

  const uploadMenuItems = useMemo(() => (
    Object.values(UPLOAD_INTENTS).map((intent) => ({
      id: intent.id,
      icon: intent.icon,
      label: intent.label,
      hint: intent.hint,
      onPress: () => { startUploadWithIntent(intent.id); },
    }))
  ), [startUploadWithIntent]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !canUpload) return undefined;
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    const onDragEnter = (e) => {
      prevent(e);
      setDragOver(true);
    };
    const onDragLeave = (e) => {
      prevent(e);
      if (e.relatedTarget == null) setDragOver(false);
    };
    const onDrop = (e) => {
      prevent(e);
      setDragOver(false);
      const list = e.dataTransfer?.files;
      if (!list?.length) return;
      const picked = Array.from(list).map(filesFromNativeFile).filter(Boolean);
      if (!picked.length) return;
      openUploadChooser(picked);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', prevent);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [canUpload, openUploadChooser]);

  const openFileUrl = (file) => {
    if (isImageFile(file) && file?.downloadUrl) {
      setSelectedFile(null);
      setViewerFile(file);
      return;
    }
    const url = file.downloadUrl;
    if (!url) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(url).catch(() => Alert.alert('Feil', 'Klarte ikke åpne filen.'));
  };

  const createSubfolder = async () => {
    const name = newName.trim();
    if (!name || !familyId || !folder) return;
    setCreating(true);
    try {
      await createFolder({
        familyId,
        uid,
        name,
        creatorName: myName,
        scope: folder.scope,
        memberIds: folder.memberIds,
        presetId: newPreset,
        parentFolderId: folder.id,
        parentFolder: folder,
      });
      setCreateOpen(false);
      setNewName('');
    } catch {
      Alert.alert('Feil', 'Klarte ikke opprette undermappe.');
    } finally {
      setCreating(false);
    }
  };

  const renderHeader = () => (
    <View style={styles.headerBlock}>
      <View style={styles.folderHero}>
        <View style={[styles.heroIcon, { backgroundColor: `${folder?.color || '#0ea5e9'}18` }]}>
          <Text style={styles.heroEmoji}>{folder?.emoji || '📁'}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.heroTitle, isDesktop && styles.heroTitleDesk]} numberOfLines={1}>
            {folder?.name}
          </Text>
          <Text style={styles.heroMeta} numberOfLines={1}>
            {memberSummary(folder, members)} · {files.length} fil{files.length === 1 ? '' : 'er'}
            {childFolders.length ? ` · ${childFolders.length} undermappe${childFolders.length === 1 ? '' : 'r'}` : ''}
          </Text>
        </View>
        {canManage ? (
          <TouchableOpacity
            style={styles.shareEditBtn}
            onPress={onOpenSettings}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Endre hvem som ser mappen"
          >
            <Ionicons name="people-outline" size={16} color={colors.brand} />
            <Text style={styles.shareEditTxt}>Endre</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {canUpload ? (
        <HelpTarget id="add" onAdvance={pickAndUpload} style={styles.actionsRow}>
          {isDesktop ? (
            <>
              <DeskBtn
                primary
                icon="cloud-upload-outline"
                label={uploading || ocrBusy ? 'Laster opp…' : 'Velg filer'}
                onPress={pickAndUpload}
              />
              {canCreate ? (
                <DeskBtn icon="folder-open-outline" label="Ny mappe" onPress={() => setCreateOpen(true)} />
              ) : null}
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.addBtn, (uploading || ocrBusy) && { opacity: 0.6 }]}
                onPress={pickAndUpload}
                disabled={uploading || ocrBusy}
              >
                {uploading || ocrBusy ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
                    <Text style={styles.addBtnTxt}>Velg filer</Text>
                  </>
                )}
              </TouchableOpacity>
              {canCreate ? (
                <TouchableOpacity style={styles.secondaryAddBtn} onPress={() => setCreateOpen(true)}>
                  <Ionicons name="folder-open-outline" size={18} color={colors.brand} />
                  <Text style={styles.secondaryAddTxt}>Ny mappe</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </HelpTarget>
      ) : null}

      {canUpload && Platform.OS === 'web' ? (
        <View style={[styles.dropHint, dragOver && styles.dropHintActive]}>
          <Ionicons
            name="cloud-upload-outline"
            size={14}
            color={dragOver ? colors.brand : colors.muted}
          />
          <Text style={[styles.dropTxt, dragOver && styles.dropTxtActive]}>
            {dragOver
              ? 'Slipp filer her'
              : 'Dra filer hit — crop og slå sammen sider (maks 500 MB). Velg type ved opplasting.'}
          </Text>
        </View>
      ) : null}

      {files.length ? (
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={16} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Søk navn, type, leverandør, beløp…"
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Tøm søk">
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {childFolders.length ? (
        <View style={[styles.panel, isDesktop && styles.panelDesk]}>
          <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk]}>Mapper</Text>
          {childFolders.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              fileCount={fileCounts[f.id]}
              isDesktop={isDesktop}
              onPress={() => onOpenSubfolder?.(f.id)}
            />
          ))}
        </View>
      ) : null}

      {files.length ? (
        <Text style={[styles.sectionLbl, isDesktop && styles.sectionLblDesk, { marginTop: 8 }]}>
          {searchQuery
            ? `${visibleFiles.length} treff`
            : `Dokumenter og filer (${files.length})`}
        </Text>
      ) : null}
    </View>
  );

  const onFilePress = (file) => {
    if (isReceiptFile(file)) {
      setBilagFile(file);
      return;
    }
    if (isImageFile(file) && file?.downloadUrl) {
      setViewerFile(file);
      return;
    }
    setSelectedFile(file);
  };

  const renderFile = ({ item }) => {
    const receipt = isReceiptFile(item);
    const isImage = isImageFile(item) && !!item.downloadUrl;
    const bilag = item.bilag || {};
    const canDelete = canEditFile(item, folder, uid, isAdmin);
    return (
      <TouchableOpacity
        style={[
          styles.fileRow,
          isDesktop && styles.fileRowDesk,
          item.locked && styles.fileRowLocked,
          receipt && styles.fileRowReceipt,
        ]}
        onPress={() => onFilePress(item)}
        accessibilityRole="button"
        accessibilityLabel={receipt
          ? `Bilag ${bilag.supplier || item.name}`
          : (isImage ? `Vis bilde ${item.name}` : item.name)}
        activeOpacity={0.75}
      >
        {isImage ? (
          <Image
            source={{ uri: item.downloadUrl }}
            style={[styles.fileThumb, isDesktop && styles.fileThumbDesk]}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.fileIcon, isDesktop && styles.fileIconDesk, receipt && styles.fileIconReceipt]}>
            <Ionicons
              name={receipt ? 'receipt-outline' : fileIcon(item.mimeType, item.name)}
              size={isDesktop ? 16 : 18}
              color={colors.brand}
            />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.fileName, isDesktop && styles.fileNameDesk]} numberOfLines={1}>
            {bilag.supplier || item.name}
          </Text>
          <Text style={styles.fileMeta} numberOfLines={1}>
            {receipt
              ? [
                bilag.date || null,
                formatBilagAmount(bilag.amount, bilag.currency),
                bilag.category || null,
                bilag.ocrStatus === 'pending' ? 'Tolker…' : null,
                bilag.ocrStatus === 'failed' ? 'OCR feilet' : null,
                item.pageCount > 1 ? `${item.pageCount} sider` : null,
              ].filter(Boolean).join(' · ')
              : `${formatFileSize(item.size)}${item.uploadedByName ? ` · ${item.uploadedByName}` : ''}`}
          </Text>
        </View>
        {receipt && bilag.amount != null ? (
          <Text style={styles.amountBadge}>{formatBilagAmount(bilag.amount, bilag.currency)}</Text>
        ) : null}
        {item.locked ? (
          <Ionicons name="lock-closed-outline" size={16} color={colors.warn} />
        ) : null}
        {canDelete ? (
          <TouchableOpacity
            onPress={() => setPendingDeleteFile(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Slett ${bilag.supplier || item.name}`}
          >
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => (receipt ? setBilagFile(item) : setSelectedFile(item))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Detaljer for ${item.name}`}
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.muted} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  // Tilbake-lenke utenfor EdgeSwipeBack, så kant-sveip ikke stjeler trykk.
  const backHeader = (
    <View style={[styles.header, isDesktop && styles.headerDesk]}>
      <CompactBackLink onPress={onBack} label={backLabel} accessibilityLabel={`Tilbake til ${backLabel}`} />
    </View>
  );

  if (!folder) {
    return (
      <Screen>
        {backHeader}
        <View style={{ padding: 24, alignItems: 'center' }}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const createSheet = createOpen ? (
    <Pressable
      style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
      onPress={() => setCreateOpen(false)}
    >
      <Pressable
        style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
        onPress={(e) => e.stopPropagation?.()}
      >
        <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Ny undermappe</Text>
        <TextInput
          style={[styles.input, isDesktop && styles.inputDesk]}
          placeholder="Mappenavn"
          value={newName}
          onChangeText={setNewName}
          autoFocus={Platform.OS === 'web'}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }}
          contentContainerStyle={styles.presetRow}
        >
          {FOLDER_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.presetBtn, newPreset === p.id && styles.presetBtnOn]}
              onPress={() => setNewPreset(p.id)}
            >
              <Text style={styles.presetEmoji}>{p.emoji}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.modalActions}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreateOpen(false)}>
            <Text style={styles.cancelTxt}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, (!newName.trim() || creating) && styles.saveBtnDisabled]}
            onPress={createSubfolder}
            disabled={!newName.trim() || creating}
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Opprett</Text>}
          </TouchableOpacity>
        </View>
      </Pressable>
    </Pressable>
  ) : null;

  let createModal = null;
  if (createSheet) {
    if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && document.body) {
      createModal = createPortal(<div style={webPortalRootStyle}>{createSheet}</div>, document.body);
    } else {
      createModal = (
        <Modal visible transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
          {createSheet}
        </Modal>
      );
    }
  }

  return (
    <Screen style={styles.screenRoot}>
      {backHeader}
      <EdgeSwipeBack
        enabled={Platform.OS !== 'web'}
        onBack={onBack}
        style={styles.swipeBody}
      >
        <FlatList
          data={visibleFiles}
          keyExtractor={(item) => item.id}
          renderItem={renderFile}
          // Element (not component type) — a fresh function identity each render
          // remounts HelpTarget and loops setState via onLayout/registerTarget.
          ListHeaderComponent={renderHeader()}
          style={styles.listFlex}
          contentContainerStyle={[styles.list, isDesktop && styles.listDesk]}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={!childFolders.length ? (
            <Mute style={{ textAlign: 'center', marginTop: 8 }}>
              {searchQuery
                ? 'Ingen filer matcher søket.'
                : 'Ingen filer ennå. Velg hva du vil laste opp — dokumenter, tegninger, kvitteringer og mer.'}
            </Mute>
          ) : null}
        />
      </EdgeSwipeBack>

      <InfoDialog
        visible={!!uploadError}
        title="Opplasting feilet"
        message={uploadError}
        onClose={() => setUploadError('')}
      />

      <PlusActionMenu
        visible={uploadMenuOpen}
        title="Hva vil du laste opp?"
        subtitle="Alt er dokumentasjon — ikke bare kvitteringer."
        items={uploadMenuItems}
        onClose={() => {
          setUploadMenuOpen(false);
          pendingDropRef.current = null;
        }}
      />

      <ConfirmDialog
        visible={!!mergePrompt}
        title="Slå sammen sider?"
        message={`Du valgte ${mergePrompt?.count || 0} bilder. Slå dem sammen til én fil (som flerside-skann), eller last opp hver for seg.`}
        confirmText="Slå sammen"
        cancelText="Hver for seg"
        onConfirm={() => {
          const resolve = mergeResolveRef.current;
          mergeResolveRef.current = null;
          setMergePrompt(null);
          resolve?.(true);
        }}
        onCancel={() => {
          const resolve = mergeResolveRef.current;
          mergeResolveRef.current = null;
          setMergePrompt(null);
          resolve?.(false);
        }}
      />

      <ConfirmDialog
        visible={!!pendingDeleteFile}
        title="Slett fil"
        message={`Vil du slette «${pendingDeleteFile?.bilag?.supplier || pendingDeleteFile?.name || 'filen'}»?`}
        confirmText="Slett"
        danger
        onCancel={() => setPendingDeleteFile(null)}
        onConfirm={async () => {
          const file = pendingDeleteFile;
          setPendingDeleteFile(null);
          if (!file?.id) return;
          await deleteFolderFile(familyId, folderId, file.id);
          if (bilagFile?.id === file.id) setBilagFile(null);
          if (selectedFile?.id === file.id) setSelectedFile(null);
        }}
      />

      <DocumentBilagEditSheet
        visible={!!bilagFile}
        file={bilagFile}
        canEdit={bilagFile ? canEditFile(bilagFile, folder, uid, isAdmin) : false}
        busy={ocrBusy}
        onClose={() => setBilagFile(null)}
        onOpenImage={(f) => {
          setViewerFile(f);
        }}
        onSave={async ({ bilag, name, kind }) => {
          if (!bilagFile?.id) return;
          await updateFolderFile(familyId, folderId, bilagFile.id, { bilag, name, kind });
          setBilagFile((prev) => (prev ? { ...prev, bilag, name, kind } : prev));
        }}
        onDelete={async () => {
          if (!bilagFile?.id) return;
          await deleteFolderFile(familyId, folderId, bilagFile.id);
          setBilagFile(null);
        }}
        onRerunOcr={async () => {
          if (!bilagFile) return;
          await runOcrForFile(bilagFile, null);
        }}
      />

      <DocumentFileDetailSheet
        visible={!!selectedFile}
        file={selectedFile}
        canEdit={selectedFile ? canEditFile(selectedFile, folder, uid, isAdmin) : false}
        onClose={() => setSelectedFile(null)}
        onOpen={openFileUrl}
        onRename={async (name) => {
          await updateFolderFile(familyId, folderId, selectedFile.id, { name });
        }}
        onDelete={async () => {
          await deleteFolderFile(familyId, folderId, selectedFile.id);
        }}
        onToggleLock={async (locked) => {
          await updateFolderFile(familyId, folderId, selectedFile.id, {
            locked,
            lockedBy: locked ? uid : null,
          });
          setSelectedFile((prev) => (prev ? { ...prev, locked, lockedBy: locked ? uid : null } : prev));
        }}
      />

      <DocumentImageViewer
        visible={!!viewerFile}
        file={viewerFile}
        onClose={() => setViewerFile(null)}
      />

      {createModal}
      {cropModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenRoot: { zIndex: 1 },
  swipeBody: { flex: 1, zIndex: 1 },
  listFlex: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8 },
  headerDesk: { paddingHorizontal: 12, paddingTop: 4 },
  headerBlock: { gap: 8, marginBottom: 4 },
  folderHero: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4,
  },
  heroIcon: {
    width: 36, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
  },
  heroEmoji: { fontSize: 18 },
  heroTitle: { fontSize: 17, fontWeight: '400', color: colors.ink },
  heroTitleDesk: { fontSize: 15, fontWeight: '500' },
  heroMeta: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 1 },
  shareEditBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 6,
  },
  shareEditTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },

  actionsRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 2,
  },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14,
    alignSelf: 'flex-start',
  },
  addBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
  secondaryAddBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
    borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start',
  },
  secondaryAddTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },

  dropHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line,
    backgroundColor: colors.sunken, alignSelf: 'stretch',
  },
  dropHintActive: { borderColor: colors.brand, backgroundColor: '#eef6ff' },
  dropTxt: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  dropTxtActive: { color: colors.brand, fontWeight: '500' },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.card,
    marginTop: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.ink,
    padding: 0,
    margin: 0,
  },

  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 4,
    marginTop: 4,
  },
  panelDesk: { borderRadius: 8 },
  sectionLbl: {
    fontSize: 12, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2,
  },
  sectionLblDesk: { fontWeight: '500', fontSize: 11 },

  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  folderRowDesk: { paddingVertical: 8, gap: 8 },
  folderIcon: {
    width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
  },
  folderIconDesk: { width: 28, height: 28, borderRadius: 7 },
  folderEmoji: { fontSize: 15 },
  folderName: { fontWeight: '400', fontSize: 14, color: colors.ink },
  folderNameDesk: { fontWeight: '500', fontSize: 13 },
  folderMeta: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 1 },

  list: { paddingHorizontal: 16, paddingBottom: 32 },
  listDesk: { paddingHorizontal: 12, paddingBottom: 24 },
  fileRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: colors.line, marginBottom: 6,
  },
  fileRowDesk: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },
  fileRowLocked: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  fileRowReceipt: { borderColor: '#bfdbfe', backgroundColor: '#f8fbff' },
  fileIcon: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  fileIconDesk: { width: 32, height: 32, borderRadius: 7 },
  fileIconReceipt: { backgroundColor: '#dbeafe' },
  fileThumb: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#e2e8f0',
  },
  fileThumbDesk: { width: 32, height: 32, borderRadius: 7 },
  fileName: { fontWeight: '400', fontSize: 14, color: colors.ink },
  fileNameDesk: { fontWeight: '500', fontSize: 13 },
  fileMeta: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 1 },
  amountBadge: {
    fontSize: 12, fontWeight: '400', color: colors.brand, maxWidth: 96, textAlign: 'right',
  },

  viewerRoot: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: Platform.OS === 'web' ? 24 : 48,
  },
  viewerTop: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
  },
  viewerTitle: { flex: 1, color: '#fff', fontWeight: '400', fontSize: 15 },
  viewerImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 12 },
  viewerImage: { width: '100%', height: '100%', maxWidth: 960 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 18,
    maxWidth: 420, width: '100%', alignSelf: 'center',
  },
  modalCardDesk: { borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '400', color: colors.ink, marginBottom: 12 },
  modalTitleDesk: { fontSize: 15, fontWeight: '500', marginBottom: 10 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 12,
    backgroundColor: colors.sunken, fontWeight: '400', color: colors.ink,
  },
  inputDesk: { paddingVertical: 8, fontSize: 14, borderRadius: 8 },
  presetRow: { gap: 6, marginBottom: 14, alignItems: 'center', height: 40 },
  presetBtn: {
    width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sunken,
  },
  presetBtnOn: { borderColor: colors.brand, backgroundColor: '#eef6ff' },
  presetEmoji: { fontSize: 18 },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  cancelBtn: {
    alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e5e7eb' },
  cancelTxt: { color: colors.ink, fontWeight: '500' },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 16,
    minWidth: 90, alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnTxt: { color: '#fff', fontWeight: '400' },
});

