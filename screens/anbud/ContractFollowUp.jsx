import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ConfirmDialog from '../../components/ConfirmDialog';
import DateField from '../../components/DateField';
import { projectFromAward } from '../../src/anbud/handoff';
import {
  deleteContract,
  linkProject,
  registerDirectContract,
  updateContractDetails,
} from '../../src/anbud/lifecycle';
import { filterContracts, indeksCaseFromContract } from '../../src/anbud/directContract';
import { formatNok } from '../../src/anbud/model';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import {
  agreementResponsiblePeople,
  ownerLabel,
  setCustomerOwner,
  upsertCustomer,
} from '../../src/anbud/customers';
import { formatNumberId } from '../../src/anbud/numbering';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { loadCases, saveCases } from '../../src/indeksregulering/storage';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { watchEmployees } from '../../src/employees/storage';
import { dateKey } from '../../src/utils/dates';
import DirectAgreementForm from './DirectAgreementForm';
import AgreementDetail from './AgreementDetail';
import CreateMenu from '../../components/CreateMenu';

const PAGE = 50;
const COLUMNS = [
  { key: 'oppdragId', label: 'Oppdrags-ID', width: 100 },
  { key: 'title', label: 'Oppdrag', width: 240 },
  { key: 'kind', label: 'Type', width: 120 },
  { key: 'buyer', label: 'Kunde', width: 170 },
  { key: 'place', label: 'Sted', width: 120 },
  { key: 'period', label: 'Periode', width: 180 },
  { key: 'value', label: 'Honorar eks. mva', width: 130 },
  { key: 'owner', label: 'Ansvarlig', width: 150 },
  { key: 'status', label: 'Status', width: 96 },
  { key: 'actions', label: '', width: 72 },
];

function isoFromDate(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return dateKey(value) || '';
}

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
  const [employees, setEmployees] = useState([]);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [composeParent, setComposeParent] = useState('');
  const [composeKind, setComposeKind] = useState('');
  const [composeCustomer, setComposeCustomer] = useState('');
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState({ buyer: '', project: '', from: '', to: '', query: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);

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
    if (!companyId) {
      setEmployees([]);
      return undefined;
    }
    return watchEmployees(companyId, setEmployees);
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
  const followPeople = useMemo(
    () => agreementResponsiblePeople(people, employees),
    [people, employees],
  );
  const visible = useMemo(() => filterContracts(contracts, filters), [contracts, filters]);
  const paged = visible.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const selected = contracts.find((row) => row.id === selectedId) || null;
  const selectedCustomer = selected
    ? customers.find((row) => row.id === selected.customerId) || null
    : null;
  const childCount = deleteTarget
    ? contracts.filter((row) => row.parentId === deleteTarget.id).length
    : 0;

  function cell(row, key) {
    const customer = customers.find((item) => item.id === row.customerId) || null;
    if (key === 'oppdragId') return formatNumberId(row.oppdragId) || '—';
    if (key === 'title') return row.title || '—';
    if (key === 'kind') return kindLabel(row.kind) || '—';
    if (key === 'buyer') return row.buyer || '—';
    if (key === 'place') return row.fields?.place || row.address || '—';
    if (key === 'period') return [row.start, row.end].filter(Boolean).join(' – ') || '—';
    if (key === 'value') return row.value != null && row.value !== '' ? formatNok(row.value) : '—';
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    const loaded = await loadAnbudState(companyId);
    const result = await commit(deleteContract(loaded, target.id));
    if (!result?.ok) return;
    if (selectedId === target.id || contracts.some((row) => row.parentId === target.id && row.id === selectedId)) {
      setView('list');
      setSelectedId('');
    }
    setNote(`«${target.title || 'Avtalen'}» er slettet.`);
  }

  if (!state) return null;

  return (
    <View style={{ gap: 12 }}>
      {view === 'list' ? (
        <CreateMenu
          label="Ny avtale"
          title="Ny avtale"
          info="Inngåtte avtaler med dokumenter, varighet og underavtaler. Beløp føres eks. mva."
          actions={[
            { id: 'new', label: 'Registrer avtale', primary: true, onPress: () => { setComposeParent(''); setComposeKind(''); setView('compose'); } },
            { id: 'work', label: 'Tilbudsarbeid', onPress: onOpenWork },
          ]}
        />
      ) : null}
      {view !== 'detail' ? (
        <View style={[styles.filters, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <TextInput
            value={filters.query}
            onChangeText={(query) => { setFilters((current) => ({ ...current, query })); setPage(0); }}
            placeholder="Søk i avtale, kunde, nummer, dokument"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <View style={styles.filterRow}>
            <TextInput
              value={filters.buyer}
              onChangeText={(buyer) => { setFilters((current) => ({ ...current, buyer })); setPage(0); }}
              placeholder="Kunde"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <View style={[styles.dateBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <DateField
                value={filters.from || null}
                onChange={(date) => { setFilters((current) => ({ ...current, from: isoFromDate(date) })); setPage(0); }}
                placeholder="Fra"
                iconColor={colors.brand}
                style={styles.dateField}
                textStyle={{ color: filters.from ? colors.ink : colors.placeholder, fontSize: 14 }}
              />
            </View>
            <View style={[styles.dateBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <DateField
                value={filters.to || null}
                onChange={(date) => { setFilters((current) => ({ ...current, to: isoFromDate(date) })); setPage(0); }}
                placeholder="Til"
                iconColor={colors.brand}
                style={styles.dateField}
                textStyle={{ color: filters.to ? colors.ink : colors.placeholder, fontSize: 14 }}
              />
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Alle beløp er eks. mva.</Text>
        </View>
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
          onDeleted={() => { setView('list'); setSelectedId(''); setNote('Avtalen er slettet.'); }}
        />
      ) : null}
      {view === 'list' ? (
        <>
          {!contracts.length ? (
            <Text style={{ color: colors.muted }}>Ingen avtaler er registrert ennå.</Text>
          ) : null}
          {contracts.length && !visible.length ? (
            <Text style={{ color: colors.muted }}>Ingen avtaler matcher søket.</Text>
          ) : null}
          {visible.length ? (
            <ScrollView horizontal style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <View>
                <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                  {COLUMNS.map((column) => (
                    <Text key={column.key || column.label} style={[styles.th, { width: column.width, color: colors.muted }]}>
                      {column.label}
                    </Text>
                  ))}
                </View>
                {paged.map((row, index) => {
                  const active = row.status !== 'avsluttet';
                  return (
                    <View
                      key={row.id}
                      style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: index % 2 ? (colors.sunken || colors.bg) : colors.card }]}
                    >
                      {COLUMNS.map((column) => {
                        if (column.key === 'actions') {
                          return (
                            <View key="actions" style={[styles.actions, { width: column.width }]}>
                              <TouchableOpacity
                                onPress={() => setDeleteTarget(row)}
                                accessibilityRole="button"
                                accessibilityLabel={`Slett ${row.title || 'avtale'}`}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              >
                                <Text style={{ color: colors.danger || '#b42318', fontSize: 13, fontWeight: '600' }}>Slett</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        }
                        if (column.key === 'status') {
                          return (
                            <TouchableOpacity
                              key={column.key}
                              onPress={() => { setSelectedId(row.id); setView('detail'); }}
                              accessibilityRole="button"
                              style={{ width: column.width, paddingHorizontal: 12, paddingVertical: 12 }}
                            >
                              <View style={[styles.badge, { backgroundColor: active ? (colors.brandSoft || colors.bg) : (colors.sunken || colors.bg) }]}>
                                <Text style={{ color: active ? colors.brand : colors.muted, fontSize: 12, fontWeight: '700' }}>
                                  {cell(row, column.key)}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        }
                        return (
                          <TouchableOpacity
                            key={column.key}
                            onPress={() => { setSelectedId(row.id); setView('detail'); }}
                            accessibilityRole="button"
                            style={{ width: column.width }}
                          >
                            <Text
                              style={[
                                styles.td,
                                { color: colors.ink },
                                column.key === 'title' && { fontWeight: '600' },
                                column.key === 'value' && { fontVariant: ['tabular-nums'] },
                              ]}
                              numberOfLines={2}
                            >
                              {cell(row, column.key)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })}
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

      <ConfirmDialog
        visible={!!deleteTarget}
        title="Slett avtale?"
        message={deleteTarget
          ? (childCount
            ? `«${deleteTarget.title || 'Avtalen'}» og ${childCount} underavtale${childCount === 1 ? '' : 'r'} slettes permanent.`
            : `«${deleteTarget.title || 'Avtalen'}» slettes permanent.`)
          : ''}
        confirmText="Slett"
        cancelText="Avbryt"
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  grow: { flexGrow: 1, minWidth: 160 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' },
  filters: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  dateBox: { borderWidth: 1, borderRadius: 10, minWidth: 148, justifyContent: 'center' },
  dateField: { paddingHorizontal: 10, paddingVertical: 8, minHeight: 40 },
  tableWrap: { borderWidth: 1, borderRadius: 14 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, minHeight: 52, alignItems: 'center' },
  head: { minHeight: 44 },
  th: { paddingHorizontal: 12, paddingVertical: 10, fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  td: { paddingHorizontal: 12, paddingVertical: 14, fontSize: 14 },
  actions: { paddingHorizontal: 10, alignItems: 'flex-start', justifyContent: 'center' },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
});
