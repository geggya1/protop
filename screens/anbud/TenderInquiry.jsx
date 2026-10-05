import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import IntakePanel from './IntakePanel';

export default function TenderInquiry({ company, colors }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Registrer henvendelse</Text>
      <Text style={{ color: colors.muted }}>
        Registrer brev, e-post eller annen henvendelse bedriften har fått. Dette er innkommende arbeid mot bedriften, ikke utgående anbudsforespørsel.
      </Text>
      <IntakePanel colors={colors} company={company} />
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
});
