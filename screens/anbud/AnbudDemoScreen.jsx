/**
 * Tilbudsbordet uten innlogging, for å teste henting av konkurransegrunnlag og Q&A lokalt.
 * Åpnes på /anbud-demo, bare i utviklingsbygg (__DEV__). Uten selskap lagres alt
 * kun i nettleseren: ingen Firestore, ingen Storage, ingen konto.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { normalizeBidWork } from '../../src/anbud/bidLibrary';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import BidDesk from './BidDesk';

// Ekte Doffin-kunngjøringer: Artifik med og uten Q&A, og EU-Supply.
const DEMO_NOTICES = [
  ['2026-116384', 'Artifik med mange vedlegg (nytt sideformat)'],
  ['2026-116375', 'Artifik med spørsmål og svar'],
  ['2026-116281', 'Artifik med tre spørsmål og svar'],
  ['2026-116457', 'EU-Supply med offentlige dokumenter'],
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
      {ready ? <BidDesk company={null} colors={colors} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  banner: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
  },
});
