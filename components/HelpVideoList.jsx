import React, { useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}
// Over hjelpekortet (2147482000), som videoene åpnes fra.
const PORTAL = { position: 'fixed', inset: 0, zIndex: 2147483000 };
const ORIGIN = 'https://protop.no';

/**
 * Støttevideoer i hjelpen. På web spilles videoen av her (med tekstspor), i mobilappen åpnes den i nettleseren.
 * videos: fra src/help/helpVideos.js (videosForPage / listVideos).
 */
export default function HelpVideoList({ videos, accent = '#1099F4', compact = false }) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(null);
  if (!videos?.length) return null;
  const web = Platform.OS === 'web';
  const open = (v) => {
    if (web && createPortal) setPlaying(v);
    else Linking.openURL(/^https?:/.test(v.src) ? v.src : `${ORIGIN}${v.src}`).catch(() => {});
  };
  return (
    <View style={styles.list}>
      {videos.map((v) => (
        <TouchableOpacity
          key={v.id}
          style={styles.row}
          onPress={() => open(v)}
          accessibilityRole="button"
          accessibilityLabel={`${t('helpCard.playVideo')}: ${v.title}`}
          testID="help-video-row"
        >
          <View style={[styles.play, { backgroundColor: accent }]}>
            <Ionicons name="play" size={compact ? 13 : 15} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={2}>{v.title}</Text>
            <Text style={styles.sub} numberOfLines={2}>{`${v.minutes} min · ${t('helpCard.videoLang')}`}{v.pitch ? ` · ${v.pitch}` : ''}</Text>
          </View>
        </TouchableOpacity>
      ))}
      {web && playing && createPortal && typeof document !== 'undefined' ? createPortal(
        <div style={PORTAL} data-help-video="1">
          <View style={styles.scrim}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setPlaying(null)} accessibilityLabel={t('moduleIntro.close')} />
            <View style={styles.player} accessibilityRole="dialog" accessibilityLabel={playing.title}>
              <View style={styles.playerHead}>
                <Text style={styles.playerTitle} numberOfLines={1}>{playing.title}</Text>
                <TouchableOpacity onPress={() => setPlaying(null)} accessibilityRole="button" accessibilityLabel={t('moduleIntro.close')} hitSlop={10}>
                  <Ionicons name="close" size={20} color="#e2e8f0" />
                </TouchableOpacity>
              </View>
              {/* Teksten er brent inn i videoen; sporet er for skjermlesere og nedlasting. */}
              <video src={playing.src} controls autoPlay playsInline preload="metadata" style={{ width: '100%', maxHeight: '75vh', backgroundColor: '#000', display: 'block' }}>
                <track kind="captions" srcLang={playing.language} label="English" src={playing.captions} />
              </video>
            </View>
          </View>
        </div>,
        document.body,
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  play: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '500', color: '#0f172a' },
  sub: { fontSize: 12.5, lineHeight: 17, color: '#475569' },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.72)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  player: { width: '100%', maxWidth: 1040, borderRadius: 14, overflow: 'hidden', backgroundColor: '#0f172a' },
  playerHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  playerTitle: { flex: 1, color: '#f8fafc', fontSize: 15, fontWeight: '600' },
});
