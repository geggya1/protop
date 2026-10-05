import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { companyFollowUpPeople } from '../../src/anbud/customers';
import { openIndexIntentFromContract } from '../../src/anbud/directContract';
import { loadAnbudState } from '../../src/anbud/storage';
import { emptyProjectState, postEntry } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { defaultOkonomiSubView } from '../../src/navigation/shellModules';
import IndeksreguleringPanel from '../project/IndeksreguleringPanel';
import EconomyContracts from './EconomyContracts';
import EconomyCustomers from './EconomyCustomers';
import EconomyDesk from './EconomyDesk';
import EconomyWelcome from './EconomyWelcome';

export default function EconomyScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const {
    family, familyId, members, requestShellTab, shellIntent,
  } = useApp();
  const page = defaultOkonomiSubView(subView);
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [anbud, setAnbud] = useState(null);
  const [chosen, setChosen] = useState(null);

  useEffect(() => {
    let live = true;
    loadProjectState().then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (ready) saveProjectState(state).catch(() => {});
  }, [state, ready]);

  useEffect(() => {
    loadAnbudState(familyId).then(setAnbud);
  }, [familyId]);

  useEffect(() => {
    if (shellIntent?.type === 'openIndexDraft' && shellIntent.draft) {
      setChosen({
        id: shellIntent.contractId || shellIntent.caseId || '',
        title: shellIntent.draft.title || '',
      });
    }
  }, [shellIntent]);

  const project = state.projects.find((item) => item.id === state.activeProjectId && item.status !== 'arkivert') || null;
  const company = family?.company || null;
  const customers = anbud?.customers || [];
  const contracts = anbud?.contracts || [];
  const people = companyFollowUpPeople(members);
  const incomingDraft = shellIntent?.type === 'openIndexDraft' && shellIntent.draft;
  const showIndex = page === 'indeks' && !!(chosen || incomingDraft);

  function book(entry) {
    const booked = postEntry(state, entry);
    if (booked.ok) setState(booked.state);
    return booked;
  }

  function openIndex(contract) {
    const extras = {
      supplier: company?.navn || '',
      supplierOrgnr: company?.organisasjonsnummer || '',
      website: company?.hjemmeside || '',
      phone: company?.telefon || '',
      email: company?.epostadresse || '',
    };
    const intent = openIndexIntentFromContract(contract, extras);
    setChosen(contract);
    requestShellTab?.('okonomi', 'indeks', intent);
  }

  function backToDesk() {
    requestShellTab?.('okonomi', 'oversikt');
  }

  if (showIndex) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={backToDesk} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Til oversikt</Text>
        </TouchableOpacity>
        {chosen?.title ? (
          <Text style={{ color: colors.muted }}>Indeksregulering av {chosen.title}</Text>
        ) : null}
        <IndeksreguleringPanel
          project={project}
          onBook={project ? book : null}
          seedDraft={incomingDraft || undefined}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      {page === 'oversikt' ? <EconomyWelcome stored={company} /> : null}
      {page === 'oversikt' ? (
        <EconomyDesk
          customers={customers}
          contracts={contracts}
          chosenContractId={chosen?.id || ''}
          hint=""
          onChooseContract={setChosen}
          onOpenIndex={openIndex}
        />
      ) : null}
      {page === 'kunder' ? (
        <EconomyCustomers
          customers={customers}
          contracts={contracts}
          people={people}
          onOpenRegister={() => requestShellTab?.('kunder')}
          onOpenCustomer={(customerId) => requestShellTab?.('kunder', null, { type: 'openCustomer', customerId })}
        />
      ) : null}
      {page === 'avtaler' ? (
        <EconomyContracts
          customers={customers}
          contracts={contracts}
          people={people}
          onOpenRegister={() => requestShellTab?.('kontrakt')}
          onOpenContract={(contractId) => requestShellTab?.('kontrakt', null, { type: 'openContract', contractId })}
          onOpenIndex={openIndex}
        />
      ) : null}
      {page === 'indeks' && !showIndex ? (
        <EconomyDesk
          customers={customers}
          contracts={contracts}
          chosenContractId={chosen?.id || ''}
          hint="Velg en avtale først. Indeksregulering vises når avtalen er valgt."
          onChooseContract={setChosen}
          onOpenIndex={openIndex}
        />
      ) : null}
      {page === 'oversikt' && !company?.navn ? (
        <View style={{ paddingTop: 8 }}>
          <Text style={{ color: colors.muted }}>
            Åpne Selskap for å knytte bedriften, så vises logo og nøkkeltall her.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 980, width: '100%', alignSelf: 'flex-start', gap: 20 },
});
