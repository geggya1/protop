import React, { useMemo, useState } from 'react';
import {
  Modal, View, Text, Image, StyleSheet, TouchableOpacity, ScrollView,
  Pressable, useWindowDimensions, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import {
  albumViewerUrl, albumOriginalUrl, formatBytes, formatPhotoTakenAt, downloadAlbumOriginal,
} from '../src/utils/albumMedia';

function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

/**
 * Fullskjerm-visning med info, last ned original, og slett.
 */
export default function AlbumMediaViewer({
  visible,
  photo,
  canDelete = false,
  onClose,
  onDelete,
}) {
  const { width } = useWindowDimensions();
  const [infoOpen, setInfoOpen] = useState(false);
  const isVideo = photo?.mediaType === 'video';
  const viewUrl = useMemo(() => albumViewerUrl(photo, width), [photo, width]);

  if (!photo) return null;

  const dims = (photo.width && photo.height)
    ? `${photo.width} × ${photo.height}`
    : null;
  const place = (photo.latitude != null && photo.longitude != null)
    ? `${photo.latitude}, ${photo.longitude}`
    : null;
  const taken = formatPhotoTakenAt(photo.takenAt);
  const uploaded = formatPhotoTakenAt(
    photo.createdAt?.toDate?.()?.toISOString?.()
      || (typeof photo.createdAt === 'string' ? photo.createdAt : null),
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.top}>
          <Text style={styles.title} numberOfLines={1}>
            {photo.fileName || (isVideo ? 'Video' : 'Bilde')}
          </Text>
          <View style={styles.topActions}>
            <TouchableOpacity
              onPress={() => setInfoOpen((v) => !v)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Bildeinformasjon"
              style={styles.iconBtn}
            >
              <Ionicons name="information-circle-outline" size={26} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => downloadAlbumOriginal(photo)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Last ned original"
              style={styles.iconBtn}
            >
              <Ionicons name="download-outline" size={24} color="#fff" />
            </TouchableOpacity>
            {canDelete ? (
              <TouchableOpacity
                onPress={onDelete}
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
          {isVideo ? (
            Platform.OS === 'web' ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                key={albumOriginalUrl(photo) || viewUrl}
                src={albumOriginalUrl(photo) || viewUrl}
                controls
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  maxHeight: '100%',
                  objectFit: 'contain',
                  backgroundColor: '#000',
                }}
              />
            ) : (
              <View style={styles.videoFallback}>
                <Ionicons name="videocam" size={40} color="#fff" />
                <Text style={styles.videoFallbackTxt}>
                  Åpne nedlasting for å spille av videoen.
                </Text>
                <TouchableOpacity style={styles.dlBtn} onPress={() => downloadAlbumOriginal(photo)}>
                  <Text style={styles.dlBtnTxt}>Last ned video</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <Image
              source={{ uri: viewUrl }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel={photo.fileName || 'Bilde'}
            />
          )}
        </Pressable>

        {infoOpen ? (
          <View style={styles.infoSheet}>
            <Text style={styles.infoTitle}>Egenskaper</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              <MetaRow label="Filnavn" value={photo.fileName} />
              <MetaRow label="Type" value={isVideo ? 'Video' : 'Bilde'} />
              <MetaRow label="Format" value={photo.mimeType} />
              <MetaRow label="Størrelse" value={photo.sizeBytes != null ? formatBytes(photo.sizeBytes) : null} />
              <MetaRow label="Oppløsning" value={dims} />
              <MetaRow label="Tatt" value={taken} />
              <MetaRow label="Sted" value={place} />
              <MetaRow label="Lastet opp" value={uploaded} />
              <MetaRow label="Av" value={photo.createdByName} />
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
  videoFallback: { alignItems: 'center', gap: 12, padding: 24 },
  videoFallbackTxt: { color: '#cbd5e1', textAlign: 'center' },
  dlBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  dlBtnTxt: { color: '#fff', fontWeight: '500' },
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
  metaValue: { color: colors.ink, fontSize: 13, flexShrink: 1, textAlign: 'right' },
});
