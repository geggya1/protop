import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import CreateMenu from '../../components/CreateMenu';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ContractFollowUp from './ContractFollowUp';
import AgreementTreatment from './AgreementTreatment';

export default function ContractScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, familyId, family, shellIntent, clearShellIntent, members } = useApp();
  const [part, setPart] = useState('inngatt');
  const [composeNonce, setComposeNonce] = useState(0);

  useEffect(() => {
    if (!shellIntent) return;
    if (shellIntent.type === 'composeAgreement' || shellIntent.type === 'openContract') {
      setPart('inngatt');
    }
  }, [shellIntent]);

  function startInngattCompose() {
    setPart('inngatt');
    setComposeNonce((value) => value + 1);
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <CreateMenu
        label="Ny avtale"
        title="Ny avtale"
        info="Velg hvordan avtalen skal opprettes."
        actions={[
          {
            id: 'inngatt',
            label: 'Registrer inngått',
            hint: 'Avtalen er allerede inngått eller signert et annet sted. Last opp dokumentet, la AI lese feltene, og knytt den til et prosjekt.',
            primary: true,
            onPress: startInngattCompose,
          },
          {
            id: 'behandling',
            label: 'Behandle med motpart',
            hint: 'Utkastet sendes mellom partene, med merknader og signering i ProTop.',
            onPress: () => setPart('behandling'),
          },
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
          onRegisterExisting={startInngattCompose}
        />
      ) : (
        <ContractFollowUp
          colors={colors}
          companyId={familyId}
          people={members}
          intent={shellIntent}
          onClearIntent={clearShellIntent}
          composeNonce={composeNonce}
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
