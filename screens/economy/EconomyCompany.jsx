import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import CompanyLanding from '../project/CompanyLanding';

export default function EconomyCompany({ stored, cpvCodes = [], onSettings, onUnits }) {
  const colors = useColors();
  if (!stored?.navn) {
    return (
      <View nativeID="economy-company" id="economy-company" style={styles.page}>
        <Text style={[styles.kicker, { color: colors.muted }]}>Økonomi · Selskap</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>
          Knytt bedriften under Selskap i bedriftsmenyen, så vises regnskap og offentlige opplysninger her.
        </Text>
      </View>
    );
  }
  return (
    <View nativeID="economy-company" id="economy-company" style={styles.page}>
      <Text style={[styles.kicker, { color: colors.muted }]}>Økonomi · Selskap</Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Alle opplysninger om bedriften vi er inne på: omsetning, nøkkeltall, register og struktur.
      </Text>
      <CompanyLanding
        stored={stored}
        cpvCodes={cpvCodes}
        onSettings={onSettings}
        onUnits={onUnits}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  kicker: { fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' },
  lead: { fontSize: 15, lineHeight: 21 },
});
