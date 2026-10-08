import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { kindLabel } from '../../src/anbud/agreementTemplate';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { linkProject } from '../../src/anbud/lifecycle';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import CreateMenu from '../../components/CreateMenu';
import FilterMenu from '../../components/FilterMenu';
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  addProjectAgreementDocuments,
  archiveProject,
  attachOfferDocuments,
  createProject,
  deleteProjects,
  emptyProjectState,
  importProjects,
  projectMissingAgreement,
  removeProjectDocument,
  updateProject,
} from '../../src/project/engine';
import {
  PROJECT_REGISTER_IMPORT_ACCEPT,
  linkImportPlanCustomer,
  planProjectImport,
  readCompanyProjectTable,
  suggestCustomers,
} from '../../src/project/projectImport';
import {
  PRICING_MODELS,
  emptyPricingSettings,
  normalizePricingModel,
  pricingModelLabel,
} from '../../src/project/projectFields';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { uploadAgreementFile } from '../../src/anbud/contractFiles';
import SearchSelect from '../../components/project/SearchSelect';

const DOC_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,application/pdf,image/*';

const EMPTY_FORM = {
  name: '',
  number: '',
  customerId: '',
  client: '',
  customerNumber: '',
  orgnr: '',
  parentProjectId: '',
  parentNumber: '',
  parentName: '',
  department: '',
  manager: '',
  projectStatus: '',
  statusComment: '',
  start: '',
  end: '',
  street: '',
  postalCode: '',
  placeName: '',
  place: '',
  cadastralId: '',
  pricingModel: '',
  pricingSettings: emptyPricingSettings(),
  feeEstimate: '',
  description: '',
  agreementKind: 'oppdrag',
  contractId: '',
  frameworkAgreementId: '',
  agreementDocuments: [],
  offerDocuments: [],
};

const SELECT_COL_WIDTH = 44;

const LIST_COLUMNS = [
  ['Nr', 100],
  ['Prosjekt', 320],
  ['Status', 140],
  ['Kundenr', 100],
  ['Kunde', 260],
  ['Org.nr', 120],
  ['Avdeling', 140],
  ['Leder', 200],
  ['Start', 110],
  ['Slutt', 110],
  ['Avtale', 240],
  ['Prismodell', 160],
  ['Hovedprosjekt', 160],
  ['Sted', 240],
  ['Honorar', 120],
];

function textOrDash(value) {
  const raw = value === 0 || value ? String(value) : '';
  return raw || '—';
}

function formFromProject(project = {}) {
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    if (key === 'pricingSettings' || key === 'agreementDocuments' || key === 'offerDocuments') continue;
    if (project[key] === 0 || project[key]) next[key] = String(project[key]);
  }
  next.pricingModel = normalizePricingModel(project.pricingModel);
  next.pricingSettings = {
    ...emptyPricingSettings(),
    ...(project.pricingSettings && typeof project.pricingSettings === 'object' ? project.pricingSettings : {}),
  };
  next.agreementDocuments = Array.isArray(project.agreementDocuments) ? [...project.agreementDocuments] : [];
  next.offerDocuments = Array.isArray(project.offerDocuments) ? [...project.offerDocuments] : [];
  next.agreementKind = project.agreementKind || (project.frameworkAgreementId && !project.contractId ? 'avrop' : 'oppdrag');
  next.parentProjectId = project.parentProjectId || '';
  return next;
}

function colWidth(index, phone) {
  if (phone) return null;
  return { width: LIST_COLUMNS[index][1], flexGrow: 0, flexShrink: 0 };
}

function ProjectTable({ phone, colors, selectCol, children }) {
  const minWidth = TABLE_WIDTH + (selectCol ? SELECT_COL_WIDTH + 8 : 0);
  const body = (
    <View
      nativeID="project-list"
      style={[
        styles.table,
        phone && styles.tablePhone,
        !phone && { width: '100%', minWidth },
        { borderColor: colors.line, backgroundColor: colors.card },
      ]}
    >
      {children}
    </View>
  );
  if (phone) return body;
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      showsHorizontalScrollIndicator
      style={styles.tableScroll}
      contentContainerStyle={styles.tableContent}
    >
      {body}
    </ScrollView>
  );
}

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

function Field({ label, value, onChangeText, placeholder, colors, multiline }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        multiline={!!multiline}
        style={[styles.input, multiline && styles.inputMulti, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function Chip({ label, on, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
    >
      <Text style={{ color: colors.ink }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ProjectWorkScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId, requestShellTab, isAdmin } = useApp();
  const [state, setState] = useState(emptyProjectState());
  const [anbud, setAnbud] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [gapFilter, setGapFilter] = useState('');
  const [importing, setImporting] = useState(false);
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmEditDelete, setConfirmEditDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [docBusy, setDocBusy] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([loadProjectState(), loadAnbudState(familyId)]).then(([projects, anbudState]) => {
      if (!live) return;
      setState(projects);
      setAnbud(anbudState);
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (ready) saveProjectState(state).catch(() => setError('Kunne ikke lagre lokalt.'));
  }, [state, ready]);

  const customers = anbud?.customers || [];
  const contracts = anbud?.contracts || [];

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.projects.filter((item) => {
      if (item.status === 'arkivert') return false;
      const missing = projectMissingAgreement(item);
      if (gapFilter === 'missing' && !missing) return false;
      if (gapFilter === 'ok' && missing) return false;
      if (!q) return true;
      return [
        item.number, item.name, item.client, item.customerNumber, item.orgnr,
        item.place, item.street, item.placeName, item.manager, item.department,
        item.projectStatus, item.customerSegment, item.marketArea, item.parentNumber,
        item.parentName, item.projectTags, item.description,
      ].join(' ').toLowerCase().includes(q);
    });
  }, [state.projects, query, gapFilter]);

  const allVisibleChecked = visibleProjects.length > 0
    && visibleProjects.every((item) => checkedIds.has(item.id));
  const checkedVisibleCount = visibleProjects.filter((item) => checkedIds.has(item.id)).length;

  function toggleChecked(id) {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setConfirmBulkDelete(false);
  }

  function toggleCheckAllVisible() {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (allVisibleChecked) {
        for (const item of visibleProjects) next.delete(item.id);
      } else {
        for (const item of visibleProjects) next.add(item.id);
      }
      return next;
    });
    setConfirmBulkDelete(false);
  }

  async function clearAnbudProjectLinks(projectIds) {
    if (!familyId || !projectIds?.length) return;
    try {
      const loaded = await loadAnbudState(familyId);
      let changed = false;
      const idSet = new Set(projectIds);
      const nextContracts = (loaded.contracts || []).map((row) => {
        if (!idSet.has(row.projectId)) return row;
        changed = true;
        return { ...row, projectId: '' };
      });
      if (!changed) return;
      const saved = await saveAnbudState({ ...loaded, contracts: nextContracts }, familyId);
      setAnbud(saved);
    } catch {
      // Prosjektene er slettet lokalt selv om avtalekoblingen ikke ble ryddet.
    }
  }

  async function runDelete(ids, successNote) {
    if (!isAdmin || deleting) return;
    if (!ids.length) {
      setError('Marker minst ett prosjekt før sletting.');
      setConfirmBulkDelete(false);
      setConfirmEditDelete(false);
      return;
    }
    setDeleting(true);
    setError('');
    try {
      const loaded = await loadProjectState();
      const result = deleteProjects(loaded, ids);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await saveProjectState(result.state);
      setState(result.state);
      await clearAnbudProjectLinks(result.deletedIds);
      setCheckedIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });
      setConfirmBulkDelete(false);
      setConfirmEditDelete(false);
      setNote(successNote);
      if (ids.includes(selectedId)) {
        setSelectedId('');
        setView('list');
      }
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke slette prosjektene.');
    } finally {
      setDeleting(false);
    }
  }

  function confirmDeleteSelected() {
    const ids = visibleProjects.filter((item) => checkedIds.has(item.id)).map((item) => item.id);
    const noteText = ids.length === visibleProjects.length && ids.length > 1
      ? `Prosjektlisten er slettet (${ids.length}).`
      : (ids.length === 1 ? 'Prosjektet er slettet.' : `${ids.length} prosjekter er slettet.`);
    return runDelete(ids, noteText);
  }

  const selected = state.projects.find((item) => item.id === selectedId) || null;

  const customerContracts = useMemo(() => {
    if (!form.customerId) return contracts.filter((row) => row.status !== 'avsluttet');
    return contracts.filter((row) => row.status !== 'avsluttet' && row.customerId === form.customerId);
  }, [contracts, form.customerId]);

  const frameworkOptions = customerContracts.filter((row) => row.kind === 'rammeavtale');
  const agreementOptions = customerContracts.filter((row) => {
    if (form.agreementKind === 'avrop') return row.kind === 'avrop';
    if (form.agreementKind === 'rammeavtale') return row.kind === 'rammeavtale';
    return row.kind === 'oppdrag' || row.kind === 'annet' || !row.kind;
  });

  function patchForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseCustomer(customer) {
    if (!customer) {
      setForm((current) => ({
        ...current,
        customerId: '',
        client: '',
        customerNumber: '',
        orgnr: '',
        contractId: '',
        frameworkAgreementId: '',
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      customerId: customer.id,
      client: customer.name || '',
      customerNumber: customer.customerNumber || '',
      orgnr: customer.orgnr || '',
      contractId: '',
      frameworkAgreementId: '',
    }));
  }

  function chooseParentProject(project) {
    if (!project) {
      setForm((current) => ({
        ...current,
        parentProjectId: '',
        parentNumber: '',
        parentName: '',
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      parentProjectId: project.id,
      parentNumber: project.number || '',
      parentName: project.name || '',
    }));
  }

  function patchPricingSetting(key, value) {
    setForm((current) => ({
      ...current,
      pricingSettings: { ...emptyPricingSettings(), ...current.pricingSettings, [key]: value },
    }));
  }

  const customerOptions = useMemo(
    () => customers.map((row) => ({
      id: row.id,
      label: [row.customerNumber, row.name].filter(Boolean).join(' · ') || row.name || row.id,
      search: `${row.customerNumber || ''} ${row.name || ''} ${row.orgnr || ''}`,
    })),
    [customers],
  );

  const parentProjectOptions = useMemo(
    () => state.projects
      .filter((row) => row.status !== 'arkivert' && row.id !== selectedId)
      .map((row) => ({
        id: row.id,
        label: `${row.number} · ${row.name}`,
        search: `${row.number} ${row.name} ${row.client || ''}`,
      })),
    [state.projects, selectedId],
  );

  const pricingOptions = useMemo(
    () => PRICING_MODELS.map((row) => ({ id: row.id, label: row.label, search: row.label })),
    [],
  );

  const agreementSelectOptions = useMemo(
    () => agreementOptions.map((row) => ({
      id: row.id,
      label: row.title || kindLabel(row.kind) || 'Avtale',
      search: `${row.title || ''} ${row.oppdragId || ''} ${row.systemId || ''}`,
    })),
    [agreementOptions],
  );

  const frameworkSelectOptions = useMemo(
    () => frameworkOptions.map((row) => ({
      id: row.id,
      label: row.title || 'Rammeavtale',
      search: row.title || '',
    })),
    [frameworkOptions],
  );

  /** Tilbudsdokumenter som kan overføres fra koblet avtale / tilbudsarbeid. */
  const transferableOfferDocs = useMemo(() => {
    if (!anbud) return [];
    const contract = contracts.find((row) => row.id === form.contractId);
    const rows = [];
    if (contract?.documents?.length) {
      for (const doc of contract.documents) {
        rows.push({
          id: `contract-${doc.id}`,
          name: doc.name || doc.title || 'Avtaledokument',
          url: doc.url || '',
          storagePath: doc.storagePath || '',
          mimeType: doc.mimeType || '',
          size: doc.size || 0,
          source: 'avtale',
          sourceId: doc.id,
        });
      }
    }
    const bidId = contract?.bidId;
    const bid = bidId ? (anbud.bids || []).find((row) => row.id === bidId) : null;
    for (const file of bid?.files || []) {
      rows.push({
        id: `bid-${file.id}`,
        name: file.name || 'Tilbudsdokument',
        url: file.url || file.dataUrl || '',
        storagePath: file.storagePath || '',
        mimeType: file.mimeType || '',
        size: file.size || 0,
        source: 'tilbud',
        sourceId: file.id,
      });
    }
    const already = new Set((form.offerDocuments || []).map((doc) => `${doc.sourceId}|${doc.name}`));
    return rows.filter((row) => !already.has(`${row.sourceId}|${row.name}`));
  }, [anbud, contracts, form.contractId, form.offerDocuments]);

  function chooseAgreement(contract) {
    if (!contract) {
      patchForm('contractId', '');
      return;
    }
    setForm((current) => ({
      ...current,
      contractId: contract.id,
      agreementKind: contract.kind === 'avrop' ? 'avrop' : (contract.kind === 'rammeavtale' ? 'rammeavtale' : (current.agreementKind || 'oppdrag')),
      frameworkAgreementId: contract.kind === 'avrop'
        ? (contract.parentId || current.frameworkAgreementId)
        : (contract.kind === 'rammeavtale' ? contract.id : current.frameworkAgreementId),
      customerId: contract.customerId || current.customerId,
      client: current.client || contract.buyer || '',
    }));
  }

  async function syncContractLink(projectId, contractId, previousContractId) {
    if (!familyId || !contractId || contractId === previousContractId) return;
    try {
      const loaded = await loadAnbudState(familyId);
      const linked = linkProject(loaded, contractId, projectId);
      if (linked.ok) {
        const saved = await saveAnbudState(linked.state, familyId);
        setAnbud(saved);
      }
    } catch {
      // Prosjektet er lagret lokalt selv om avtalekoblingen feiler.
    }
  }

  function startNew() {
    setForm(EMPTY_FORM);
    setSelectedId('');
    setError('');
    setNote('');
    setView('create');
  }

  function openEdit(project) {
    setSelectedId(project.id);
    setForm(formFromProject(project));
    setError('');
    setNote('');
    setConfirmEditDelete(false);
    setConfirmBulkDelete(false);
    setView('edit');
  }

  async function saveForm() {
    setError('');
    const payload = {
      ...form,
      client: form.client || customers.find((row) => row.id === form.customerId)?.name || '',
      pricingModel: normalizePricingModel(form.pricingModel),
      pricingSettings: form.pricingSettings || emptyPricingSettings(),
      agreementDocuments: form.agreementDocuments || [],
      offerDocuments: form.offerDocuments || [],
      // Timer/økonomi og Moment-restfelter nullstilles i motoren.
      hoursPeriod: null,
      billableHours: null,
      toInvoice: null,
      totalCost: null,
      estimatedIncome: null,
      estimatedResult: null,
      exportStatus: null,
      billedOnPricingModels: null,
      supplierLabel: null,
      customerTags: null,
      inboxEmail: null,
      customerSegment: null,
      marketArea: null,
      projectTags: null,
      size: null,
      openedAt: null,
      createdBy: null,
    };
    if (view === 'create') {
      const result = createProject(state, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.state);
      await syncContractLink(result.state.activeProjectId, payload.contractId, '');
      setNote('Prosjektet er opprettet.');
      setView('list');
      return;
    }
    if (!selected) return;
    const previous = selected.contractId || '';
    const result = updateProject(state, selected.id, payload);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    await syncContractLink(selected.id, payload.contractId, previous);
    setNote('Prosjektet er lagret.');
    setView('list');
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: PROJECT_REGISTER_IMPORT_ACCEPT });
    if (!file) return;
    setImporting(true);
    try {
      const bytes = await bytesFromFile(file);
      const rows = await readCompanyProjectTable(bytes, file.name);
      const loadedProjects = await loadProjectState();
      const loadedAnbud = await loadAnbudState(familyId);
      const plan = planProjectImport(loadedProjects, loadedAnbud.customers || [], loadedAnbud.contracts || [], rows);
      if (!plan.rows.length) {
        setError('Fant ingen prosjekter i filen.');
        return;
      }
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setLinkQuery({});
      setNote('');
      setView('import');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese prosjektlisten.'));
    } finally {
      setImporting(false);
    }
  }

  function toggleImportRow(id) {
    setDropped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function linkImportCustomer(rowId, customer) {
    const index = Number(rowId);
    if (!Number.isFinite(index) || !customer?.id) return;
    setImportPlan((current) => linkImportPlanCustomer(current, index, customer, { applyGroup: true }));
    setLinkQuery((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    setNote(`Koblet til ${customer.name}. Samme kunde i listen er oppdatert.`);
  }

  async function confirmImport() {
    if (!importPlan || importing) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      if (row.severity === 'block' || dropped.has(id) || !row.project) {
        leftOut.push({
          name: [row.number, row.name].filter(Boolean).join(' ') || 'Uten navn',
          reason: row.severity === 'block' ? (row.reason || row.issues?.[0] || 'Kan ikke importeres.') : 'Valgt bort før lagring.',
        });
        return;
      }
      chosen.push(row);
    });
    if (!chosen.length) {
      setError('Ingen prosjekter er valgt for import.');
      return;
    }
    setImporting(true);
    setError('');
    try {
      const loaded = await loadProjectState();
      const result = importProjects(loaded, chosen.map((row) => row.project));
      if (!result.ok) {
        setError(result.error || 'Ingen prosjekter ble lagret.');
        return;
      }
      await saveProjectState(result.state);
      setState(result.state);
      for (const project of [...(result.created || []), ...(result.updated || [])]) {
        if (project.contractId) await syncContractLink(project.id, project.contractId, '');
      }
      const imported = chosen.map((row) => ({
        name: `${row.number} ${row.name}`.trim(),
        issues: row.issues || [],
      }));
      for (const row of result.skipped || []) {
        leftOut.push({ name: [row.number, row.name].filter(Boolean).join(' '), reason: row.reason });
      }
      setImportReport(importResult(imported, leftOut));
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${result.created.length} nye, ${result.updated.length} oppdatert.`);
      setView('list');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre prosjektlisten.');
    } finally {
      setImporting(false);
    }
  }

  const reviewRows = (importPlan?.rows || []).map((row, index) => ({
    id: String(index),
    severity: row.severity,
    title: [row.number, row.name].filter(Boolean).join(' · ') || 'Uten navn',
    meta: [
      row.customerId ? 'Kunde koblet' : '',
      row.customerNumber ? `Kundenr ${row.customerNumber}` : '',
      row.client,
      row.orgnr ? `Org.nr ${row.orgnr}` : '',
      row.manager,
      row.place,
    ].filter(Boolean).join(' · '),
    issues: row.issues || [],
    included: row.severity !== 'block' && !dropped.has(String(index)),
    needsCustomer: !row.customerId && row.severity !== 'block',
    customerLinked: !!row.customerId,
    customerHint: {
      customerNumber: row.customerNumber,
      client: row.client,
      orgnr: row.orgnr,
      name: row.client,
    },
  }));

  function renderImportCustomerLink(row) {
    if (row.customerLinked) {
      return <Text style={{ color: colors.brand, fontSize: 13 }}>Kunde er koblet og klar for import.</Text>;
    }
    if (!row.needsCustomer) return null;
    const query = linkQuery[row.id] ?? '';
    const suggestions = suggestCustomers(customers, {
      ...row.customerHint,
      query: query || row.customerHint?.client || row.customerHint?.customerNumber || '',
    }, 8);
    return (
      <View style={{ gap: 6 }} nativeID={`project-import-link-${row.id}`}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Velg kunde nå</Text>
        <TextInput
          value={query}
          onChangeText={(value) => setLinkQuery((current) => ({ ...current, [row.id]: value }))}
          placeholder="Søk kundenr, navn eller org.nr"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <View style={styles.rowWrap}>
          {suggestions.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              onPress={() => linkImportCustomer(row.id, customer)}
              accessibilityRole="button"
              style={[styles.chip, { borderColor: colors.brand, backgroundColor: colors.brandSoft || colors.card }]}
            >
              <Text style={{ color: colors.ink }}>
                {[customer.customerNumber, customer.name].filter(Boolean).join(' · ')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {!suggestions.length ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Ingen treff i kunderegisteret. Søk på et annet navn, eller registrer kunden under Kunder først.
          </Text>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Valget gjelder også andre prosjekter i listen med samme kunde.
          </Text>
        )}
      </View>
    );
  }

  function agreementLabel(project) {
    const contract = contracts.find((row) => row.id === project.contractId);
    const framework = contracts.find((row) => row.id === project.frameworkAgreementId);
    if (contract && framework && contract.id !== framework.id) {
      return `${kindLabel(contract.kind) || 'Avtale'}: ${contract.title} · Ramme: ${framework.title}`;
    }
    if (contract) return `${kindLabel(contract.kind) || 'Avtale'}: ${contract.title}`;
    if (framework) return `Rammeavtale: ${framework.title}`;
    return 'Ingen avtale registrert';
  }

  function agreementCell(project) {
    const contract = contracts.find((row) => row.id === project.contractId);
    const framework = contracts.find((row) => row.id === project.frameworkAgreementId);
    if (contract) return contract.title || kindLabel(contract.kind) || 'Avtale';
    if (framework) return framework.title || 'Rammeavtale';
    return 'Mangler';
  }

  async function uploadAgreementDocs() {
    setError('');
    setDocBusy('upload');
    try {
      const picked = await pickDocument({ accept: DOC_ACCEPT, multiple: true });
      const list = (Array.isArray(picked) ? picked : [picked]).filter(Boolean);
      if (!list.length) return;
      if (!familyId) {
        setError('Mangler bedrift for fillagring.');
        return;
      }
      const uploaded = [];
      for (let index = 0; index < list.length; index += 1) {
        uploaded.push(await uploadAgreementFile(familyId, list[index], { salt: `prj-${Date.now()}-${index}` }));
      }
      const rows = uploaded.map((file) => ({
        id: `pdoc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        title: file.name,
        url: file.url,
        storagePath: file.storagePath,
        mimeType: file.mimeType,
        size: file.size,
        source: 'upload',
        uploadedAt: new Date().toISOString(),
      }));
      if (view === 'edit' && selectedId) {
        const result = addProjectAgreementDocuments(state, selectedId, rows);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setState(result.state);
        setForm((current) => ({
          ...current,
          agreementDocuments: result.state.projects.find((row) => row.id === selectedId)?.agreementDocuments || [],
        }));
      } else {
        setForm((current) => ({
          ...current,
          agreementDocuments: [...(current.agreementDocuments || []), ...rows],
        }));
      }
      setNote(`${rows.length} avtaledokument${rows.length === 1 ? '' : 'er'} lastet opp.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke laste opp dokumentene.');
    } finally {
      setDocBusy('');
    }
  }

  function transferOfferDocs() {
    if (!transferableOfferDocs.length) {
      setError('Ingen tilbudsdokumenter å overføre ennå. Koble en avtale som stammer fra tilbudsmodulen.');
      return;
    }
    setError('');
    if (view === 'edit' && selectedId) {
      const result = attachOfferDocuments(state, selectedId, transferableOfferDocs);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.state);
      setForm((current) => ({
        ...current,
        offerDocuments: result.state.projects.find((row) => row.id === selectedId)?.offerDocuments || [],
      }));
    } else {
      setForm((current) => ({
        ...current,
        offerDocuments: [...(current.offerDocuments || []), ...transferableOfferDocs],
      }));
    }
    setNote('Tilbudsdokumenter er overført til prosjektet.');
  }

  function removeDoc(docId, kind) {
    if (view === 'edit' && selectedId) {
      const result = removeProjectDocument(state, selectedId, docId, kind);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.state);
      const project = result.state.projects.find((row) => row.id === selectedId);
      setForm((current) => ({
        ...current,
        agreementDocuments: project?.agreementDocuments || [],
        offerDocuments: project?.offerDocuments || [],
      }));
      return;
    }
    setForm((current) => ({
      ...current,
      agreementDocuments: kind === 'agreement'
        ? (current.agreementDocuments || []).filter((doc) => doc.id !== docId)
        : current.agreementDocuments,
      offerDocuments: kind === 'offer'
        ? (current.offerDocuments || []).filter((doc) => doc.id !== docId)
        : current.offerDocuments,
    }));
  }

  const pricing = form.pricingSettings || emptyPricingSettings();

  const formBody = (
    <View style={styles.stack}>
      <Text style={[styles.section, { color: colors.ink }]}>Prosjekt</Text>
      <Field label="Prosjektnummer" value={form.number} onChangeText={(v) => patchForm('number', v)} colors={colors} />
      <Field label="Navn" value={form.name} onChangeText={(v) => patchForm('name', v)} colors={colors} />
      <Field label="Prosjektstatus" value={form.projectStatus} onChangeText={(v) => patchForm('projectStatus', v)} colors={colors} />
      <Field label="Statuskommentar" value={form.statusComment} onChangeText={(v) => patchForm('statusComment', v)} colors={colors} />
      <Field label="Avdeling" value={form.department} onChangeText={(v) => patchForm('department', v)} colors={colors} />
      <Field label="Prosjektleder / eier" value={form.manager} onChangeText={(v) => patchForm('manager', v)} colors={colors} />
      <Field label="Start" value={form.start} onChangeText={(v) => patchForm('start', v)} colors={colors} />
      <Field label="Slutt" value={form.end} onChangeText={(v) => patchForm('end', v)} colors={colors} />
      <SearchSelect
        colors={colors}
        label="Hovedprosjekt"
        value={form.parentProjectId}
        options={parentProjectOptions}
        placeholder="Ikke underprosjekt"
        noneLabel="Ikke underprosjekt"
        onChange={(id) => chooseParentProject(state.projects.find((row) => row.id === id) || null)}
        helper="Velg hovedprosjektet hvis dette er et underprosjekt."
      />
      <Field label="Beskrivelse" value={form.description} onChangeText={(v) => patchForm('description', v)} colors={colors} multiline />

      <Text style={[styles.section, { color: colors.ink }]}>Kunde og sted</Text>
      <SearchSelect
        colors={colors}
        label="Kunde"
        value={form.customerId}
        options={customerOptions}
        placeholder="Velg kunde"
        noneLabel="Ingen kunde"
        onChange={(id) => chooseCustomer(customers.find((row) => row.id === id) || null)}
      />
      {!customers.length ? (
        <TouchableOpacity onPress={() => requestShellTab('kunder')} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Ingen kunder ennå. Gå til Kunder for å registrere.</Text>
        </TouchableOpacity>
      ) : null}
      {form.customerId ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {[form.customerNumber && `Kundenr ${form.customerNumber}`, form.client, form.orgnr && `Org.nr ${form.orgnr}`]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
      {form.client && !form.customerId ? (
        <Text style={{ color: colors.danger || '#b42318' }}>Kundenavn er satt, men ikke koblet til kunderegisteret.</Text>
      ) : null}
      <Field label="Gate" value={form.street} onChangeText={(v) => patchForm('street', v)} colors={colors} />
      <Field label="Postnr" value={form.postalCode} onChangeText={(v) => patchForm('postalCode', v)} colors={colors} />
      <Field label="Poststed" value={form.placeName} onChangeText={(v) => patchForm('placeName', v)} colors={colors} />
      <Field label="Matrikkel-ID" value={form.cadastralId} onChangeText={(v) => patchForm('cadastralId', v)} colors={colors} />

      <Text style={[styles.section, { color: colors.ink }]}>Prismodell</Text>
      <SearchSelect
        colors={colors}
        label="Prismodell"
        value={form.pricingModel}
        options={pricingOptions}
        placeholder="Velg prismodell"
        noneLabel="Ikke valgt"
        allowNone
        onChange={(id) => patchForm('pricingModel', id)}
      />
      {form.pricingModel === 'hourly' ? (
        <Field
          label="Timepris (kr)"
          value={pricing.hourlyRate == null ? '' : String(pricing.hourlyRate)}
          onChangeText={(v) => patchPricingSetting('hourlyRate', v)}
          colors={colors}
        />
      ) : null}
      {form.pricingModel === 'fixed' ? (
        <Field
          label="Fastpris / honorar (kr)"
          value={pricing.fixedFee == null ? '' : String(pricing.fixedFee)}
          onChangeText={(v) => patchPricingSetting('fixedFee', v)}
          colors={colors}
        />
      ) : null}
      {form.pricingModel === 'retainer' ? (
        <Field
          label="Retainer (kr)"
          value={pricing.retainerFee == null ? '' : String(pricing.retainerFee)}
          onChangeText={(v) => patchPricingSetting('retainerFee', v)}
          colors={colors}
        />
      ) : null}
      {form.pricingModel === 'unit' ? (
        <>
          <Field
            label="Enhetspris (kr)"
            value={pricing.unitPrice == null ? '' : String(pricing.unitPrice)}
            onChangeText={(v) => patchPricingSetting('unitPrice', v)}
            colors={colors}
          />
          <Field
            label="Enhet"
            value={pricing.unitLabel || ''}
            onChangeText={(v) => patchPricingSetting('unitLabel', v)}
            placeholder="f.eks. m², time, stk"
            colors={colors}
          />
        </>
      ) : null}
      {form.pricingModel && form.pricingModel !== 'not_billable' ? (
        <Field
          label="Merknad til prismodell"
          value={pricing.note || ''}
          onChangeText={(v) => patchPricingSetting('note', v)}
          colors={colors}
          multiline
        />
      ) : null}
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Timer, fakturert beløp og resultat hentes automatisk fra andre moduler og redigeres ikke her.
      </Text>

      <Text style={[styles.section, { color: colors.ink }]}>Avtale og dokumenter</Text>
      <Text style={[styles.label, { color: colors.muted }]}>Avtaletype</Text>
      <View style={styles.rowWrap}>
        {[
          ['oppdrag', 'Oppdragsavtale'],
          ['avrop', 'Avrop på rammeavtale'],
        ].map(([id, label]) => (
          <Chip
            key={id}
            label={label}
            on={form.agreementKind === id}
            onPress={() => setForm((current) => ({
              ...current,
              agreementKind: id,
              contractId: '',
              frameworkAgreementId: id === 'avrop' ? current.frameworkAgreementId : '',
            }))}
            colors={colors}
          />
        ))}
      </View>

      {form.agreementKind === 'avrop' ? (
        <SearchSelect
          colors={colors}
          label="Rammeavtale"
          value={form.frameworkAgreementId}
          options={frameworkSelectOptions}
          placeholder="Velg rammeavtale"
          noneLabel="Ingen rammeavtale"
          onChange={(id) => patchForm('frameworkAgreementId', id)}
          helper={!frameworkOptions.length ? 'Ingen rammeavtale på kunden. Opprett den under Kontrakt / avtale.' : undefined}
        />
      ) : null}

      <SearchSelect
        colors={colors}
        label={form.agreementKind === 'avrop' ? 'Avrop / oppdragsavtale' : 'Oppdragsavtale'}
        value={form.contractId}
        options={agreementSelectOptions}
        placeholder="Ingen avtale"
        noneLabel="Ingen avtale"
        onChange={(id) => chooseAgreement(contracts.find((row) => row.id === id) || null)}
      />
      {!form.contractId ? (
        <View style={styles.warnRow}>
          <Ionicons name="warning" size={18} color={colors.danger || '#b42318'} />
          <Text style={{ color: colors.danger || '#b42318', flex: 1 }}>
            Avtale er ikke registrert. Prosjektet kan lagres, men mangelen markeres i listen.
          </Text>
        </View>
      ) : null}

      <Text style={[styles.label, { color: colors.muted }]}>
        Avtaledokumenter ({(form.agreementDocuments || []).length})
      </Text>
      {(form.agreementDocuments || []).map((doc) => (
        <View key={doc.id} style={styles.docRow}>
          <Text style={{ color: colors.ink, flex: 1 }} numberOfLines={2}>{doc.name || doc.title}</Text>
          <TouchableOpacity onPress={() => removeDoc(doc.id, 'agreement')} accessibilityRole="button">
            <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        onPress={uploadAgreementDocs}
        disabled={!!docBusy}
        accessibilityRole="button"
        style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line, opacity: docBusy ? 0.6 : 1 }]}
      >
        <Text style={{ color: colors.ink }}>{docBusy === 'upload' ? 'Laster opp…' : 'Last opp avtaledokument'}</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { color: colors.muted }]}>
        Tilbudsdokumenter ({(form.offerDocuments || []).length})
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Overfør dokumenter fra tilbudsmodulen slik at de følger prosjektet som en rød tråd.
      </Text>
      {(form.offerDocuments || []).map((doc) => (
        <View key={doc.id} style={styles.docRow}>
          <Text style={{ color: colors.ink, flex: 1 }} numberOfLines={2}>
            {doc.name || doc.title}
            {doc.source === 'tilbud' ? ' · fra tilbud' : ''}
          </Text>
          <TouchableOpacity onPress={() => removeDoc(doc.id, 'offer')} accessibilityRole="button">
            <Text style={{ color: colors.danger || '#b42318' }}>Fjern</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        onPress={transferOfferDocs}
        accessibilityRole="button"
        style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}
      >
        <Text style={{ color: colors.ink }}>
          {transferableOfferDocs.length
            ? `Overfør ${transferableOfferDocs.length} dokument${transferableOfferDocs.length === 1 ? '' : 'er'} fra tilbud`
            : 'Ingen tilbudsdokumenter å overføre'}
        </Text>
      </TouchableOpacity>

      <View style={styles.rowWrap}>
        <TouchableOpacity onPress={saveForm} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>{view === 'create' ? 'Opprett prosjekt' : 'Lagre'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setView('list')} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}>
          <Text style={{ color: colors.ink }}>Avbryt</Text>
        </TouchableOpacity>
        {view === 'edit' && selected && isAdmin ? (
          <>
            <TouchableOpacity
              onPress={() => {
                const result = archiveProject(state, selected.id);
                if (result.ok) {
                  setState(result.state);
                  setView('list');
                  setNote('Prosjektet er arkivert.');
                } else setError(result.error);
              }}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}
            >
              <Text style={{ color: colors.ink }}>Arkiver</Text>
            </TouchableOpacity>
            {confirmEditDelete ? (
              <>
                <TouchableOpacity
                  onPress={() => runDelete([selected.id], 'Prosjektet er slettet.')}
                  disabled={deleting}
                  accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: colors.danger || '#b42318', opacity: deleting ? 0.6 : 1 }]}
                >
                  <Text style={{ color: '#fff' }}>{deleting ? 'Sletter…' : 'Bekreft slett'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmEditDelete(false)} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink }}>Avbryt slett</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => setConfirmEditDelete(true)}
                accessibilityRole="button"
                style={[styles.btn, { backgroundColor: colors.danger || '#b42318' }]}
              >
                <Text style={{ color: '#fff' }}>Slett prosjekt</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}
      </View>
    </View>
  );

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.bg }, isPhone && styles.screenPhone]}
      contentContainerStyle={[styles.inner, isPhone && styles.innerPhone]}
      keyboardShouldPersistTaps="handled"
    >
      {view !== 'list' ? (
        <Text style={[styles.title, { color: colors.ink }]}>
          {view === 'import' ? 'Kontroller import' : view === 'create' ? 'Nytt prosjekt' : (selected?.name || 'Prosjekt')}
        </Text>
      ) : (
        <CreateMenu
          label="Nytt prosjekt"
          title="Nytt prosjekt"
          info={[
            'Prosjektlisten knyttes til kunder og avtaler. Avrop knyttes til rammeavtalen.',
            'Excel eller CSV med prosjektnr, prosjektnavn, kundenr og kundenavn.',
          ]}
          actions={[
            { id: 'new', label: 'Opprett prosjekt', primary: true, onPress: startNew },
            { id: 'import', label: importing ? 'Tolker filen…' : 'Importer liste', onPress: importFile, disabled: importing },
          ]}
        />
      )}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {view === 'list' && importReport ? <ImportResult colors={colors} result={importReport} /> : null}

      {view === 'import' && importPlan ? (
        <ImportReview
          nativeID="projects-import-plan"
          colors={colors}
          lead="Ingenting er lagret ennå. Koble manglende kunder her før du bekrefter. Avtaler kan knyttes etterpå."
          rows={reviewRows}
          busy={importing}
          confirmLabel={(count) => `Importer ${count} prosjekter`}
          onToggle={toggleImportRow}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); setLinkQuery({}); setView('list'); }}
          renderRowExtra={renderImportCustomerLink}
        />
      ) : null}

      {(view === 'create' || view === 'edit') ? formBody : null}

      {view === 'list' ? (
        <View style={styles.stack}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk i nummer, navn, kunde, sted"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <FilterMenu
            groups={[{
              id: 'agreement',
              label: 'Avtale',
              value: gapFilter,
              onChange: setGapFilter,
              options: [
                { id: '', label: 'Alle' },
                { id: 'missing', label: 'Mangler avtale' },
                { id: 'ok', label: 'Med avtale' },
              ],
            }]}
          />

          {isAdmin && visibleProjects.length ? (
            <View style={styles.rowWrap}>
              <TouchableOpacity
                onPress={toggleCheckAllVisible}
                accessibilityRole="button"
                style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}
              >
                <Text style={{ color: colors.ink }}>
                  {allVisibleChecked ? 'Fjern merking' : 'Merk alle i listen'}
                </Text>
              </TouchableOpacity>
              {confirmBulkDelete ? (
                <>
                  <TouchableOpacity
                    onPress={confirmDeleteSelected}
                    disabled={deleting || !checkedVisibleCount}
                    accessibilityRole="button"
                    style={[styles.btn, { backgroundColor: colors.danger || '#b42318', opacity: deleting || !checkedVisibleCount ? 0.6 : 1 }]}
                  >
                    <Text style={{ color: '#fff' }}>
                      {deleting
                        ? 'Sletter…'
                        : (checkedVisibleCount === visibleProjects.length
                          ? `Bekreft slett listen (${checkedVisibleCount})`
                          : `Bekreft slett (${checkedVisibleCount})`)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setConfirmBulkDelete(false)}
                    accessibilityRole="button"
                    style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>Avbryt</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (!checkedVisibleCount) {
                      setError('Marker minst ett prosjekt før sletting.');
                      return;
                    }
                    setError('');
                    setConfirmBulkDelete(true);
                  }}
                  accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: colors.danger || '#b42318', opacity: checkedVisibleCount ? 1 : 0.6 }]}
                >
                  <Text style={{ color: '#fff' }}>
                    {checkedVisibleCount ? `Slett valgte (${checkedVisibleCount})` : 'Slett valgte'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
          {isAdmin && confirmBulkDelete ? (
            <Text style={{ color: colors.danger || '#b42318' }}>
              Sletting kan ikke angres. Tilhørende poster på prosjektet fjernes også.
            </Text>
          ) : null}
          {!isAdmin && visibleProjects.length ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Bare administratorer kan slette prosjekter.
            </Text>
          ) : null}

          {!visibleProjects.length ? (
            <Text style={{ color: colors.muted }}>Ingen prosjekter ennå.</Text>
          ) : null}

          {visibleProjects.length ? (
            <>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {visibleProjects.length} prosjekter
                {isAdmin && checkedVisibleCount ? ` · ${checkedVisibleCount} merket` : ''}
              </Text>
              <ProjectTable phone={isPhone} colors={colors} selectCol={isAdmin}>
                {!isPhone ? (
                  <View style={[styles.tableRow, styles.tableHead, { borderColor: colors.line }]}>
                    {isAdmin ? (
                      <TouchableOpacity
                        onPress={toggleCheckAllVisible}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: allVisibleChecked }}
                        style={[styles.selectCell, { width: SELECT_COL_WIDTH }]}
                      >
                        <Ionicons
                          name={allVisibleChecked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={allVisibleChecked ? colors.brand : colors.muted}
                        />
                      </TouchableOpacity>
                    ) : null}
                    {LIST_COLUMNS.map(([label, width]) => (
                      <Text key={label} style={[styles.cell, { width }, styles.headCell, { color: colors.muted }]}>{label}</Text>
                    ))}
                  </View>
                ) : null}
                {visibleProjects.map((item) => {
                  const missing = projectMissingAgreement(item);
                  const customer = customers.find((row) => row.id === item.customerId);
                  const customerName = customer?.name || item.client || '—';
                  const customerNumber = item.customerNumber || customer?.customerNumber || '—';
                  const orgnr = item.orgnr || customer?.orgnr || '—';
                  const danger = colors.danger || '#b42318';
                  const checked = checkedIds.has(item.id);
                  const cells = [
                    [0, item.number, `Nr ${item.number}`, true],
                    [1, item.name, item.name, false],
                    [2, item.projectStatus || '—', `Status ${item.projectStatus || '—'}`, false],
                    [3, customerNumber, `Kundenr ${customerNumber}`, false],
                    [4, customerName, `Kunde ${customerName}`, false],
                    [5, orgnr, `Org.nr ${orgnr}`, false],
                    [6, item.department || '—', `Avdeling ${item.department || '—'}`, false],
                    [7, item.manager || '—', `Leder ${item.manager || '—'}`, false],
                    [8, item.start || '—', `Start ${item.start || '—'}`, false],
                    [9, item.end || '—', `Slutt ${item.end || '—'}`, false],
                    null,
                    [11, pricingModelLabel(item.pricingModel) || '—', `Prismodell ${pricingModelLabel(item.pricingModel) || '—'}`, false],
                    [12, item.parentNumber || '—', `Hovedprosjekt ${item.parentNumber || '—'}`, false],
                    [13, item.place || '—', `Sted ${item.place || '—'}`, false],
                    [14, textOrDash(item.feeEstimate), `Honorar ${textOrDash(item.feeEstimate)}`, false],
                  ];
                  return (
                    <View
                      key={item.id}
                      style={[styles.tableRow, isPhone && styles.tableRowPhone, { borderColor: colors.line }]}
                    >
                      {isAdmin ? (
                        <TouchableOpacity
                          onPress={() => toggleChecked(item.id)}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={`Merk ${item.number}`}
                          style={[styles.selectCell, !isPhone && { width: SELECT_COL_WIDTH }]}
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={20}
                            color={checked ? colors.brand : colors.muted}
                          />
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => openEdit(item)}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.number} ${item.name}`}
                        style={[styles.rowBody, isPhone && styles.rowBodyPhone]}
                      >
                        {cells.map((cell) => {
                          if (!cell) {
                            return (
                              <View key="avtale" style={[styles.cell, colWidth(10, isPhone), styles.agreeCell]}>
                                {missing ? (
                                  <Ionicons name="warning" size={16} color={danger} accessibilityLabel="Avtale mangler" />
                                ) : (
                                  <Ionicons name="checkmark-circle" size={16} color={colors.brand} accessibilityLabel="Avtale koblet" />
                                )}
                                <Text style={{ color: missing ? danger : colors.ink, flex: 1 }} numberOfLines={2}>
                                  {isPhone ? `Avtale ${agreementCell(item)}` : agreementCell(item)}
                                </Text>
                              </View>
                            );
                          }
                          const [col, value, phoneLabel, bold] = cell;
                          if (col === 1) {
                            return (
                              <View key={col} style={[styles.cell, colWidth(1, isPhone)]}>
                                <Text style={{ color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{item.name}</Text>
                                {isPhone ? (
                                  <Text style={{ color: missing ? danger : colors.muted, fontSize: 12 }}>
                                    {agreementLabel(item)}
                                  </Text>
                                ) : null}
                              </View>
                            );
                          }
                          return (
                            <Text
                              key={col}
                              style={[styles.cell, colWidth(col, isPhone), { color: colors.ink, fontWeight: bold ? '700' : '400' }]}
                              numberOfLines={2}
                            >
                              {isPhone ? phoneLabel : value}
                            </Text>
                          );
                        })}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ProjectTable>
            </>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const TABLE_WIDTH = LIST_COLUMNS.reduce((sum, [, width]) => sum + width, 0) + 80;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerPhone: { maxWidth: '100%', minWidth: 0 },
  title: { fontSize: 22, fontWeight: '600' },
  section: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  stack: { gap: 10 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  btn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tableScroll: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? { overflowX: 'auto', overflowY: 'hidden' } : null),
  },
  tableContent: { flexGrow: 1, minWidth: '100%', alignSelf: 'stretch' },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', alignSelf: 'stretch' },
  tablePhone: { width: '100%', minWidth: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1 },
  tableRowPhone: { flexDirection: 'column', gap: 2 },
  tableHead: { borderTopWidth: 0 },
  headCell: { fontSize: 12, fontWeight: '700' },
  cell: { fontSize: 14 },
  agreeCell: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  selectCell: { paddingTop: 2, alignItems: 'center', justifyContent: 'flex-start' },
  rowBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, flex: 1, flexWrap: 'nowrap' },
  rowBodyPhone: { flexDirection: 'column', gap: 2, width: '100%' },
});
