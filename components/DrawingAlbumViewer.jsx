/**
 * Fullskjerm-visning for barnetegninger i kunstsamlingen.
 * Samme mønster som familiealbumet (thumb → visning → info),
 * men egne felt for barn/sted/dato — ikke koblet til familiealbum.
 */
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Modal, View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  Pressable, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import {
  drawingViewerUrl,
  downloadDrawingImage,
  downloadDrawingOnWall,
  formatDrawingDrawnAt,
  formatDrawingUploadedAt,
  getRoomScene,
} from '../src/utils/childDrawings';

function MetaRow({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

export default function DrawingAlbumViewer({
  visible,
  drawing,
  drawings = [],
  canDelete = false,
  canEdit = true,
  /** Optional room override for «last ned med vegg» (hub-forhåndsvisning). */
  wallScene = null,
  onClose,
  onDelete,
  onEdit,
  onSelect,
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [wallBusy, setWallBusy] = useState(false);

  useEffect(() => {
    if (!visible) {
      setInfoOpen(false);
      setWallBusy(false);
    }
  }, [visible]);

  const list = useMemo(
    () => (drawings || []).filter((d) => d && !d.deleted && (d.imageUrl || d.thumbUrl)),
    [drawings],
  );
  const index = useMemo(
    () => list.findIndex((d) => d.id === drawing?.id),
    [list, drawing?.id],
  );
  const viewUrl = useMemo(() => drawingViewerUrl(drawing), [drawing]);
  const downloadScene = wallScene || drawing?.placement?.scene || 'living';

  const go = useCallback((delta) => {
    if (!list.length || index < 0) return;
    const next = list[(index + delta + list.length) % list.length];
    if (next) onSelect?.(next);
  }, [list, index, onSelect]);

  const downloadWall = useCallback(async () => {
    if (!drawing || wallBusy) return;
    setWallBusy(true);
    try {
      await downloadDrawingOnWall(drawing, downloadScene);
    } finally {
      setWallBusy(false);
    }
  }, [drawing, wallBusy, downloadScene]);

  if (!drawing) return null;

  const dims = (drawing.width && drawing.height)
    ? `${drawing.width} × ${drawing.height}`
    : null;
  const ageTxt = drawing.age != null ? `${drawing.age} år` : null;
  const roomLabel = drawing.placement?.scene
    ? (getRoomScene(drawing.placement.scene)?.label || drawing.placement.scene)
    : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>
            {drawing.title || 'Tegning'}
          </Text>
          <View style={styles.topActions}>
            <TouchableOpacity
              onPress={() => setInfoOpen((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Mer info"
              style={styles.iconBtn}
            >
              <Ionicons name="information-circle-outline" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => downloadDrawingImage(drawing)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Last ned bilde"
              style={styles.iconBtn}
            >
              <Ionicons name="download-outline" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={downloadWall}
              hitSlop={10}
              disabled={wallBusy}
              accessibilityRole="button"
              accessibilityLabel="Last ned med vegg"
              style={styles.iconBtn}
            >
              <Ionicons
                name={wallBusy ? 'hourglass-outline' : 'image-outline'}
                size={24}
                color="#fff"
              />
            </TouchableOpacity>
            {canEdit ? (
              <TouchableOpacity
                onPress={() => onEdit?.(drawing)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Rediger"
                style={styles.iconBtn}
              >
                <Ionicons name="create-outline" size={24} color="#fff" />
              </TouchableOpacity>
            ) : null}
            {canDelete ? (
              <TouchableOpacity
                onPress={() => onDelete?.(drawing)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Slett"
                style={styles.iconBtn}
              >
                <Ionicons name="trash-outline" size={24} color="#fecaca" />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
              style={styles.iconBtn}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        <Pressable style={styles.stage} onPress={() => setInfoOpen(false)}>
          {viewUrl ? (
            <Image
              source={{ uri: viewUrl }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={drawing.title || 'Tegning'}
            />
          ) : (
            <View style={styles.empty}>
              <Ionicons name="image-outline" size={40} color="#94a3b8" />
              <Text style={styles.emptyTxt}>Fant ikke bildet</Text>
            </View>
          )}

          {list.length > 1 ? (
            <>
              <TouchableOpacity
                style={[styles.navBtn, styles.navLeft]}
                onPress={() => go(-1)}
                accessibilityLabel="Forrige tegning"
              >
                <Ionicons name="chevron-back" size={28} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, styles.navRight]}
                onPress={() => go(1)}
                accessibilityLabel="Neste tegning"
              >
                <Ionicons name="chevron-forward" size={28} color="#fff" />
              </TouchableOpacity>
            </>
          ) : null}
        </Pressable>

        {list.length > 1 ? (
          <Text style={styles.counter}>
            {Math.max(1, index + 1)} / {list.length}
          </Text>
        ) : null}

        {infoOpen ? (
          <View style={styles.infoSheet}>
            <Text style={styles.infoTitle}>Om tegningen</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              <MetaRow label="Tittel" value={drawing.title} />
              <MetaRow label="Barn" value={drawing.childName} />
              <MetaRow label="Alder" value={ageTxt} />
              <MetaRow label="Sted" value={drawing.place} />
              <MetaRow label="Tegnet" value={formatDrawingDrawnAt(drawing.drawnAt || drawing.drawnAtKey)} />
              <MetaRow label="Notat" value={drawing.note} />
              <MetaRow label="Oppløsning" value={dims} />
              <MetaRow label="Rom på veggen" value={roomLabel} />
              <MetaRow label="Lastet opp" value={formatDrawingUploadedAt(drawing.createdAt)} />
              <MetaRow label="Av" value={drawing.createdByName} />
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.94)',
  },
  top: {
    paddingTop: Platform.OS === 'web' ? 12 : 48,
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { flex: 1, color: '#fff', fontWeight: '500', fontSize: 15 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: {
    alignSelf: 'flex-start', padding: 6 },
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingBottom: 24,
  },
  image: { width: '100%', height: '100%' },
  empty: { alignItems: 'center', gap: 10 },
  emptyTxt: { color: '#94a3b8' },
  navBtn: {
    position: 'absolute',
    top: '45%',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15,23,42,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  counter: {
    textAlign: 'center',
    color: '#cbd5e1',
    fontSize: 13,
    paddingBottom: 12,
  },
  infoSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 24,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  infoTitle: { fontSize: 16, fontWeight: '400', color: colors.ink, marginBottom: 8 },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  metaLabel: { color: colors.muted, fontSize: 13, fontWeight: '500' },
  metaValue: { color: colors.ink, fontSize: 13, flexShrink: 1, textAlign: 'right', maxWidth: '62%' },
});
