import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ContractFollowUp from './ContractFollowUp';
import AgreementTreatment from './AgreementTreatment';

export default function ContractScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, familyId, family, shellIntent, clearShellIntent, members } = useApp();
  const [part, setPart] = useState('register');

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <View style={styles.switch}>
        {[['register', 'Register'], ['behandling', 'Behandling']].map(([id, label]) => {
          const on = part === id;
          return (
            <TouchableOpacity key={id} onPress={() => setPart(id)} accessibilityRole="button" style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {part === 'behandling' ? (
        <AgreementTreatment
          companyId={familyId}
          company={{
            name: family?.company?.navn || family?.name || '',
            orgnr: family?.company?.organisasjonsnummer || '',
          }}
          members={members}
          colors={colors}
        />
      ) : (
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
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  switch: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
});
