import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { openIndexIntentFromContract } from '../../src/anbud/directContract';
import { loadAnbudState } from '../../src/anbud/storage';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { defaultOkonomiSubView } from '../../src/navigation/shellModules';
import { dueByContractId } from '../../src/indeksregulering/watch';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { matchCustomer } from '../../src/economy/desk';
import EconomyDesk from './EconomyDesk';
import EconomyIndex from './EconomyIndex';
import EconomyWelcome from './EconomyWelcome';

export default function EconomyScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const {
    family, familyId, requestShellTab, shellIntent,
  } = useApp();
  const page = defaultOkonomiSubView(subView);
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [anbud, setAnbud] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [series, setSeries] = useState(null);

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
    let live = true;
    Promise.all([loadCases(), loadIndexCache()]).then(([stored, cache]) => {
      if (!live) return;
      setCases(stored);
      setSeries(cache?.series || null);
    }).catch(() => {});
    return () => { live = false; };
  }, [page, chosen?.id]);

  useEffect(() => {
    if (shellIntent?.type !== 'openIndexDraft') return;
    setChosen({
      id: shellIntent.contractId || shellIntent.caseId || '',
      title: shellIntent.draft?.title || '',
      projectId: shellIntent.projectId || '',
    });
    setIndexOpen(true);
  }, [shellIntent]);

  const customers = anbud?.customers || [];
  const contracts = anbud?.contracts || [];
  const projects = state.projects || [];
  const company = family?.company || null;
  const selectedContract = contracts.find((row) => row.id === chosen?.id) || chosen;
  const showIndex = page === 'indeks' && indexOpen && !!(selectedContract?.id || shellIntent?.draft);
  const dueById = useMemo(
    () => dueByContractId(contracts, cases, series),
    [contracts, cases, series],
  );

  function openIndex(contract) {
    const extras = {
      supplier: company?.navn || '',
      supplierOrgnr: company?.organisasjonsnummer || '',
      website: company?.hjemmeside || '',
      customer: matchCustomer(customers, contract),
      company,
    };
    const intent = openIndexIntentFromContract(contract, extras);
    setChosen(contract);
    setIndexOpen(true);
    requestShellTab?.('okonomi', 'indeks', {
      ...intent,
      projectId: contract.projectId || '',
    });
  }

  function backToDesk() {
    setIndexOpen(false);
    requestShellTab?.('okonomi', 'indeks');
  }

  if (showIndex) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <EconomyIndex
          contract={selectedContract}
          customer={matchCustomer(customers, selectedContract)}
          company={company}
          onClose={backToDesk}
        />
      </ScrollView>
    );
  }

  if (page === 'indeks') {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <EconomyDesk
          customers={customers}
          contracts={contracts}
          projects={projects}
          dueById={dueById}
          chosenContractId={chosen?.id || ''}
          title="Indeksregulering"
          lead="Velg kunde eller prosjekt først, deretter avtalen. Indeksregulering åpnes først når avtalen er valgt, og bruker feltene som allerede er registrert."
          onChooseContract={setChosen}
          onOpenIndex={openIndex}
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
      <EconomyWelcome stored={company} />
      {!company?.navn ? (
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
