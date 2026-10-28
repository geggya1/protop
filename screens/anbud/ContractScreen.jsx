import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import CreateMenu from '../../components/CreateMenu';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { agreementResponsiblePeople } from '../../src/anbud/customers';
import { loadAnbudState } from '../../src/anbud/storage';
import { useEmployees } from '../../src/context/CompanyDataContext';
import ContractFollowUp from './ContractFollowUp';
import AgreementTreatment from './AgreementTreatment';
import AgreementCreateWizard from './AgreementCreateWizard';

export default function ContractScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { requestShellTab, familyId, family, shellIntent, clearShellIntent, members } = useApp();
  const [part, setPart] = useState(() => (
    shellIntent?.type === 'agreementTemplateReady' || shellIntent?.type === 'composeAgreementTreatment'
      ? 'behandling'
      : 'inngatt'
  ));
  const [composeNonce, setComposeNonce] = useState(0);
  const [seedPicks, setSeedPicks] = useState(null);
  const [seedDraft, setSeedDraft] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardSeed, setWizardSeed] = useState(null);
  const { employees } = useEmployees(familyId);
  const [contracts, setContracts] = useState([]);

  useEffect(() => {
    if (!familyId) return undefined;
    let live = true;
    loadAnbudState(familyId).then((loaded) => {
      if (live) setContracts((loaded?.contracts || []).filter((row) => !row.deletedAt));
    });
    return () => { live = false; };
  }, [familyId, composeNonce, part]);

  const people = useMemo(() => agreementResponsiblePeople(members, employees), [members, employees]);

  useEffect(() => {
    if (!shellIntent) return;
    if (shellIntent.type === 'composeAgreement' || shellIntent.type === 'openContract') {
      setPart('inngatt');
    }
    if (shellIntent.type === 'agreementTemplateReady' || shellIntent.type === 'composeAgreementTreatment') {
      const returned = shellIntent.returnDraft && typeof shellIntent.returnDraft === 'object'
        ? shellIntent.returnDraft
        : {};
      if (returned.wizardPath === 'utkast') {
        setPart('behandling');
        setWizardSeed({
          path: 'utkast',
          step: returned.wizardStep || 'template',
          draft: {
            kind: returned.kind || 'oppdrag',
            customerId: returned.customerId || '',
            customerName: returned.customerName || '',
            email: returned.email || '',
            parentId: returned.parentId || '',
            createProject: !!returned.createProject,
            templateId: shellIntent.templateId || returned.templateId || '',
            templateTitle: returned.templateTitle || '',
          },
          note: shellIntent.templateId
            ? 'Avtalemalen er lagret. Velg den og fortsett til utkast.'
            : '',
        });
        setWizardOpen(true);
        clearShellIntent?.();
        return;
      }
      setPart('behandling');
    }
  }, [shellIntent, clearShellIntent]);

  function openWizard() {
    setWizardSeed(null);
    setWizardOpen(true);
  }

  function startInngatt(files = null) {
    setPart('inngatt');
    setSeedPicks(files);
    setComposeNonce((value) => value + 1);
  }

  function startUtkast(draft) {
    setSeedDraft(draft || null);
    setPart('behandling');
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
    >
      <CreateMenu
        label="Ny avtale"
        actions={[{ id: 'start', label: 'Ny avtale', onPress: openWizard }]}
      />
      <AgreementCreateWizard
        visible={wizardOpen}
        colors={colors}
        companyId={familyId}
        people={people}
        contracts={contracts}
        seed={wizardSeed}
        onClose={() => { setWizardOpen(false); setWizardSeed(null); }}
        onCompleteInngatt={({ files }) => startInngatt(files)}
        onCompleteUtkast={({ draft }) => startUtkast(draft)}
        onOpenFormBuilder={({ mode, returnDraft }) => {
          requestShellTab?.('skjema', null, {
            type: 'composeAgreementTemplate',
            mode: mode || 'blank',
            templateId: returnDraft?.templateId || '',
            nonce: `${Date.now()}`,
            returnDraft: returnDraft || {},
          });
        }}
      />
      {part === 'behandling' ? (
        <AgreementTreatment
          companyId={familyId}
          company={{
            name: family?.company?.navn || family?.name || '',
            orgnr: family?.company?.organisasjonsnummer || '',
            email: family?.company?.epostadresse || '',
          }}
          members={members}
          colors={colors}
          shellIntent={shellIntent}
          onClearIntent={clearShellIntent}
          seedDraft={seedDraft}
          onSeedDraftConsumed={() => setSeedDraft(null)}
          onRequestCreate={openWizard}
        />
      ) : (
        <ContractFollowUp
          colors={colors}
          companyId={familyId}
          people={members}
          intent={shellIntent}
          onClearIntent={clearShellIntent}
          composeNonce={composeNonce}
          seedPicks={seedPicks}
          onSeedPicksConsumed={() => setSeedPicks(null)}
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
