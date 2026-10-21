import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { companyFollowUpPeople } from '../../src/anbud/customers';
import { openIndexIntentFromContract } from '../../src/anbud/directContract';
import { updateContractDetails } from '../../src/anbud/lifecycle';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { rememberRegulation } from '../../src/indeksregulering/regulationLog';
import {
  mergeRegulationList,
  readWorkspaceQuery,
  upsertCase,
  workspaceHref,
} from '../../src/indeksregulering/cases';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { defaultOkonomiSubView } from '../../src/navigation/shellModules';
import { canDeleteCase } from '../../src/indeksregulering/cases';
import { dueByContractId } from '../../src/indeksregulering/watch';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { matchCustomer } from '../../src/economy/desk';
import { draftFromRegisteredContract } from '../../src/economy/fromContract';
import EconomyDesk from './EconomyDesk';
import EconomyIndex from './EconomyIndex';
import IndexWorkspace from './IndexWorkspace';
import EconomyIndices from './EconomyIndices';
import EconomyInvoices from './EconomyInvoices';
import EconomyBilling from './EconomyBilling';
import EconomyOps from './EconomyOps';
import EconomyWelcome from './EconomyWelcome';
import EconomySettingsScreen from './EconomySettingsScreen';
import EconomyEarnings from './EconomyEarnings';
import { supplierFromCompany } from '../../src/economy/ehf.js';

export default function EconomyScreen({ subView = 'oversikt' }) {
  const colors = useColors();
  const {
    family, familyId, members, requestShellTab, shellIntent, clearShellIntent, isAdmin, user,
  } = useApp();
  const page = defaultOkonomiSubView(subView);
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [anbud, setAnbud] = useState(null);
  const [chosen, setChosen] = useState(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [workspaceCaseId, setWorkspaceCaseId] = useState('');
  const [workspaceView, setWorkspaceView] = useState('');
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
    const from = new Date();
    from.setMonth(from.getMonth() - 2);
    const fromDate = from.toISOString().slice(0, 10);
    loadProjectState(familyId, { hours: { fromDate } }).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (ready) saveProjectState(state, familyId).catch(() => {});
  }, [state, ready, familyId]);

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
    if (typeof window === 'undefined') return;
    const query = readWorkspaceQuery(window.location.search);
    if (!query.contractId) return;
    setWorkspaceCaseId(query.caseId);
    setWorkspaceView(query.view);
    setChosen({ id: query.contractId });
    setIndexOpen(true);
  }, []);

  useEffect(() => {
    if (shellIntent?.type !== 'openIndexDraft') return;
    setChosen({
      id: shellIntent.contractId || '',
      title: shellIntent.draft?.title || '',
      projectId: shellIntent.projectId || '',
    });
    setWorkspaceCaseId(shellIntent.workspaceCaseId || '');
    setWorkspaceView(shellIntent.view || '');
    setIndexOpen(true);
    if (typeof window !== 'undefined' && shellIntent.contractId) {
      const href = workspaceHref(window.location.href, shellIntent.contractId, shellIntent.workspaceCaseId || '', shellIntent.view || '');
      const next = `${new URL(href).pathname}${new URL(href).search}`;
      if (`${window.location.pathname}${window.location.search}` !== next) {
        window.history.replaceState(window.history.state || {}, '', next);
      }
    }
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

  const actor = {
    uid: user?.uid || '',
    name: user?.displayName || user?.email || '',
  };

  async function persistIndexCase(nextCase, { priceVersions } = {}) {
    const loaded = await loadAnbudState(familyId, { force: true });
    const current = (loaded?.contracts || []).find((row) => row.id === nextCase.contractId);
    if (!current) return { ok: false, error: 'Avtalen finnes ikke.' };
    const applied = ['godkjent', 'klar_til_utsending', 'sending', 'sendt', 'sendefeil'].includes(nextCase.status);
    const storedCase = (current.indexCases || []).find((row) => row.id === nextCase.id);
    const merged = upsertCase(current.indexCases, nextCase, storedCase ? nextCase.revision : null);
    if (!merged.ok) return merged;
    const result = updateContractDetails(loaded, current.id, {
      indexCases: merged.cases,
      priceVersions: priceVersions || current.priceVersions || [],
      regulations: applied ? mergeRegulationList(current.regulations, merged.case) : current.regulations,
    });
    if (!result?.ok) return result;
    const stored = await saveAnbudState(result.state, familyId);
    setAnbud(stored);
    const saved = (stored?.contracts || []).find((row) => row.id === current.id);
    const fresh = (saved?.indexCases || []).find((row) => row.id === nextCase.id) || nextCase;
    return { ok: true, case: fresh };
  }

  async function deleteIndexCase(contractId, caseId) {
    const loaded = await loadAnbudState(familyId, { force: true });
    const current = (loaded?.contracts || []).find((row) => row.id === contractId);
    if (!current) return { ok: false, error: 'Avtalen finnes ikke.' };
    const target = (current.indexCases || []).find((row) => row.id === caseId);
    if (!target) return { ok: true };
    if (!canDeleteCase(target)) return { ok: false, error: 'Ferdigstilte brev kan ikke slettes.' };
    const deletedIndexCaseIds = [...new Set([...(current.deletedIndexCaseIds || []), caseId])].slice(-200);
    const result = updateContractDetails(loaded, current.id, {
      indexCases: (current.indexCases || []).filter((row) => row.id !== caseId),
      deletedIndexCaseIds,
    });
    if (!result?.ok) return result;
    const stored = await saveAnbudState(result.state, familyId);
    setAnbud(stored);
    return { ok: true };
  }

  function rememberIndexUrl(contractId, caseId = '', view = '') {
    if (typeof window === 'undefined' || !contractId) return;
    const href = workspaceHref(window.location.href, contractId, caseId, view);
    const next = `${new URL(href).pathname}${new URL(href).search}`;
    window.history.replaceState(window.history.state || {}, '', next);
  }

  function openIndex(contract, caseId = '', view = '') {
    if (!contract?.id) return;
    const intent = openIndexIntentFromContract(contract, {
      supplier: company?.navn || '',
      supplierOrgnr: company?.organisasjonsnummer || '',
      website: company?.hjemmeside || '',
      customer: matchCustomer(customers, contract),
      company,
    });
    requestShellTab?.('okonomi', 'indeks', {
      ...intent,
      projectId: contract.projectId || '',
      view,
      workspaceCaseId: caseId,
    });
    rememberIndexUrl(contract.id, caseId, view);
    setChosen(contract);
    setWorkspaceCaseId(caseId);
    setWorkspaceView(view);
    setIndexOpen(true);
  }

  function backToDesk() {
    setIndexOpen(false);
    setWorkspaceCaseId('');
    setWorkspaceView('');
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      ['indeksAvtale', 'indeksSak', 'indeksVis'].forEach((key) => url.searchParams.delete(key));
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    requestShellTab?.('okonomi', 'indeks');
  }

  const workspaceDraft = showIndex && selectedContract?.id
    ? draftFromRegisteredContract(selectedContract, {
      customer: matchCustomer(customers, selectedContract),
      company,
      projectNumber: projects.find((row) => row.id === selectedContract.projectId)?.number || '',
      contracts,
    })
    : null;

  if (showIndex) {
    return (
      <View style={[styles.screen, styles.work, { backgroundColor: colors.bg, padding: 16, paddingBottom: 24, minHeight: 0 }]}>
        {selectedContract?.id ? (
          <IndexWorkspace
            contract={selectedContract}
            customer={matchCustomer(customers, selectedContract)}
            company={company}
            project={projects.find((row) => row.id === selectedContract?.projectId) || null}
            draft={workspaceDraft}
            actor={actor}
            caseId={workspaceCaseId}
            initialView={workspaceView}
            series={series}
            contracts={contracts}
            onClose={backToDesk}
            onSave={persistIndexCase}
            onDelete={(caseId) => deleteIndexCase(selectedContract.id, caseId)}
            onOpenProject={() => requestShellTab?.('projects', null, { type: 'openProject', projectId: selectedContract?.projectId || '' })}
          />
        ) : (
          <EconomyIndex
            contract={selectedContract}
            customer={matchCustomer(customers, selectedContract)}
            company={company}
            project={projects.find((row) => row.id === selectedContract?.projectId) || null}
            contracts={contracts}
            onClose={backToDesk}
            onSaveRegulations={saveRegulations}
          />
        )}
      </View>
    );
  }

  if (page === 'indekser') {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={[styles.inner, styles.wide]}
        keyboardShouldPersistTaps="handled"
      >
        <EconomyIndices contracts={contracts} />
      </ScrollView>
    );
  }

  if (page === 'indeks') {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={[styles.inner, styles.work]}
        keyboardShouldPersistTaps="handled"
      >
        <EconomyDesk
          customers={customers}
          contracts={contracts}
          projects={projects}
          timeEntries={state.timeEntries || []}
          series={series}
          dueById={dueById}
          onOpenContract={(contractId) => requestShellTab?.('kontrakt', null, { type: 'openContract', contractId })}
          onOpenIndex={(contract) => openIndex(contract, '', 'oversikt')}
          onOpenProject={(projectId) => requestShellTab?.('projects', null, { type: 'openProject', projectId })}
        />
      </ScrollView>
    );
  }

  if (page === 'faktura') {
    return (
      <EconomyInvoices
        familyId={familyId}
        customers={customers}
        projects={projects}
        isAdmin={!!isAdmin}
        supplier={supplierFromCompany(company, family?.name)}
        onOpenCustomer={(customerId) => requestShellTab?.('kunder', null, { type: 'openCustomer', customerId })}
        onOpenProject={(projectId) => requestShellTab?.('projects', null, { type: 'openProject', projectId })}
        openInvoiceId={shellIntent?.type === 'openInvoice' ? shellIntent.invoiceId : ''}
        onConsumeIntent={clearShellIntent}
      />
    );
  }

  if (page === 'fakturagrunnlag') {
    return <EconomyBilling />;
  }

  if (page === 'utlegg') {
    return <EconomyOps kind="expenses" />;
  }

  if (page === 'kjorebok') {
    return <EconomyOps kind="mileage" company={company} />;
  }

  if (page === 'produkter') {
    return <EconomyOps kind="products" />;
  }

  if (page === 'innstillinger') {
    return <EconomySettingsScreen />;
  }

  if (page === 'inntjening' || page === 'kunder' || page === 'avtaler') {
    const earningsSection = page === 'kunder' || page === 'avtaler' ? page : 'ansatte';
    return (
      <EconomyEarnings
        section={earningsSection}
        customers={customers}
        contracts={contracts}
        projects={projects}
        timeEntries={state.timeEntries || []}
        people={people}
        onOpenCustomerRegister={() => requestShellTab?.('kunder')}
        onOpenCustomer={(customerId) => requestShellTab?.('kunder', null, { type: 'openCustomer', customerId })}
        onOpenContractRegister={() => requestShellTab?.('kontrakt')}
        onOpenContract={(contractId) => requestShellTab?.('kontrakt', null, { type: 'openContract', contractId })}
        onOpenProject={(projectId) => requestShellTab?.('projects', null, { type: 'openProject', projectId })}
        onOpenIndex={openIndex}
      />
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      {page === 'oversikt' ? <EconomyWelcome stored={company} /> : null}
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
  work: { maxWidth: '100%', width: '100%', alignSelf: 'stretch' },
  wide: { maxWidth: 1280 },
});
