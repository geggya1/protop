import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ContractFollowUp from './ContractFollowUp';

export default function ContractScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, familyId, shellIntent, clearShellIntent, members } = useApp();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <ContractFollowUp
        colors={colors}
        companyId={familyId}
        people={members}
        intent={shellIntent}
        onClearIntent={clearShellIntent}
        onOpenWork={() => requestShellTab?.('anbud', 'tilbud')}
        onOpenIndex={(intent) => requestShellTab?.('okonomi', 'indeks', intent)}
        onOpenCustomer={(customerId) => requestShellTab?.('kunder', null, { type: 'openCustomer', customerId })}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
});
