import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { companyFollowUpPeople } from '../../src/anbud/customers';
import { openIndexIntentFromContract } from '../../src/anbud/directContract';
import { loadAnbudState } from '../../src/anbud/storage';
import { addDocument, emptyProjectState, postEntry } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { defaultOkonomiSubView } from '../../src/navigation/shellModules';
import { dueByContractId } from '../../src/indeksregulering/watch';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
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
    if (shellIntent?.type === 'openIndexDraft' && shellIntent.draft) {
      setChosen({
        id: shellIntent.contractId || shellIntent.caseId || '',
        title: shellIntent.draft.title || '',
        projectId: shellIntent.projectId || '',
      });
    }
  }, [shellIntent]);

  const customers = anbud?.customers || [];
  const contracts = anbud?.contracts || [];
  const people = companyFollowUpPeople(members);
  const projects = state.projects || [];
  const company = family?.company || null;
  const incomingDraft = shellIntent?.type === 'openIndexDraft' && shellIntent.draft;
  const showIndex = page === 'indeks' && !!(chosen || incomingDraft);
  const linkedProjectId = chosen?.projectId
    || contracts.find((row) => row.id === chosen?.id)?.projectId
    || '';
  const project = projects.find((item) => item.id === linkedProjectId && item.status !== 'arkivert')
    || projects.find((item) => item.id === state.activeProjectId && item.status !== 'arkivert')
    || null;
  const dueById = useMemo(
    () => dueByContractId(contracts, cases, series),
    [contracts, cases, series],
  );

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
    requestShellTab?.('okonomi', 'indeks', {
      ...intent,
      projectId: contract.projectId || '',
    });
  }

  function backToDesk() {
    setChosen(null);
    requestShellTab?.('okonomi', 'indeks');
  }

  function saveGeneration(row) {
    setCases((prev) => [row, ...prev.filter((item) => item.id !== row.id)].slice(0, 40));
    if (!project?.id || !row?.letterPlain) return;
    const titled = `Indeksregulering ${String(row.regulatedPeriod || '').replace(/^(\d{4})M(\d{2})$/, '$1-$2') || String(row.savedAt || '').slice(0, 10)}`;
    const next = addDocument(state, {
      projectId: project.id,
      title: titled,
      discipline: 'indeksregulering',
      note: [
        row.title || 'Indeksregulering',
        row.reference ? `Ref. ${row.reference}` : '',
        row.addition != null ? `Tillegg ${row.addition} kr` : '',
        '',
        row.letterPlain,
      ].filter((line, index, all) => line || index === all.length - 1).join('\n'),
    });
    if (next.ok) setState(next.state);
  }

  if (showIndex) {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={backToDesk} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Til valg av kunde / avtale</Text>
        </TouchableOpacity>
        {chosen?.title ? (
          <Text style={{ color: colors.muted }}>Indeksregulering av {chosen.title}</Text>
        ) : null}
        <IndeksreguleringPanel
          project={project}
          contractId={chosen?.id || shellIntent?.contractId || ''}
          onBook={project ? book : null}
          onSaved={saveGeneration}
          seedDraft={incomingDraft || undefined}
          seedCaseId={shellIntent?.caseId || chosen?.indeksCaseId || ''}
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
          lead="Velg kunde eller prosjekt, deretter avtalen. Beregningen bruker avtaleinfo og siste kjente SSB-indeks. Utropstegn viser avtaler som er klare for ny regulering."
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
      {page === 'oversikt' ? (
        <EconomyDesk
          customers={customers}
          contracts={contracts}
          projects={projects}
          dueById={dueById}
          chosenContractId={chosen?.id || ''}
          title="Kunder og avtaler"
          lead="Økonomisk oversikt. Full kunde- og avtaleinformasjon ligger i bedriftsmenyen under Kunder og Kontrakt / avtale."
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
