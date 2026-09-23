import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

/**
 * Sekvensiell opplastingsindikator nede til høyre.
 * Viser aktiv fil med grønn prosent-fyll; ferdige forsvinner fra køen.
 */
export default function AlbumUploadProgress({ items = [] }) {
  const visible = (items || []).filter((x) => x && (x.status === 'uploading' || x.status === 'error'));
  if (!visible.length) return null;

  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityLiveRegion="polite">
      {visible.map((item) => {
        const pct = Math.max(0, Math.min(100, Math.round(item.progress || 0)));
        const failed = item.status === 'error';
        return (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}>
              {item.previewUri ? (
                <Image source={{ uri: item.previewUri }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons
                    name={item.mediaType === 'video' ? 'videocam' : 'image'}
                    size={16}
                    color={colors.muted}
                  />
                </View>
              )}
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name || (item.mediaType === 'video' ? 'Video' : 'Bilde')}
                </Text>
                <Text style={[styles.pct, failed && styles.pctErr]}>
                  {failed ? (item.error || 'Feilet') : `${pct} %`}
                </Text>
              </View>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  failed ? styles.fillErr : styles.fillOk,
                  { width: `${failed ? 100 : pct}%` },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 12,
    bottom: 88,
    zIndex: 40,
    gap: 8,
    maxWidth: 240,
    width: '72%',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#e2e8f0' },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  meta: { flex: 1, minWidth: 0 },
  name: { fontSize: 13, fontWeight: '500', color: colors.ink },
  pct: { fontSize: 12, color: colors.success, marginTop: 2, fontWeight: '600' },
  pctErr: { color: colors.danger },
  track: {
    marginTop: 8,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 999 },
  fillOk: { backgroundColor: colors.success },
  fillErr: { backgroundColor: colors.danger },
});
