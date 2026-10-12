import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ContractFollowUp from './ContractFollowUp';
import AgreementTreatment from './AgreementTreatment';
import AgreementPathSwitch from './AgreementPathSwitch';

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
      <AgreementPathSwitch
        colors={colors}
        value={part === 'register' ? 'inngatt' : 'behandling'}
        onChange={(id) => setPart(id === 'inngatt' ? 'register' : 'behandling')}
        options={[
          ['inngatt', 'Registrer inngått', 'Avtalen er allerede inngått eller signert et annet sted. Last opp dokumentet, la AI lese feltene, og knytt den til et prosjekt.'],
          ['behandling', 'Behandle med motpart', 'Utkastet sendes mellom partene, med merknader og signering i ProTop.'],
        ]}
      />
      {part === 'behandling' ? (
        <AgreementTreatment
          companyId={familyId}
          company={{
            name: family?.company?.navn || family?.name || '',
            orgnr: family?.company?.organisasjonsnummer || '',
          }}
          members={members}
          colors={colors}
          onRegisterExisting={() => setPart('register')}
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
});
