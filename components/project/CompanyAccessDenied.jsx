import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/** «Ingen tilgang» i bedriftsdelen. Egen fil, så skallet ikke laster hele tilgangsstyringen. */
export default function CompanyAccessDenied({ colors }) {
  return (
    <View style={styles.denied}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Ingen tilgang</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Du har ikke tilgang til denne delen av bedriften. Tilgangen styres under Selskap, Tilgang.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  denied: { flex: 1, padding: 24, gap: 8, maxWidth: 560 },
  title: { fontSize: 22, fontWeight: '600' },
  lead: { fontSize: 14, lineHeight: 20 },
});
