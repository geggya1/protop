import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { loadAgreementShare } from '../../src/anbud/agreementClient';
import AgreementTreatment from './AgreementTreatment';

function tokenFromLocation() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search || '');
  return String(params.get('avtale') || '').trim();
}

export default function AgreementLinkHost() {
  const colors = useColors();
  const [token, setToken] = useState('');
  const [row, setRow] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const found = tokenFromLocation();
    if (!found) return undefined;
    setToken(found);
    let live = true;
    loadAgreementShare(found).then((result) => {
      if (!live) return;
      if (!result?.ok) setError(result?.error || 'Kunne ikke åpne avtalen.');
      else setRow(result.row);
    }).catch((err) => {
      if (live) setError(err?.message || 'Kunne ikke åpne avtalen.');
    });
    return () => { live = false; };
  }, []);

  if (!token) return null;

  function close() {
    setToken('');
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.replaceState({}, '', `${window.location.origin}${window.location.pathname}`);
    }
  }

  return (
    <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.inner}>
        <Text onPress={close} accessibilityRole="button" style={{ color: colors.brand }}>Lukk avtalen</Text>
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        {row ? (
          <AgreementTreatment
            party="motpart"
            shareToken={token}
            sharedRow={row}
            onShared={setRow}
            colors={colors}
          />
        ) : !error ? <Text style={{ color: colors.muted }}>Henter avtalen …</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 40 },
  inner: { padding: 16, gap: 12, paddingBottom: 48 },
});
