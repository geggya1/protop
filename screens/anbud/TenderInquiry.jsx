import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import IntakePanel from './IntakePanel';

export default function TenderInquiry({ company, colors }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Anbudsforespørsel</Text>
      <Text style={{ color: colors.muted }}>
        Registrer forespørsler dere mottar. Last opp brev, e-post eller bilder, så leses feltene inn. Her sendes det ikke ut forespørsler.
      </Text>
      <IntakePanel colors={colors} company={company} />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
});
