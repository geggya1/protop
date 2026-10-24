/**
 * Tilbudsbordet uten innlogging, for å teste henting av konkurransegrunnlag og Q&A lokalt.
 * Åpnes på /anbud-demo, bare i utviklingsbygg (__DEV__). Uten selskap lagres alt
 * kun i nettleseren: ingen Firestore, ingen Storage, ingen konto.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { normalizeBidWork } from '../../src/anbud/bidLibrary';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import BidDesk from './BidDesk';
import TenderAlert from './TenderAlert';

// Ekte Doffin-kunngjøringer: Artifik med og uten Q&A, og EU-Supply.
const DEMO_NOTICES = [
  ['2026-116384', 'Artifik med mange vedlegg (nytt sideformat)'],
  ['2026-116375', 'Artifik med spørsmål og svar'],
  ['2026-116281', 'Artifik med tre spørsmål og svar'],
  ['2026-116457', 'EU-Supply med offentlige dokumenter'],
  // Doffin oppgir disse med http:// eller bare et firmanavn. Ga «må være en https-lenke» før.
  ['2026-116004', 'Mercell med http-lenke i Doffin'],
  ['2023-372837', 'EU-Supply med http-lenke i Doffin'],
  ['2025-114386', 'Bare firmanavn i dokumentfeltet'],
  // Hyyr (Stryn kommune) og TendSign.
  ['2026-116069', 'Hyyr: Stryn kommune, kommuneplanens arealdel'],
];

export function anbudDemoAllowed() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function seedBids(existing) {
  const known = new Set((existing || []).map((row) => row.id));
  const fresh = DEMO_NOTICES
    .map(([noticeId, title]) => normalizeBidWork({
      id: `bid_demo_${noticeId}`,
      noticeId,
      source: 'protop',
      title,
      buyer: 'Testdata fra Doffin',
      phase: 'trinn2',
      stage: 'planlegging',
      dossier: {},
    }))
    .filter((row) => !known.has(row.id));
  return [...fresh, ...(existing || [])];
}

export default function AnbudDemoScreen() {
  const colors = useColors();
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('tilbud');

  useEffect(() => {
    if (!anbudDemoAllowed()) return;
    let live = true;
    loadAnbudState(undefined).then(async (loaded) => {
      await saveAnbudState({ ...loaded, bids: seedBids(loaded.bids) }, undefined);
      if (live) setReady(true);
    });
    return () => { live = false; };
  }, []);

  if (!anbudDemoAllowed()) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted, padding: 16 }}>Siden finnes bare lokalt.</Text>
      </View>
    );
  }

  return (
    <View nativeID="anbud-demo" style={[styles.screen, { backgroundColor: colors.bg }]}>
      <View style={[styles.banner, { backgroundColor: colors.sunken || colors.card, borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Anbud-demo (lokal)</Text>
        <Text style={{ color: colors.muted }}>
          Uten innlogging. Lagres bare i denne nettleseren. Åpne et tilbud for å hente dokumenter og spørsmål og svar.
        </Text>
      </View>
      <View style={styles.tabs}>
        {[['tilbud', 'Tilbud'], ['varsling', 'Varsling']].map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setView(id)} accessibilityRole="button">
            <Text style={{ color: view === id ? colors.ink : colors.brand, fontWeight: view === id ? '700' : '400' }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {ready && view === 'tilbud' ? <BidDesk company={null} colors={colors} /> : null}
      {ready && view === 'varsling' ? <TenderAlert company={{ name: 'Demo AS', cpvCodes: ['71400000'] }} colors={colors} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  tabs: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 8 },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
