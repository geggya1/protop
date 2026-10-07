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
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  archiveProject,
  createProject,
  emptyProjectState,
  importProjects,
  projectMissingAgreement,
  updateProject,
} from '../../src/project/engine';
import {
  PROJECT_REGISTER_IMPORT_ACCEPT,
  linkImportPlanCustomer,
  planProjectImport,
  readCompanyProjectTable,
  suggestCustomers,
} from '../../src/project/projectImport';
import { loadProjectState, saveProjectState } from '../../src/project/storage';

const EMPTY_FORM = {
  name: '',
  number: '',
  customerId: '',
  client: '',
  customerNumber: '',
  orgnr: '',
  supplierLabel: '',
  customerTags: '',
  parentNumber: '',
  parentName: '',
  department: '',
  inboxEmail: '',
  manager: '',
  projectStatus: '',
  statusComment: '',
  openedAt: '',
  createdBy: '',
  start: '',
  end: '',
  customerSegment: '',
  marketArea: '',
  projectTags: '',
  size: '',
  street: '',
  postalCode: '',
  placeName: '',
  place: '',
  cadastralId: '',
  pricingModel: '',
  feeEstimate: '',
  billedOnPricingModels: '',
  description: '',
  exportStatus: '',
  hoursPeriod: '',
  billableHours: '',
  toInvoice: '',
  totalCost: '',
  invoices: '',
  estimatedIncome: '',
  totalPlanned: '',
  futurePlanned: '',
  forecast: '',
  estimatedCosts: '',
  expenses: '',
  estimatedResult: '',
  estimatedResultPct: '',
  profitFactor: '',
  expectedProfitFactor: '',
  agreementKind: 'oppdrag',
  contractId: '',
  frameworkAgreementId: '',
};

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
  ['Segment', 180],
  ['Hovedprosjekt', 160],
  ['Sted', 240],
  ['Honorar', 120],
  ['Timer', 100],
];

function textOrDash(value) {
  const raw = value === 0 || value ? String(value) : '';
  return raw || '—';
}

function formFromProject(project = {}) {
  const next = { ...EMPTY_FORM };
  for (const key of Object.keys(EMPTY_FORM)) {
    if (project[key] === 0 || project[key]) next[key] = String(project[key]);
  }
  next.agreementKind = project.agreementKind || (project.frameworkAgreementId && !project.contractId ? 'avrop' : 'oppdrag');
  return next;
}

function colWidth(index, phone) {
  if (phone) return null;
  return { width: LIST_COLUMNS[index][1], flexGrow: 0, flexShrink: 0 };
}

function ProjectTable({ phone, colors, children }) {
  const body = (
    <View nativeID="project-list" style={[styles.table, phone && styles.tablePhone, { borderColor: colors.line, backgroundColor: colors.card }]}>
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
  const { familyId, requestShellTab } = useApp();
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
    setView('edit');
  }

  async function saveForm() {
    setError('');
    const payload = {
      ...form,
      client: form.client || customers.find((row) => row.id === form.customerId)?.name || '',
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

  const formBody = (
    <View style={styles.stack}>
      <Text style={[styles.section, { color: colors.ink }]}>Prosjekt</Text>
      <Field label="Prosjektnummer" value={form.number} onChangeText={(v) => patchForm('number', v)} colors={colors} />
      <Field label="Navn" value={form.name} onChangeText={(v) => patchForm('name', v)} colors={colors} />
      <Field label="Prosjektstatus" value={form.projectStatus} onChangeText={(v) => patchForm('projectStatus', v)} colors={colors} />
      <Field label="Statuskommentar" value={form.statusComment} onChangeText={(v) => patchForm('statusComment', v)} colors={colors} />
      <Field label="Avdeling" value={form.department} onChangeText={(v) => patchForm('department', v)} colors={colors} />
      <Field label="Prosjektleder / eier" value={form.manager} onChangeText={(v) => patchForm('manager', v)} colors={colors} />
      <Field label="Prosjekte-post" value={form.inboxEmail} onChangeText={(v) => patchForm('inboxEmail', v)} colors={colors} />
      <Field label="Start" value={form.start} onChangeText={(v) => patchForm('start', v)} colors={colors} />
      <Field label="Slutt" value={form.end} onChangeText={(v) => patchForm('end', v)} colors={colors} />
      <Field label="Hovedprosjektnr" value={form.parentNumber} onChangeText={(v) => patchForm('parentNumber', v)} colors={colors} />
      <Field label="Hovedprosjektnavn" value={form.parentName} onChangeText={(v) => patchForm('parentName', v)} colors={colors} />
      <Field label="Beskrivelse" value={form.description} onChangeText={(v) => patchForm('description', v)} colors={colors} multiline />

      <Text style={[styles.section, { color: colors.ink }]}>Kunde og sted</Text>
      <Text style={[styles.label, { color: colors.muted }]}>Kunde</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Prosjektet skal knyttes til en kunde i kunderegisteret.
      </Text>
      <View style={styles.rowWrap}>
        {customers.slice(0, 40).map((customer) => (
          <Chip
            key={customer.id}
            label={`${customer.customerNumber ? `${customer.customerNumber} · ` : ''}${customer.name}`}
            on={form.customerId === customer.id}
            onPress={() => chooseCustomer(customer)}
            colors={colors}
          />
        ))}
      </View>
      {!customers.length ? (
        <TouchableOpacity onPress={() => requestShellTab('kunder')} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Ingen kunder ennå. Gå til Kunder for å registrere.</Text>
        </TouchableOpacity>
      ) : null}
      {form.client && !form.customerId ? (
        <Text style={{ color: colors.danger || '#b42318' }}>Kundenavn er satt, men ikke koblet til kunderegisteret.</Text>
      ) : null}
      <Field label="Kundenummer" value={form.customerNumber} onChangeText={(v) => patchForm('customerNumber', v)} colors={colors} />
      <Field label="Kundenavn" value={form.client} onChangeText={(v) => patchForm('client', v)} colors={colors} />
      <Field label="Org.nr" value={form.orgnr} onChangeText={(v) => patchForm('orgnr', v)} colors={colors} />
      <Field label="Leverandør/kunde" value={form.supplierLabel} onChangeText={(v) => patchForm('supplierLabel', v)} colors={colors} />
      <Field label="Kundetagger" value={form.customerTags} onChangeText={(v) => patchForm('customerTags', v)} colors={colors} />
      <Field label="Kundesegment" value={form.customerSegment} onChangeText={(v) => patchForm('customerSegment', v)} colors={colors} />
      <Field label="Markedsområde" value={form.marketArea} onChangeText={(v) => patchForm('marketArea', v)} colors={colors} />
      <Field label="Prosjekttagger" value={form.projectTags} onChangeText={(v) => patchForm('projectTags', v)} colors={colors} />
      <Field label="Størrelse" value={form.size} onChangeText={(v) => patchForm('size', v)} colors={colors} />
      <Field label="Gate" value={form.street} onChangeText={(v) => patchForm('street', v)} colors={colors} />
      <Field label="Postnr" value={form.postalCode} onChangeText={(v) => patchForm('postalCode', v)} colors={colors} />
      <Field label="Poststed" value={form.placeName} onChangeText={(v) => patchForm('placeName', v)} colors={colors} />
      <Field label="Matrikkel-ID" value={form.cadastralId} onChangeText={(v) => patchForm('cadastralId', v)} colors={colors} />

      <Text style={[styles.section, { color: colors.ink }]}>Økonomi og prismodell</Text>
      <Field label="Prismodell" value={form.pricingModel} onChangeText={(v) => patchForm('pricingModel', v)} colors={colors} />
      <Field label="Honorarestimat" value={form.feeEstimate} onChangeText={(v) => patchForm('feeEstimate', v)} colors={colors} />
      <Field label="Fakturert på prismodeller" value={form.billedOnPricingModels} onChangeText={(v) => patchForm('billedOnPricingModels', v)} colors={colors} />
      <Field label="Timer (periode)" value={form.hoursPeriod} onChangeText={(v) => patchForm('hoursPeriod', v)} colors={colors} />
      <Field label="Fakturerbart" value={form.billableHours} onChangeText={(v) => patchForm('billableHours', v)} colors={colors} />
      <Field label="Å faktureres" value={form.toInvoice} onChangeText={(v) => patchForm('toInvoice', v)} colors={colors} />
      <Field label="Total kostnad" value={form.totalCost} onChangeText={(v) => patchForm('totalCost', v)} colors={colors} />
      <Field label="Estimert inntekt" value={form.estimatedIncome} onChangeText={(v) => patchForm('estimatedIncome', v)} colors={colors} />
      <Field label="Estimert resultat" value={form.estimatedResult} onChangeText={(v) => patchForm('estimatedResult', v)} colors={colors} />
      <Field label="Eksportstatus" value={form.exportStatus} onChangeText={(v) => patchForm('exportStatus', v)} colors={colors} />

      <Text style={[styles.section, { color: colors.ink }]}>Avtale</Text>
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
        <>
          <Text style={[styles.label, { color: colors.muted }]}>Rammeavtale</Text>
          <View style={styles.rowWrap}>
            {frameworkOptions.map((row) => (
              <Chip
                key={row.id}
                label={row.title || 'Rammeavtale'}
                on={form.frameworkAgreementId === row.id}
                onPress={() => patchForm('frameworkAgreementId', row.id)}
                colors={colors}
              />
            ))}
          </View>
          {!frameworkOptions.length ? (
            <Text style={{ color: colors.muted }}>Ingen rammeavtale på kunden. Opprett den under Kontrakt / avtale.</Text>
          ) : null}
        </>
      ) : null}

      <Text style={[styles.label, { color: colors.muted }]}>
        {form.agreementKind === 'avrop' ? 'Avrop / oppdragsavtale' : 'Oppdragsavtale'}
      </Text>
      <View style={styles.rowWrap}>
        <Chip label="Ingen avtale" on={!form.contractId} onPress={() => chooseAgreement(null)} colors={colors} />
        {agreementOptions.map((row) => (
          <Chip
            key={row.id}
            label={row.title || kindLabel(row.kind)}
            on={form.contractId === row.id}
            onPress={() => chooseAgreement(row)}
            colors={colors}
          />
        ))}
      </View>
      {!form.contractId ? (
        <View style={styles.warnRow}>
          <Ionicons name="warning" size={18} color={colors.danger || '#b42318'} />
          <Text style={{ color: colors.danger || '#b42318', flex: 1 }}>
            Avtale er ikke registrert. Prosjektet kan lagres, men mangelen markeres i listen.
          </Text>
        </View>
      ) : null}

      <View style={styles.rowWrap}>
        <TouchableOpacity onPress={saveForm} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>{view === 'create' ? 'Opprett prosjekt' : 'Lagre'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setView('list')} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}>
          <Text style={{ color: colors.ink }}>Avbryt</Text>
        </TouchableOpacity>
        {view === 'edit' && selected ? (
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
            style={[styles.btn, { backgroundColor: colors.danger || '#b42318' }]}
          >
            <Text style={{ color: '#fff' }}>Arkiver</Text>
          </TouchableOpacity>
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
      <Text style={[styles.title, { color: colors.ink }]}>
        {view === 'import' ? 'Kontroller import' : view === 'create' ? 'Nytt prosjekt' : view === 'edit' ? (selected?.name || 'Prosjekt') : 'Prosjekt'}
      </Text>
      {view === 'list' ? (
        <Text style={{ color: colors.muted }}>
          Prosjektlisten knyttes til kunder og avtaler. Avrop skal også knyttes til rammeavtale på kunden.
        </Text>
      ) : null}
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
          <View style={styles.rowWrap}>
            <TouchableOpacity onPress={startNew} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Nytt prosjekt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={importFile}
              disabled={importing}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.sunken || colors.card, borderWidth: 1, borderColor: colors.line }]}
            >
              {importing ? <ActivityIndicator color={colors.ink} /> : <Text style={{ color: colors.ink }}>Importer liste</Text>}
            </TouchableOpacity>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Excel eller CSV med prosjektnr, prosjektnavn, kundenr og kundenavn. Eksempel: Moment-oversikt.
          </Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk i nummer, navn, kunde, sted"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <View style={styles.rowWrap}>
            {[
              ['', 'Alle'],
              ['missing', 'Mangler avtale'],
              ['ok', 'Med avtale'],
            ].map(([id, label]) => (
              <Chip key={id || 'all'} label={label} on={gapFilter === id} onPress={() => setGapFilter(id)} colors={colors} />
            ))}
          </View>

          {!visibleProjects.length ? (
            <Text style={{ color: colors.muted }}>Ingen prosjekter ennå. Opprett manuelt eller importer en liste.</Text>
          ) : null}

          {visibleProjects.length ? (
            <>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {visibleProjects.length} prosjekter
              </Text>
              <ProjectTable phone={isPhone} colors={colors}>
                {!isPhone ? (
                  <View style={[styles.tableRow, styles.tableHead, { borderColor: colors.line }]}>
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
                    [11, item.customerSegment || '—', `Segment ${item.customerSegment || '—'}`, false],
                    [12, item.parentNumber || '—', `Hovedprosjekt ${item.parentNumber || '—'}`, false],
                    [13, item.place || '—', `Sted ${item.place || '—'}`, false],
                    [14, textOrDash(item.feeEstimate), `Honorar ${textOrDash(item.feeEstimate)}`, false],
                    [15, textOrDash(item.hoursPeriod), `Timer ${textOrDash(item.hoursPeriod)}`, false],
                  ];
                  return (
                    <TouchableOpacity
                      key={item.id}
                      onPress={() => openEdit(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.number} ${item.name}`}
                      style={[styles.tableRow, isPhone && styles.tableRowPhone, { borderColor: colors.line }]}
                    >
                      {cells.map((cell, index) => {
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
  tableScroll: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
    ...(Platform.OS === 'web' ? { overflowX: 'auto', overflowY: 'hidden' } : null),
  },
  tableContent: { flexGrow: 1 },
  table: { width: TABLE_WIDTH, minWidth: TABLE_WIDTH, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tablePhone: { width: '100%', minWidth: 0 },
  tableRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 10, paddingVertical: 10, borderTopWidth: 1 },
  tableRowPhone: { flexDirection: 'column', gap: 2 },
  tableHead: { borderTopWidth: 0 },
  headCell: { fontSize: 12, fontWeight: '700' },
  cell: { fontSize: 14 },
  agreeCell: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
});
