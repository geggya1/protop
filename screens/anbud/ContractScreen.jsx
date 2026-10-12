import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { setNoticeDecision } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import ContractFollowUp from './ContractFollowUp';
import CalloffInbox from './CalloffInbox';
import AgreementTreatment from './AgreementTreatment';
import AgreementPathSwitch, { AVROP_PATH } from './AgreementPathSwitch';

export default function ContractScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, familyId, family, shellIntent, clearShellIntent, members } = useApp();
  const [part, setPart] = useState('inngatt');
  const [desk, setDesk] = useState(null);

  useEffect(() => {
    let live = true;
    loadAnbudState(familyId).then((loaded) => {
      if (live) setDesk(loaded);
    });
    return () => { live = false; };
  }, [familyId]);

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <AgreementPathSwitch
        colors={colors}
        value={part}
        onChange={setPart}
        options={[
          ['inngatt', 'Registrer inngått', 'Avtalen er allerede inngått eller signert et annet sted. Last opp dokumentet, la AI lese feltene, og knytt den til et prosjekt.'],
          ['behandling', 'Behandle med motpart', 'Utkastet sendes mellom partene, med merknader og signering i ProTop.'],
          AVROP_PATH,
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
          onRegisterExisting={() => setPart('inngatt')}
        />
      ) : null}
      {part === 'avrop' && desk ? (
        <CalloffInbox
          state={desk}
          colors={colors}
          onCommit={(next) => { setDesk(next); saveAnbudState(next, familyId); }}
          onOpenBid={(notice) => {
            const marked = setNoticeDecision(desk, notice.id, 'aktuell');
            if (marked.ok) {
              setDesk(marked.state);
              saveAnbudState(marked.state, familyId);
            }
            requestShellTab?.('anbud', 'vurdering');
          }}
        />
      ) : null}
      {part === 'inngatt' ? (
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
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
});
