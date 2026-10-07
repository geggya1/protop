import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { companyFollowUpPeople } from '../../src/anbud/customers';
import { openIndexIntentFromContract } from '../../src/anbud/directContract';
import { updateContractDetails } from '../../src/anbud/lifecycle';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { rememberRegulation } from '../../src/indeksregulering/regulationLog';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { defaultOkonomiSubView } from '../../src/navigation/shellModules';
import { dueByContractId } from '../../src/indeksregulering/watch';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { matchCustomer } from '../../src/economy/desk';
import EconomyContracts from './EconomyContracts';
import EconomyCustomers from './EconomyCustomers';
import EconomyDesk from './EconomyDesk';
import EconomyIndex from './EconomyIndex';
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
  const [indexOpen, setIndexOpen] = useState(false);
  const [cases, setCases] = useState([]);
  const [series, setSeries] = useState(null);
  const saveChain = useRef(Promise.resolve());

  const saveRegulations = useCallback((contractId, entry) => {
    const job = saveChain.current.then(async () => {
      const loaded = await loadAnbudState(familyId);
      const current = (loaded?.contracts || []).find((row) => row.id === contractId);
      const regulations = rememberRegulation(current?.regulations, entry);
      const result = updateContractDetails(loaded, contractId, { regulations });
      if (!result?.ok) return result;
      const stored = await saveAnbudState(result.state, familyId);
      setAnbud(stored);
      return { ok: true, state: stored };
    });
    saveChain.current = job.catch(() => {});
    return job;
  }, [familyId]);

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
  const people = companyFollowUpPeople(members);
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
          project={projects.find((row) => row.id === selectedContract?.projectId) || null}
          onClose={backToDesk}
          onSaveRegulations={saveRegulations}
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
          lead="Velg prosjekt, avtale eller rammeavtale. Kundeforhold reguleres ikke. Indeksregulering åpnes når avtalen er valgt, og bruker feltene som allerede er registrert."
          includeCustomers={false}
          searchPlaceholder="Søk i prosjekt, avtaler og rammeavtaler"
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
      {page === 'oversikt' ? <EconomyWelcome stored={company} /> : null}
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
