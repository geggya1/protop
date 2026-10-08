import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { projectFromAward } from '../../src/anbud/handoff';
import {
  linkProject,
  registerDirectContract,
  updateContractDetails,
} from '../../src/anbud/lifecycle';
import { filterContracts, indeksCaseFromContract } from '../../src/anbud/directContract';
import { formatNok } from '../../src/anbud/model';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { companyFollowUpPeople, ownerLabel, setCustomerOwner, upsertCustomer } from '../../src/anbud/customers';
import { formatNumberId } from '../../src/anbud/numbering';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { loadCases, saveCases } from '../../src/indeksregulering/storage';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import DirectAgreementForm from './DirectAgreementForm';
import AgreementDetail from './AgreementDetail';
import CreateMenu from '../../components/CreateMenu';

const PAGE = 50;
const COLUMNS = [
  { key: 'systemId', label: 'System-ID', width: 92 },
  { key: 'oppdragId', label: 'Oppdrags-ID', width: 110 },
  { key: 'title', label: 'Oppdrag', width: 220 },
  { key: 'kind', label: 'Type', width: 120 },
  { key: 'buyer', label: 'Kunde', width: 160 },
  { key: 'place', label: 'Sted', width: 130 },
  { key: 'period', label: 'Periode', width: 170 },
  { key: 'value', label: 'Sum', width: 110 },
  { key: 'owner', label: 'Ansvarlig', width: 140 },
  { key: 'status', label: 'Status', width: 100 },
];

export default function ContractFollowUp({
  colors,
  companyId,
  people = [],
  onOpenWork,
  onOpenIndex,
  onOpenCustomer,
  onSnapshot,
  intent = null,
  onClearIntent,
}) {
  const [state, setState] = useState(null);
  const [note, setNote] = useState('');
  const [projects, setProjects] = useState([]);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [composeParent, setComposeParent] = useState('');
  const [composeKind, setComposeKind] = useState('');
  const [composeCustomer, setComposeCustomer] = useState('');
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ buyer: '', project: '', from: '', to: '', query: '' });

  useEffect(() => {
    loadAnbudState(companyId).then((loaded) => {
      setState(loaded);
      onSnapshot?.(loaded);
    });
    loadProjectState().then((loaded) => {
      setProjects((loaded.projects || []).filter((row) => row.status !== 'arkivert'));
    });
  }, [companyId]);

  useEffect(() => {
    if (!intent) return;
    if (intent.type === 'openContract' && intent.contractId) {
      setSelectedId(intent.contractId);
      setView('detail');
      onClearIntent?.();
    }
    if (intent.type === 'composeAgreement') {
      setComposeParent(intent.parentId || '');
      setComposeKind(intent.kind || '');
      setComposeCustomer(intent.customerId || '');
      setView('compose');
      onClearIntent?.();
    }
  }, [intent, onClearIntent]);

  async function commit(result) {
    if (!result.ok) {
      setNote(result.error);
      return result;
    }
    const saved = await saveAnbudState(result.state, companyId);
    setState(saved);
    onSnapshot?.(saved);
    setNote('');
    return { ...result, state: saved };
  }

  async function seedIndex(contract) {
    const row = indeksCaseFromContract(contract);
    if (!row) return '';
    const cases = await loadCases();
    const next = [row, ...cases.filter((item) => item.id !== row.id)].slice(0, 40);
    await saveCases(next);
    return row.id;
  }

  async function register(input) {
    let loaded = await loadAnbudState(companyId);
    if (input.createCustomer && input.buyer && !input.customerId) {
      const made = upsertCustomer(loaded, {
        name: input.buyer,
        orgnr: input.orgnr,
        personnummer: input.personnummer,
        address: input.address,
        place: input.place,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone,
        ownerUid: input.ownerUid,
        ownerName: input.ownerName,
      });
      if (!made.ok && made.customer) {
        input = { ...input, customerId: made.customer.id };
      } else if (!made.ok) {
        return commit(made);
      } else {
        loaded = made.state;
        input = { ...input, customerId: made.customer.id };
      }
    }
    if (input.customerId && input.ownerUid) {
      const owned = setCustomerOwner(loaded, input.customerId, { uid: input.ownerUid, name: input.ownerName });
      if (owned.ok) loaded = owned.state;
    }
    if (composeKind && !input.kind) input = { ...input, kind: composeKind };
    if (composeParent && !input.parentId) input = { ...input, parentId: composeParent };
    const made = registerDirectContract(loaded, input);
    if (!made.ok) return commit(made);
    const createdId = made.state.contracts[0]?.id;
    const result = await commit(made);
    if (!result?.ok) return result;
    const contract = result.state.contracts.find((row) => row.id === createdId) || result.state.contracts[0];
    const indeksCaseId = await seedIndex(contract);
    if (indeksCaseId && contract) {
      const linked = await loadAnbudState(companyId);
      await commit(updateContractDetails(linked, contract.id, { indeksCaseId }));
    }
    setView('detail');
    setSelectedId(contract.id);
    setComposeParent('');
    setComposeKind('');
    setNote('Avtalen er registrert.');
    return result;
  }

  async function openProject(contract) {
    const projectState = await loadProjectState();
    const handed = projectFromAward(projectState, contract);
    if (!handed.ok) {
      setNote(handed.error);
      return;
    }
    if (handed.created) await saveProjectState(handed.state);
    setProjects((handed.state.projects || []).filter((row) => row.status !== 'arkivert'));
    if (contract.projectId && contract.projectId === handed.projectId) {
      setNote('Prosjektet er allerede koblet.');
      return;
    }
    const loaded = await loadAnbudState(companyId);
    const linked = linkProject(loaded, contract.id, handed.projectId);
    await commit(linked);
    if (linked.ok) setNote(handed.created ? 'Prosjektet er opprettet med kontraktssummen.' : 'Prosjektet er koblet.');
  }

  function openIndex(contract) {
    const draft = contract.indexDraft;
    if (!draft) {
      setNote('Avtalen har ikke uttrukne indeksfelt ennå. Importer dokumentene på nytt.');
      return;
    }
    onOpenIndex?.({ type: 'openIndexDraft', draft, caseId: contract.indeksCaseId || `ir-${contract.id}` });
  }

  const contracts = state?.contracts || [];
  const customers = state?.customers || [];
  const followPeople = companyFollowUpPeople(people);
  const visible = useMemo(() => filterContracts(contracts, filters), [contracts, filters]);
  const paged = visible.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const selected = contracts.find((row) => row.id === selectedId) || null;
  const selectedCustomer = selected
    ? customers.find((row) => row.id === selected.customerId) || null
    : null;

  function cell(row, key) {
    const customer = customers.find((item) => item.id === row.customerId) || null;
    if (key === 'systemId') return formatNumberId(row.systemId) || '—';
    if (key === 'oppdragId') return formatNumberId(row.oppdragId) || '—';
    if (key === 'title') return row.title || '—';
    if (key === 'kind') return kindLabel(row.kind) || '—';
    if (key === 'buyer') return row.buyer || '—';
    if (key === 'place') return row.fields?.place || row.address || '—';
    if (key === 'period') return [row.start, row.end].filter(Boolean).join(' – ') || '—';
    if (key === 'value') return row.value ? formatNok(row.value) : '—';
    if (key === 'owner') return ownerLabel(customer, followPeople) || '—';
    if (key === 'status') return row.status === 'avsluttet' ? 'Avsluttet' : 'Aktiv';
    return '—';
  }

  async function assignOwner(person) {
    if (!selectedCustomer) {
      setNote('Koble avtalen til en kunde før ansvarlig tildeles.');
      return;
    }
    const loaded = await loadAnbudState(companyId);
    await commit(setCustomerOwner(loaded, selectedCustomer.id, person));
  }

  if (!state) return null;

  return (
    <View style={{ gap: 12 }}>
      {view === 'list' ? (
        <CreateMenu
          label="Ny avtale"
          title="Ny avtale"
          info="Inngåtte avtaler med dokumenter, varighet og underavtaler. Standardfeltene følger NS 8403-fremsiden."
          actions={[
            { id: 'new', label: 'Registrer avtale', primary: true, onPress: () => { setComposeParent(''); setComposeKind(''); setView('compose'); } },
            { id: 'work', label: 'Tilbudsarbeid', onPress: onOpenWork },
          ]}
        />
      ) : null}
      {view !== 'detail' ? (
        <>
          <View style={[styles.filters, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <TextInput value={filters.query} onChangeText={(query) => { setFilters((current) => ({ ...current, query })); setPage(0); }} placeholder="Søk i avtale, kunde, nummer, dokument" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
            <View style={styles.row}>
              <TextInput value={filters.buyer} onChangeText={(buyer) => { setFilters((current) => ({ ...current, buyer })); setPage(0); }} placeholder="Kunde" placeholderTextColor={colors.placeholder} style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
              <TextInput value={filters.from} onChangeText={(from) => setFilters((current) => ({ ...current, from }))} placeholder="Fra" placeholderTextColor={colors.placeholder} style={[styles.input, styles.date, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
              <TextInput value={filters.to} onChangeText={(to) => setFilters((current) => ({ ...current, to }))} placeholder="Til" placeholderTextColor={colors.placeholder} style={[styles.input, styles.date, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
            </View>
          </View>
        </>
      ) : null}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {view === 'compose' ? (
        <DirectAgreementForm
          colors={colors}
          companyId={companyId}
          projects={projects}
          contracts={contracts}
          customers={customers}
          people={followPeople}
          parentId={composeParent}
          kind={composeKind}
          customerId={composeCustomer}
          onCancel={() => setView('list')}
          onRegister={register}
          onOpenCustomer={onOpenCustomer}
        />
      ) : null}
      {view === 'detail' && selected ? (
        <AgreementDetail
          contract={selected}
          contracts={contracts}
          customer={selectedCustomer}
          people={followPeople}
          colors={colors}
          companyId={companyId}
          onCommit={commit}
          onBack={() => { setView('list'); setSelectedId(''); }}
          onOpenProject={() => openProject(selected)}
          onOpenIndex={() => openIndex(selected)}
          onOpenCustomer={onOpenCustomer}
          onAssignOwner={assignOwner}
          onOpenAgreement={(id) => { setSelectedId(id); setView('detail'); }}
          onNewChild={(kind) => { setComposeKind(kind); setComposeParent(selected.id); setView('compose'); }}
        />
      ) : null}
      {view === 'list' ? (
        <>
          {!contracts.length ? (
            <Text style={{ color: colors.muted }}>Ingen avtale er registrert. Last opp oppdragsavtalen og eventuelle vedlegg, eller opprett den for hånd.</Text>
          ) : null}
          {contracts.length && !visible.length ? (
            <Text style={{ color: colors.muted }}>Ingen avtaler matcher søket.</Text>
          ) : null}
          {visible.length ? (
            <ScrollView horizontal style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <View>
                <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                  {COLUMNS.map((column) => (
                    <Text key={column.key} style={[styles.th, { width: column.width, color: colors.muted }]}>{column.label}</Text>
                  ))}
                </View>
                {paged.map((row, index) => (
                  <TouchableOpacity
                    key={row.id}
                    onPress={() => { setSelectedId(row.id); setView('detail'); }}
                    accessibilityRole="button"
                    style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
                  >
                    {COLUMNS.map((column) => (
                      <Text
                        key={column.key}
                        style={[
                          styles.td,
                          { width: column.width, color: colors.ink },
                          column.key === 'title' && { fontWeight: '600' },
                        ]}
                        numberOfLines={2}
                      >
                        {cell(row, column.key)}
                      </Text>
                    ))}
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          ) : null}
          {visible.length > PAGE ? (
            <View style={styles.row}>
              <TouchableOpacity onPress={() => setPage((n) => Math.max(0, n - 1))} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Forrige</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.muted }}>{page + 1} / {pages} · {visible.length} avtaler</Text>
              <TouchableOpacity onPress={() => setPage((n) => Math.min(pages - 1, n + 1))} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Neste</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>{visible.length} av {contracts.length} avtaler</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  grow: { flexGrow: 1, minWidth: 160 },
  date: { width: 140 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  filters: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  tableWrap: { borderWidth: 1, borderRadius: 14 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, minHeight: 48, alignItems: 'center' },
  head: { minHeight: 42 },
  th: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  td: { paddingHorizontal: 12, paddingVertical: 12, fontSize: 14 },
});
