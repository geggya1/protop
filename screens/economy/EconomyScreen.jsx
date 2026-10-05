import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { loadAnbudState } from '../../src/anbud/storage';
import { emptyProjectState, postEntry } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { defaultOkonomiSubView } from '../../src/navigation/shellModules';
import EconomyWelcome from './EconomyWelcome';
import EconomyCompany from './EconomyCompany';
import EconomyCustomers from './EconomyCustomers';
import EconomyContracts from './EconomyContracts';

export default function EconomyScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const {
    family, familyId, requestShellTab, shellIntent,
  } = useApp();
  const page = defaultOkonomiSubView(subView);
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [anbud, setAnbud] = useState(null);

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

  const project = state.projects.find((item) => item.id === state.activeProjectId && item.status !== 'arkivert') || null;
  const company = family?.company || null;
  const customers = anbud?.customers || [];
  const contracts = anbud?.contracts || [];
  const incomingDraft = shellIntent?.type === 'openIndexDraft' ? shellIntent.draft : null;
  const incomingContractId = shellIntent?.contractId || '';

  function book(entry) {
    const booked = postEntry(state, entry);
    if (booked.ok) setState(booked.state);
    return booked;
  }

  function openPage(id) {
    requestShellTab?.('okonomi', id);
  }

  let body = (
    <EconomyWelcome stored={company} onOpen={openPage} />
  );
  if (page === 'selskap') {
    body = (
      <EconomyCompany
        stored={company}
        cpvCodes={family?.cpvCodes || []}
        onSettings={() => requestShellTab?.('selskap')}
        onUnits={() => requestShellTab?.('selskap', 'underenheter')}
      />
    );
  } else if (page === 'kunder') {
    body = (
      <EconomyCustomers
        customers={customers}
        contracts={contracts}
        onOpenContract={(id) => requestShellTab?.('okonomi', 'avtaler', { type: 'openEconomyContract', contractId: id })}
      />
    );
  } else if (page === 'avtaler') {
    body = (
      <EconomyContracts
        customers={customers}
        contracts={contracts}
        company={company}
        selectedId={incomingContractId}
        seedDraft={incomingDraft}
        project={project}
        onBook={book}
      />
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      {body}
      {!company?.navn && page === 'oversikt' ? (
        <View style={{ paddingTop: 8 }}>
          <Text style={{ color: colors.muted }}>
            Åpne Selskap i bedriftsmenyen for å knytte bedriften.
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
