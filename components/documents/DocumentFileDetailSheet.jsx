import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Platform, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../src/theme';
import ConfirmDialog from '../../components/ConfirmDialog';
import {
  formatFileSize, formatFileType, formatFileDate, fileIcon, isImageFile, isVideoFile,
} from '../../src/utils/familyDocuments';

export default function DocumentFileDetailSheet({
  visible, file, canEdit, onClose, onOpen, onRename, onDelete, onToggleLock,
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!file) return null;
  if (!visible && !renameOpen && !confirmDelete) return null;

  const isImage = isImageFile(file) && !!file.downloadUrl;
  const isVideo = isVideoFile(file) && !!file.downloadUrl;

  const startRename = () => {
    setRenameValue(file.name || '');
    setRenameOpen(true);
  };

  const saveRename = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onRename?.(trimmed);
      setRenameOpen(false);
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    setConfirmDelete(false);
    setBusy(true);
    try {
      await onDelete?.();
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onToggleLock?.(!file.locked);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal visible={visible && !renameOpen} transparent animationType="slide" onRequestClose={onClose}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            {isImage ? (
              <TouchableOpacity onPress={() => onOpen?.(file)} accessibilityRole="button">
                <Image
                  source={{ uri: file.downloadUrl }}
                  style={styles.thumb}
                  resizeMode="cover"
                />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconWrap}>
                <Ionicons name={fileIcon(file.mimeType, file.name)} size={28} color={colors.brand} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>{file.name}</Text>
              <Text style={styles.sub}>
                {formatFileType(file.mimeType, file.name)} · {formatFileSize(file.size)}
              </Text>
            </View>
            {file.locked ? (
              <Ionicons name="lock-closed" size={20} color={colors.warn} />
            ) : null}
          </View>

          {isImage ? (
            <TouchableOpacity
              style={styles.previewWrap}
              onPress={() => onOpen?.(file)}
              accessibilityRole="button"
              accessibilityLabel="Åpne bilde i full visning"
            >
              <Image
                source={{ uri: file.downloadUrl }}
                style={styles.preview}
                resizeMode="cover"
              />
              <View style={styles.previewHint}>
                <Ionicons name="expand-outline" size={16} color="#fff" />
                <Text style={styles.previewHintTxt}>Trykk for full visning</Text>
              </View>
            </TouchableOpacity>
          ) : null}

          <View style={styles.infoCard}>
            <InfoRow label="Filtype" value={formatFileType(file.mimeType, file.name)} />
            <InfoRow label="Størrelse" value={formatFileSize(file.size)} />
            <InfoRow label="Lastet opp" value={formatFileDate(file.createdAt)} />
            <InfoRow label="Sist endret" value={formatFileDate(file.updatedAt || file.createdAt)} />
            <InfoRow label="Lastet opp av" value={file.uploadedByName || 'Ukjent'} />
            <InfoRow label="Rettigheter" value={file.locked ? 'Låst' : 'Redigerbar'} last />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => onOpen?.(file)}>
            <Ionicons
              name={isImage ? 'image-outline' : (isVideo ? 'play-outline' : 'open-outline')}
              size={20}
              color="#fff"
            />
            <Text style={styles.primaryBtnTxt}>
              {isImage ? 'Åpne i full visning' : (isVideo ? 'Spill av film' : 'Åpne fil')}
            </Text>
          </TouchableOpacity>

          {canEdit ? (
            <View style={styles.actions}>
              <ActionBtn icon="pencil-outline" label="Endre navn" onPress={startRename} />
              <ActionBtn
                icon={file.locked ? 'lock-open-outline' : 'lock-closed-outline'}
                label={file.locked ? 'Lås opp' : 'Lås fil'}
                onPress={toggleLock}
              />
              <ActionBtn icon="trash-outline" label="Slett" danger onPress={() => setConfirmDelete(true)} />
            </View>
          ) : null}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeTxt}>Lukk</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.renameBackdrop}>
          <View style={styles.renameCard}>
            <Text style={styles.renameTitle}>Endre filnavn</Text>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus={Platform.OS === 'web'}
              selectTextOnFocus
            />
            <View style={styles.renameActions}>
              <TouchableOpacity onPress={() => setRenameOpen(false)}>
                <Text style={styles.closeTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.primaryBtnSmall} onPress={saveRename} disabled={!renameValue.trim() || busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Lagre</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmDelete}
        title="Slett fil"
        message={`Vil du slette «${file.name}»?`}
        confirmText="Slett"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </>
  );
}

function InfoRow({ label, value, last }) {
  return (
    <View style={[styles.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={styles.infoLbl}>{label}</Text>
      <Text style={styles.infoVal}>{value}</Text>
    </View>
  );
}

function ActionBtn({ icon, label, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.brand} />
      <Text style={[styles.actionTxt, danger && { color: colors.danger }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line,
    alignSelf: 'center', marginBottom: 16,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 16 },
  iconWrap: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
  },
  thumb: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: '#e2e8f0',
  },
  previewWrap: {
    marginBottom: 16, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: '#0f172a', position: 'relative',
  },
  preview: { width: '100%', height: 180 },
  previewHint: {
    position: 'absolute', bottom: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
  },
  previewHintTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  title: { fontWeight: '900', fontSize: 18, color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, fontWeight: '600', marginTop: 4 },
  infoCard: {
    backgroundColor: '#f8fafc', borderRadius: radius.md, paddingHorizontal: 14,
    marginBottom: 16, borderWidth: 1, borderColor: colors.line,
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: colors.line, gap: 12,
  },
  infoLbl: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  infoVal: { fontSize: 13, color: colors.ink, fontWeight: '700', flex: 1, textAlign: 'right' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14, marginBottom: 12,
  },
  primaryBtnSmall: {
    backgroundColor: colors.brand, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 10,
    minWidth: 88, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  actions: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  actionBtn: { alignItems: 'center', gap: 4, padding: 8, minWidth: 72 },
  actionTxt: { fontSize: 12, fontWeight: '700', color: colors.ink },
  closeBtn: { alignItems: 'center', paddingVertical: 12 },
  closeTxt: { fontSize: 15, fontWeight: '700', color: colors.muted },
  renameBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24,
  },
  renameCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, gap: 12,
  },
  renameTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  renameInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.ink,
  },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16 },
});
