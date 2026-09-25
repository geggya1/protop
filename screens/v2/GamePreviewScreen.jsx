/**
 * Midlertidig forhåndsvisning av lokale spill uten innlogging.
 * Kun for manuell QA via /game-preview (web).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Screen } from '../../components/ui';
import LocalPlayScreen from './LocalPlayScreen';
import { colors } from '../../src/theme';

const LOCAL = [
  { id: 'ttt', label: 'Tre på rad' },
  { id: 'connect4', label: 'Fire på rad' },
  { id: 'chess', label: 'Sjakk' },
  { id: 'memory', label: 'Memory' },
  { id: 'g2048', label: '2048' },
  { id: 'hangman', label: 'Hangman' },
  { id: 'mines', label: 'Minesveiper' },
  { id: 'slide', label: '15-puslespill' },
  { id: 'war', label: 'Krig' },
  { id: 'blackjack', label: 'Blackjack' },
];

function idFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    const parts = (window.location.pathname || '').split('/').filter(Boolean);
    // /game-preview/connect4  (eller /GamePreview etter nav-rename — bruk query/session)
    if (parts[0]?.toLowerCase() === 'game-preview' && parts[1]) return parts[1];
    const q = new URLSearchParams(window.location.search).get('game');
    if (q) return q;
    try {
      const stored = sessionStorage.getItem('weekplanGamePreviewId');
      if (stored) {
        sessionStorage.removeItem('weekplanGamePreviewId');
        return stored;
      }
    } catch { /* ignore */ }
    return null;
  } catch {
    return null;
  }
}

export default function GamePreviewScreen() {
  const route = useRoute();
  const initial = useMemo(
    () => route.params?.gameId || idFromUrl(),
    [route.params?.gameId],
  );
  const [gameId, setGameId] = useState(initial);

  useEffect(() => {
    const fromRoute = route.params?.gameId;
    const fromUrl = idFromUrl();
    if (fromRoute || fromUrl) setGameId(fromRoute || fromUrl);
  }, [route.params?.gameId]);

  if (gameId) {
    return (
      <View style={{ flex: 1 }}>
        <TouchableOpacity style={styles.back} onPress={() => setGameId(null)}>
          <Text style={styles.backTxt}>← Alle spill (forhåndsvisning)</Text>
        </TouchableOpacity>
        <LocalPlayScreen
          previewGameId={gameId}
          // Preview defaults AI for board games so celebration/AI is easy to QA
          previewMode={['chess', 'ttt', 'connect4'].includes(gameId) ? 'ai' : undefined}
        />
      </View>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.title}>Spill-forhåndsvisning</Text>
        <Text style={styles.sub}>
          Tester responsiv layout, «Slik går du frem» og gevinstfeiring — uten innlogging.
        </Text>
        {LOCAL.map((g) => (
          <TouchableOpacity key={g.id} style={styles.row} onPress={() => setGameId(g.id)}>
            <Text style={styles.rowTxt}>{g.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 20, paddingBottom: 60, gap: 10, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '400', color: colors.ink },
  sub: { color: colors.muted, marginBottom: 12, lineHeight: 20 },
  row: {
    backgroundColor: colors.card, borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: colors.line,
  },
  rowTxt: { fontWeight: '400', color: colors.ink, fontSize: 16 },
  back: {
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.brandSoft,
    zIndex: 2,
  },
  backTxt: { color: colors.brand, fontWeight: '400' },
});
