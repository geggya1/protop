import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
  planProjectImport,
  readCompanyProjectTable,
} from '../../src/project/projectImport';
import { loadProjectState, saveProjectState } from '../../src/project/storage';

const EMPTY_FORM = {
  name: '',
  number: '',
  customerId: '',
  client: '',
  customerNumber: '',
  orgnr: '',
  place: '',
  manager: '',
  agreementKind: 'oppdrag',
  contractId: '',
  frameworkAgreementId: '',
  description: '',
};

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
      return `${item.number} ${item.name} ${item.client} ${item.customerNumber} ${item.place} ${item.manager}`.toLowerCase().includes(q);
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
    setForm({
      name: project.name || '',
      number: project.number || '',
      customerId: project.customerId || '',
      client: project.client || '',
      customerNumber: project.customerNumber || '',
      orgnr: project.orgnr || '',
      place: project.place || '',
      manager: project.manager || '',
      agreementKind: project.agreementKind || (project.frameworkAgreementId && !project.contractId ? 'avrop' : 'oppdrag'),
      contractId: project.contractId || '',
      frameworkAgreementId: project.frameworkAgreementId || '',
      description: project.description || '',
    });
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
      row.customerNumber ? `Kundenr ${row.customerNumber}` : '',
      row.client,
      row.manager,
      row.place,
    ].filter(Boolean).join(' · '),
    issues: row.issues || [],
    included: row.severity !== 'block' && !dropped.has(String(index)),
  }));

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

  const formBody = (
    <View style={styles.stack}>
      <Field label="Prosjektnummer" value={form.number} onChangeText={(v) => patchForm('number', v)} colors={colors} />
      <Field label="Navn" value={form.name} onChangeText={(v) => patchForm('name', v)} colors={colors} />
      <Field label="Sted" value={form.place} onChangeText={(v) => patchForm('place', v)} colors={colors} />
      <Field label="Prosjektleder" value={form.manager} onChangeText={(v) => patchForm('manager', v)} colors={colors} />
      <Field label="Beskrivelse" value={form.description} onChangeText={(v) => patchForm('description', v)} colors={colors} multiline />

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
          lead="Ingenting er lagret ennå. Kontroller kundekobling og bekreft importen. Avtaler kan knyttes etterpå."
          rows={reviewRows}
          busy={importing}
          confirmLabel={(count) => `Importer ${count} prosjekter`}
          onToggle={toggleImportRow}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); setView('list'); }}
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

          {visibleProjects.map((item) => {
            const missing = projectMissingAgreement(item);
            const customer = customers.find((row) => row.id === item.customerId);
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => openEdit(item)}
                accessibilityRole="button"
                style={[styles.card, { borderColor: missing ? (colors.danger || '#b42318') : colors.line, backgroundColor: colors.card }]}
              >
                <View style={styles.cardTop}>
                  <Text style={[styles.cardTitle, { color: colors.ink, flex: 1 }]}>
                    {item.number} · {item.name}
                  </Text>
                  {missing ? (
                    <Ionicons
                      name="warning"
                      size={20}
                      color={colors.danger || '#b42318'}
                      accessibilityLabel="Avtale mangler"
                    />
                  ) : (
                    <Ionicons name="checkmark-circle" size={20} color={colors.brand} accessibilityLabel="Avtale koblet" />
                  )}
                </View>
                <Text style={{ color: colors.muted }}>
                  {customer?.name || item.client || 'Uten kunde'}
                  {item.customerNumber ? ` · Kundenr ${item.customerNumber}` : ''}
                </Text>
                <Text style={{ color: missing ? (colors.danger || '#b42318') : colors.muted }}>
                  {agreementLabel(item)}
                </Text>
                {item.manager || item.place ? (
                  <Text style={{ color: colors.muted }}>{[item.manager, item.place].filter(Boolean).join(' · ')}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenPhone: {},
  inner: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 860, width: '100%', alignSelf: 'flex-start' },
  innerPhone: { maxWidth: '100%' },
  title: { fontSize: 22, fontWeight: '400' },
  stack: { gap: 10 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  btn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '400' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
