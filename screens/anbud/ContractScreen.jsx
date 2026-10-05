import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ContractFollowUp from './ContractFollowUp';

export default function ContractScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab } = useApp();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <Text style={[styles.h, { color: colors.ink }]}>Kontrakt / avtale</Text>
      <Text style={{ color: colors.muted }}>
        Oppfølging av inngåtte kontrakter og avtaler. Tildeling kommer hit fra tilbudsarbeidet.
      </Text>
      <ContractFollowUp
        colors={colors}
        onOpenWork={() => requestShellTab?.('anbud', 'tilbud')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  h: { fontSize: 22, fontWeight: '600' },
});
