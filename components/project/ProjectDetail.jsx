import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  addActivity,
  addProjectMember,
  removeProjectMember,
  updateActivity,
  updateProject,
  updateProjectMember,
  projectTimeSummary,
  projectEconomy,
  activityTimeSummary,
  setTimeEntryStatus,
  ensureMainActivity,
} from '../../src/project/engine';
import { projectCrossView } from '../../src/project/projectCrossView.js';
import { defaultWorkSettings, PROJECT_ROLES, employeeDisplayName } from '../../src/arbeid/roles.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { pricingModelLabel, PRICING_MODELS } from '../../src/project/projectFields.js';
import { formatDate, formatMoney } from '../../src/economy/invoices.js';
import { deleteTrip } from '../../src/economy/opsState';
import { addressFieldsFromPlace, projectAddressLabel } from '../../src/mileage/flow';
import { searchPlaces } from '../../src/utils/location';
import MileageWizard from '../../screens/economy/MileageWizard';
import IndexLetterTable from '../economy/IndexLetterTable';
import { lettersForProject, projectNeedsIndexAttention } from '../../src/indeksregulering/groups';
import { mergeIndexSnapshot } from '../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../src/indeksregulering/remoteSsb';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { dueByContractId, osloDate } from '../../src/indeksregulering/watch';

const TABS = [
  { id: 'hovedside', label: 'Hovedside' },
  { id: 'aktiviteter', label: 'Aktiviteter' },
  { id: 'fakturering', label: 'Faktureringsvalg' },
  { id: 'fakturaer', label: 'Fakturaer' },
  { id: 'timerapport', label: 'Timerapport' },
  { id: 'team', label: 'Team' },
];

function ProgressBar({ left, right, leftColor, rightColor, colors }) {
  const total = Math.max(Math.abs(left) + Math.abs(right), 0.01);
  const leftPct = Math.min(100, (Math.abs(left) / total) * 100);
  return (
    <View style={[styles.barTrack, { backgroundColor: colors.sunken || colors.line }]}>
      <View style={[styles.barFill, { width: `${leftPct}%`, backgroundColor: leftColor || colors.brand }]} />
      {right ? (
        <View style={[styles.barFill, { width: `${100 - leftPct}%`, backgroundColor: rightColor || '#f97316', opacity: 0.7 }]} />
      ) : null}
    </View>
  );
}

function CheckRow({ label, value, onChange, colors }) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
    >
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={20}
        color={value ? colors.brand : colors.muted}
      />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function openExternal(url) {
  const href = String(url || '').trim();
  if (!href) return;
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(href, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(href).catch(() => {});
}

function ProjectIndexNote({ project, contracts, timeEntries, colors }) {
  const [dueById, setDueById] = useState(null);
  const contractKey = (contracts || []).map((row) => row.id).join(',');
  useEffect(() => {
    let live = true;
    Promise.all([
      loadCases(),
      loadIndexCache(),
      loadRemoteIndexSnapshot().catch(() => null),
    ]).then(([cases, cache, remote]) => {
      if (!live) return;
      setDueById(dueByContractId(contracts, cases, mergeIndexSnapshot(cache?.series, remote)));
    }).catch(() => {});
    return () => { live = false; };
  }, [contractKey]);
  if (!dueById) return null;
  const attention = projectNeedsIndexAttention({
    project,
    contracts,
    timeEntries,
    dueById,
    today: osloDate(),
  });
  if (!attention) return null;
  return (
    <View accessibilityLabel={attention.reason} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Ionicons name="alert-circle" size={16} color={colors.danger || '#b45309'} />
      <Text style={{ color: colors.danger || '#b45309', fontWeight: '600' }}>Ny indeks. Regulering bør foretas.</Text>
    </View>
  );
}

function AgreementPanel({
  cross,
  colors,
  onOpenAgreement,
  onOpenCustomer,
  onOpenInvoice,
  onOpenIndex,
  customerId,
  project,
  contracts,
  timeEntries,
}) {
  const contract = cross.contract;
  const feeLabel = cross.honorarText
    || (cross.honorarAmount != null ? formatMoney(cross.honorarAmount) : '—');
  return (
    <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card, marginBottom: 12 }]}>
      <Text style={[styles.blockTitle, { color: colors.ink, marginBottom: 8 }]}>Avtale, honorar og faktura</Text>
      <TouchableOpacity
        nativeID="project-agreement-open"
        onPress={() => contract && onOpenAgreement?.(contract.id)}
        disabled={!contract}
        accessibilityRole="button"
        accessibilityLabel={contract ? `Åpne avtalen ${contract.title}` : 'Ingen avtale koblet'}
        style={[styles.agreementBtn, { borderColor: contract ? colors.brand : (colors.danger || '#b42318') }]}
      >
        <Ionicons name={contract ? 'document-text' : 'warning'} size={18} color={contract ? colors.brand : (colors.danger || '#b42318')} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Avtale</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }} numberOfLines={2}>
            {contract ? contract.title : 'Ingen avtale er koblet til prosjektet'}
          </Text>
        </View>
        {contract ? <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne</Text> : null}
      </TouchableOpacity>

      <View style={styles.kpiGrid}>
        <View nativeID="project-agreement-fee" style={styles.kpiCell}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>Honorar avtale</Text>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{feeLabel}</Text>
        </View>
        <Kpi label="Kontraktssum" value={contract ? formatMoney(cross.contractValue) : '—'} colors={colors} />
        <View nativeID="project-invoiced-amount" style={styles.kpiCell}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>Fakturert eks. mva</Text>
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>{formatMoney(cross.totals.amountExVat)}</Text>
        </View>
        <Kpi label="Utestående" value={formatMoney(cross.totals.outstanding)} colors={colors} />
      </View>

      {cross.facts.length ? (
        <View style={[styles.infoGrid, { marginTop: 8 }]}>
          {cross.facts.map((row) => (
            <Info key={row.label} label={row.label} value={row.value} colors={colors} />
          ))}
        </View>
      ) : null}

      <View style={styles.rowWrap}>
        {customerId ? (
          <TouchableOpacity onPress={() => onOpenCustomer?.(customerId)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne kunde</Text>
          </TouchableOpacity>
        ) : null}
        {contract ? (
          <TouchableOpacity onPress={() => onOpenIndex?.(contract)} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne indeksregulering</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ProjectIndexNote project={project} contracts={contracts} timeEntries={timeEntries} colors={colors} />

      <View style={{ marginTop: 16 }}>
        <IndexLetterTable
          rows={lettersForProject(project, contracts)}
          colors={colors}
          title="Indeksreguleringer på prosjektet"
          empty="Ingen indeksreguleringer er registrert på prosjektet."
        />
      </View>

      {cross.documents.length ? (
        <>
          <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 16, marginBottom: 8 }]}>Dokumenter</Text>
          {cross.documents.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              onPress={() => openExternal(doc.url)}
              disabled={!doc.url}
              accessibilityRole="button"
              style={styles.docLine}
            >
              <Ionicons name="document-outline" size={16} color={colors.muted} />
              <Text style={{ color: doc.url ? colors.brand : colors.ink, flex: 1 }} numberOfLines={2}>
                {doc.name}{doc.source === 'avtale' ? ' · avtale' : doc.source === 'tilbud' ? ' · tilbud' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {cross.milestones.length ? (
        <>
          <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 16, marginBottom: 8 }]}>Milepæler og leveranser</Text>
          {cross.milestones.map((row) => (
            <Text key={row.id || row.title} style={{ color: colors.ink, fontSize: 13, marginBottom: 4 }}>
              {row.kind}: {row.title}{row.due ? ` · ${formatDate(row.due)}` : ''}
            </Text>
          ))}
        </>
      ) : null}

      {cross.options.length ? (
        <>
          <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 16, marginBottom: 8 }]}>Opsjoner</Text>
          {cross.options.map((row) => (
            <Text key={row.id || row.title} style={{ color: colors.ink, fontSize: 13, marginBottom: 4 }}>
              {row.title}{row.exercised ? ' · utløst' : ''}
            </Text>
          ))}
        </>
      ) : null}
    </View>
  );
}

function ProjectAddressEditor({ project, colors, onSave }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [street, setStreet] = useState(project.street || '');
  const [postalCode, setPostalCode] = useState(project.postalCode || '');
  const [placeName, setPlaceName] = useState(project.placeName || '');
  useEffect(() => {
    setStreet(project.street || '');
    setPostalCode(project.postalCode || '');
    setPlaceName(project.placeName || '');
  }, [project.id, project.street, project.postalCode, project.placeName]);
  useEffect(() => {
    const q = String(query || '').trim();
    if (q.length < 3) {
      setHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      searchPlaces(q, 'nb').then((rows) => {
        if (live) setHits((rows || []).slice(0, 5));
      }).catch(() => {
        if (live) setHits([]);
      });
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query]);

  function applyHit(hit) {
    const fields = addressFieldsFromPlace(hit, hit.label);
    setStreet(fields.street);
    setPostalCode(fields.postalCode);
    setPlaceName(fields.placeName);
    setQuery('');
    setHits([]);
    onSave(fields);
  }

  const current = projectAddressLabel({ street, postalCode, placeName, place: project.place });
  return (
    <View style={{ marginTop: 16, gap: 6 }}>
      <Text style={[styles.blockTitle, { color: colors.ink }]}>Prosjektadresse</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {current || 'Ingen egen adresse. Søk og lagre, så kjøreboken bruker den som destinasjon.'}
      </Text>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk adresse, minst tre bokstaver"
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
      {query.trim().length >= 3 && !hits.length ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>Søker adresser…</Text>
      ) : null}
      {hits.map((hit) => (
        <TouchableOpacity key={hit.placeId || hit.label} onPress={() => applyHit(hit)} accessibilityRole="button">
          <Text style={{ color: colors.ink, fontSize: 13, paddingVertical: 4 }}>{hit.label}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TextInput
          value={street}
          onChangeText={setStreet}
          placeholder="Gate"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, flexGrow: 1, minWidth: 140 }]}
        />
        <TextInput
          value={postalCode}
          onChangeText={setPostalCode}
          placeholder="Postnr"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, width: 90 }]}
        />
        <TextInput
          value={placeName}
          onChangeText={setPlaceName}
          placeholder="Poststed"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, flexGrow: 1, minWidth: 120 }]}
        />
      </View>
      <TouchableOpacity
        onPress={() => onSave({
          street,
          postalCode,
          placeName,
          place: [street, [postalCode, placeName].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        })}
        accessibilityRole="button"
        accessibilityLabel="Lagre prosjektadresse"
        style={[styles.primaryBtn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre adresse</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Oppgradert prosjektvisning med faner (Moment-inspirert).
 * onChangeState(nextState) / onEditForm() for å hoppe til klassisk redigering.
 */
export default function ProjectDetail({
  state,
  project,
  employees = [],
  contracts = [],
  customers = [],
  invoices = [],
  colors,
  isAdmin,
  uid,
  onChangeState,
  onEditForm,
  onBack,
  onOpenAgreement,
  onOpenCustomer,
  onOpenInvoice,
  onOpenIndex,
}) {
  const [tab, setTab] = useState('hovedside');
  const [memberOpen, setMemberOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [memberRole, setMemberRole] = useState('Prosjektmedlem');
  const [pickEmployeeId, setPickEmployeeId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [editingTrip, setEditingTrip] = useState(null);
  const [pendingDelete, setPendingDelete] = useState('');

  const members = useMemo(
    () => state.members.filter((row) => row.projectId === project.id && row.active !== false),
    [state.members, project.id],
  );
  const activities = useMemo(
    () => state.activities.filter((row) => row.projectId === project.id),
    [state.activities, project.id],
  );
  const timeEntries = useMemo(
    () => state.timeEntries
      .filter((row) => row.projectId === project.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [state.timeEntries, project.id],
  );
  const summary = useMemo(() => projectTimeSummary(state, project.id), [state, project.id]);
  const customer = useMemo(
    () => customers.find((row) => row.id === project.customerId) || null,
    [customers, project.customerId],
  );
  const cross = useMemo(() => projectCrossView({
    project,
    contracts,
    customer,
    invoices,
    economy: projectEconomy(state, project.id),
    time: summary,
  }), [project, contracts, customer, invoices, state, summary]);
  const settings = defaultWorkSettings(project.workSettings);
  const projectTrips = useMemo(
    () => (state.mileageTrips || [])
      .filter((row) => row.projectId === project.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date))),
    [state.mileageTrips, project.id],
  );

  function saveAddress(patch) {
    const result = updateProject(state, project.id, patch);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setError('');
    setNote('Prosjektadressen er lagret.');
    showSaveToast('Lagret.');
  }

  function removeTrip(id) {
    if (pendingDelete !== id) {
      setPendingDelete(id);
      return;
    }
    const result = deleteTrip(state, id);
    setPendingDelete('');
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    if (editingTrip?.id === id) setEditingTrip(null);
    setError('');
    setNote('Turen er slettet.');
    showSaveToast('Turen er slettet.');
  }

  const availableEmployees = employees.filter((row) => (
    row.company?.status !== 'former'
    && !members.some((mem) => mem.employeeId === row.id)
  ));

  function patchSettings(key, value) {
    const result = updateProject(state, project.id, {
      workSettings: { ...settings, [key]: value },
    });
    if (result.ok) {
      onChangeState(result.state);
      setNote('Innstilling lagret.');
      showSaveToast('Innstilling lagret.');
    } else setError(result.error);
  }

  function addMember() {
    const emp = employees.find((row) => row.id === pickEmployeeId);
    if (!emp) {
      setError('Velg medarbeider.');
      return;
    }
    const result = addProjectMember(state, {
      projectId: project.id,
      employeeId: emp.id,
      employeeName: employeeDisplayName(emp),
      photoUrl: emp.person?.photoUrl,
      role: memberRole,
      addedByUid: uid,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setMemberOpen(false);
    setPickEmployeeId('');
    setNote(`${employeeDisplayName(emp)} lagt til som ${memberRole}.`);
    showSaveToast(`${employeeDisplayName(emp)} lagt til som ${memberRole}.`);
  }

  function dropMember(memberId) {
    const result = removeProjectMember(state, memberId);
    if (result.ok) {
      onChangeState(result.state);
      setNote('Deltaker fjernet.');
      showSaveToast('Deltaker fjernet.');
    } else setError(result.error);
  }

  function changeRole(memberId, role) {
    const result = updateProjectMember(state, memberId, { role });
    if (result.ok) {
      onChangeState(result.state);
      showSaveToast('Rollen er oppdatert.');
    }
  }

  function createActivity() {
    const name = activityName.trim() || 'Ny aktivitet';
    let working = state;
    const ensured = ensureMainActivity(working, project.id);
    if (ensured.ok) working = ensured.state;
    const result = addActivity(working, {
      projectId: project.id,
      name,
      billable: project.pricingModel !== 'not_billable',
      priceModelName: pricingModelLabel(project.pricingModel),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setActivityOpen(false);
    setActivityName('');
    setNote('Aktivitet opprettet.');
    showSaveToast('Aktivitet opprettet.');
  }

  function approveEntry(entryId) {
    const result = setTimeEntryStatus(state, entryId, 'godkjent');
    if (result.ok) {
      onChangeState(result.state);
      showSaveToast('Timen er godkjent.');
    }
  }

  const membersByRole = useMemo(() => {
    const groups = {};
    for (const role of PROJECT_ROLES) groups[role] = [];
    for (const row of members) {
      const role = PROJECT_ROLES.includes(row.role) ? row.role : 'Annet';
      if (!groups[role]) groups[role] = [];
      groups[role].push(row);
    }
    return groups;
  }, [members]);

  return (
    <View style={styles.wrap} nativeID="project-detail">
      <View style={styles.headRow}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityRole="button">
          <Ionicons name="arrow-back" size={18} color={colors.ink} />
          <Text style={{ color: colors.ink }}>Tilbake til listen</Text>
        </TouchableOpacity>
        {onEditForm ? (
          <TouchableOpacity
            onPress={onEditForm}
            style={[styles.editBtn, { borderColor: colors.line }]}
          >
            <Ionicons name="create-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink }}>Rediger</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[styles.crumb, { color: colors.muted }]}>Prosjekter / Oversikt</Text>
      <Text style={[styles.title, { color: colors.ink }]}>
        #{project.number} {project.name}
        {project.client ? ` (${project.client})` : ''}
      </Text>

      <View style={[styles.tabs, { borderBottomColor: colors.line }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsInner}>
          {TABS.map((row) => {
            const on = tab === row.id;
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => setTab(row.id)}
                style={[styles.tab, on && { borderBottomColor: colors.brand }]}
              >
                <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: on ? '600' : '400', fontSize: 13 }}>
                  {row.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {note ? <Text style={{ color: colors.brand, marginBottom: 6 }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 6 }}>{error}</Text> : null}

      <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.bodyContent}>
        {tab === 'hovedside' ? (
          <AgreementPanel
            cross={cross}
            colors={colors}
            customerId={customer?.id || project.customerId}
            project={project}
            contracts={contracts}
            timeEntries={state.timeEntries || []}
            onOpenAgreement={onOpenAgreement}
            onOpenCustomer={onOpenCustomer}
            onOpenInvoice={onOpenInvoice}
            onOpenIndex={onOpenIndex}
          />
        ) : null}
        {tab === 'hovedside' ? (
          <View style={styles.columns}>
            <View style={[styles.mainCol, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <View style={styles.blockHead}>
                <Text style={[styles.blockTitle, { color: colors.ink }]}>Prosjektinformasjon</Text>
              </View>
              <View style={styles.infoGrid}>
                <Info label="Prosjektnummer" value={project.number} colors={colors} />
                <Info label="Kunde" value={project.client || '—'} colors={colors} />
                <Info label="Valuta" value="NOK" colors={colors} />
                <Info label="Oppstartsdato" value={formatDate(project.start)} colors={colors} />
                <Info label="Sluttdato" value={formatDate(project.end)} colors={colors} />
                <Info label="Status" value={project.projectStatus || project.phase || 'Under arbeid'} colors={colors} />
                <Info label="Prosjektleder" value={project.manager || '—'} colors={colors} wide />
              </View>
              {project.description ? (
                <Text style={{ color: colors.muted, marginTop: 12, lineHeight: 20 }}>{project.description}</Text>
              ) : null}
              <ProjectAddressEditor project={project} colors={colors} onSave={saveAddress} />
              <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 20 }]}>Kjøreturer</Text>
              {!projectTrips.length ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen kjøreturer er registrert på prosjektet.</Text>
              ) : projectTrips.map((row) => (
                <View key={row.id} style={[styles.tableRow, { borderBottomColor: colors.line }]}>
                  <TouchableOpacity onPress={() => setEditingTrip(row)} style={{ flex: 1 }} accessibilityRole="button">
                    <Text style={{ color: colors.ink, fontSize: 13 }}>
                      {row.date} · {row.from} → {row.to} · {row.km} km
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {row.employeeName || 'Ansatt'} · {row.vehicleName || 'Kjøretøy'} · {formatMoney(row.amount)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingTrip(row)} accessibilityRole="button" accessibilityLabel="Rediger tur">
                    <Text style={{ color: colors.brand, fontWeight: '600' }}>Rediger</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeTrip(row.id)} accessibilityRole="button" accessibilityLabel="Slett tur">
                    <Text style={{ color: colors.danger || '#b42318', fontWeight: '600' }}>
                      {pendingDelete === row.id ? 'Bekreft' : 'Slett'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 20 }]}>Innstillinger for timeføring</Text>
              <View style={styles.settingsGrid}>
                <CheckRow
                  label="Vis prosjekt i alles timelister"
                  value={settings.showInAllTimesheets}
                  onChange={(v) => patchSettings('showInAllTimesheets', v)}
                  colors={colors}
                />
                <CheckRow
                  label="Ansatte kan legge seg selv inn på prosjektet"
                  value={settings.allowSelfJoin}
                  onChange={(v) => patchSettings('allowSelfJoin', v)}
                  colors={colors}
                />
                <CheckRow
                  label="Beskrivelse på timeføring er påkrevd"
                  value={settings.requireDescription}
                  onChange={(v) => patchSettings('requireDescription', v)}
                  colors={colors}
                />
                <CheckRow
                  label="Vis estimerte og planlagte timer i timelisten"
                  value={settings.showEstimatedHours}
                  onChange={(v) => patchSettings('showEstimatedHours', v)}
                  colors={colors}
                />
                <CheckRow
                  label="Varsle prosjektleder på e-post ved overskridelse"
                  value={settings.notifyOnOverrun}
                  onChange={(v) => patchSettings('notifyOnOverrun', v)}
                  colors={colors}
                />
              </View>
            </View>

            <View style={styles.sideCol}>
              <View style={[styles.sideCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <View style={styles.blockHead}>
                  <Text style={[styles.blockTitle, { color: colors.ink }]}>Team</Text>
                  {isAdmin ? (
                    <TouchableOpacity onPress={() => setMemberOpen(true)}>
                      <Text style={{ color: colors.brand, fontSize: 13 }}>+ Legg til</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {PROJECT_ROLES.map((role) => {
                  const rows = membersByRole[role] || [];
                  if (!rows.length) return null;
                  return (
                    <View key={role} style={{ marginBottom: 12 }}>
                      <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>{role}</Text>
                      {rows.map((row) => (
                        <View key={row.id} style={styles.memberRow}>
                          {row.photoUrl ? (
                            <Image source={{ uri: row.photoUrl }} style={styles.avatar} />
                          ) : (
                            <View style={[styles.avatar, { backgroundColor: `${colors.brand}22` }]}>
                              <Ionicons name="person" size={14} color={colors.brand} />
                            </View>
                          )}
                          <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }} numberOfLines={1}>
                            {row.employeeName}
                          </Text>
                        </View>
                      ))}
                    </View>
                  );
                })}
                {!members.length ? (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen deltakere ennå.</Text>
                ) : null}
              </View>

              <View style={[styles.sideCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Text style={[styles.blockTitle, { color: colors.ink, marginBottom: 8 }]}>Nøkkeltall</Text>
                <View style={styles.kpiGrid}>
                  <Kpi label="Timer jobbet" value={formatHours(summary.hours)} colors={colors} />
                  <Kpi label="Fakturerbare" value={formatHours(summary.billable)} colors={colors} />
                  <Kpi label="Ikke-fakturerbart" value={formatHours(summary.nonBillable)} colors={colors} />
                  <Kpi label="Føringer" value={String(summary.count)} colors={colors} />
                </View>
              </View>
            </View>
          </View>
        ) : null}

        {tab === 'fakturaer' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text nativeID="project-invoice-list" style={[styles.blockTitle, { color: colors.ink, marginBottom: 8 }]}>
              Fakturaer ({cross.invoices.length})
            </Text>
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>
              Fakturert eks. mva {formatMoney(cross.totals.amountExVat)} · utestående {formatMoney(cross.totals.outstanding)}
            </Text>
            {cross.invoices.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => onOpenInvoice?.(row.id)}
                accessibilityRole="button"
                style={[styles.invoiceRow, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600', width: 88 }}>{row.invoiceNumber}</Text>
                <Text style={{ color: colors.muted, width: 88 }}>{formatDate(row.invoiceDate)}</Text>
                <Text style={{ color: colors.ink, flex: 1 }} numberOfLines={1}>{row.customerName || row.status}</Text>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{formatMoney(row.amountExVat)}</Text>
              </TouchableOpacity>
            ))}
            {!cross.invoices.length ? (
              <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen fakturaer er koblet til prosjektet.</Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'aktiviteter' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.blockHead}>
              <Text style={[styles.blockTitle, { color: colors.ink }]}>Aktiviteter</Text>
              <TouchableOpacity
                onPress={() => setActivityOpen(true)}
                style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>+ Legg til aktivitet</Text>
              </TouchableOpacity>
            </View>
            {!activities.length ? (
              <Text style={{ color: colors.muted }}>Ingen aktiviteter. Opprett «Hovedaktivitet» eller en ny.</Text>
            ) : null}
            {activities.map((row) => {
              const stats = activityTimeSummary(state, row.id);
              return (
                <View key={row.id} style={[styles.activityRow, { borderColor: colors.line }]}>
                  <View style={{ flex: 1.2 }}>
                    <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {row.status === 'avsluttet' ? 'avsluttet' : 'under arbeid'}
                      {row.priceModelName ? ` · ${row.priceModelName}` : ''}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      Registrert {formatHours(stats.registered)} / Est. {formatHours(stats.estimated)}
                    </Text>
                    <ProgressBar left={stats.registered} right={Math.max(0, -stats.remaining)} colors={colors} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>
                      Fakturerbart {formatHours(stats.billable)}
                    </Text>
                    <ProgressBar left={stats.billable} right={stats.nonBillable} leftColor="#16a34a" rightColor="#94a3b8" colors={colors} />
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      const result = updateActivity(state, row.id, {
                        status: row.status === 'avsluttet' ? 'under_arbeid' : 'avsluttet',
                      });
                      if (result.ok) onChangeState(result.state);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.muted} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}

        {tab === 'fakturering' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.blockTitle, { color: colors.ink }]}>Prismodell</Text>
            <Info label="Navn" value={project.name} colors={colors} />
            <Info label="Prismodell" value={pricingModelLabel(project.pricingModel) || 'Ikke satt'} colors={colors} />
            <Info label="Kunde" value={project.client || '—'} colors={colors} />
            {project.pricingModel === 'hourly' ? (
              <Info
                label="Ens timepris"
                value={project.pricingSettings?.hourlyRate != null
                  ? String(project.pricingSettings.hourlyRate)
                  : '—'}
                colors={colors}
              />
            ) : null}
            <Text style={{ color: colors.muted, marginTop: 12, fontSize: 13 }}>
              Velg blant: {PRICING_MODELS.map((row) => row.label).join(' · ')}. Endre prismodell under Rediger.
            </Text>
          </View>
        ) : null}

        {tab === 'timerapport' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.blockTitle, { color: colors.ink, marginBottom: 12 }]}>Timerapport</Text>
            <View style={[styles.tableHead, { borderColor: colors.line }]}>
              {['Dato', 'Medarbeider', 'Aktivitet', 'Beskrivelse', 'Timer', 'Fakturerbart', ''].map((label) => (
                <Text key={label} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {timeEntries.map((row) => (
              <View key={row.id} style={[styles.tableRow, { borderColor: colors.line }]}>
                <Text style={[styles.td, { color: colors.ink }]}>{row.date}</Text>
                <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.employeeName}</Text>
                <Text style={[styles.td, { color: colors.muted }]} numberOfLines={1}>{row.activityName}</Text>
                <Text style={[styles.td, { color: colors.ink, flex: 1.4 }]} numberOfLines={2}>{row.description || '—'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.hours)}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.billableHours)}</Text>
                <View style={styles.td}>
                  {row.status === 'godkjent' || row.status === 'låst' ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success || '#16a34a'} />
                  ) : isAdmin ? (
                    <TouchableOpacity onPress={() => approveEntry(row.id)}>
                      <Ionicons name="ellipse-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color={colors.line} />
                  )}
                </View>
              </View>
            ))}
            {!timeEntries.length ? (
              <Text style={{ color: colors.muted, paddingVertical: 16 }}>Ingen timeføringer på prosjektet ennå.</Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'team' ? (
          <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.blockHead}>
              <Text style={[styles.blockTitle, { color: colors.ink }]}>Prosjektdeltakere</Text>
              {isAdmin ? (
                <TouchableOpacity
                  onPress={() => setMemberOpen(true)}
                  style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
                >
                  <Text style={{ color: '#fff', fontWeight: '600' }}>+ Legg til medlemskap</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {members.map((row) => (
              <View key={row.id} style={[styles.teamRow, { borderColor: colors.line }]}>
                {row.photoUrl ? (
                  <Image source={{ uri: row.photoUrl }} style={styles.avatarLg} />
                ) : (
                  <View style={[styles.avatarLg, { backgroundColor: `${colors.brand}22` }]}>
                    <Ionicons name="person" size={18} color={colors.brand} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.employeeName}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {PROJECT_ROLES.map((role) => (
                      <TouchableOpacity
                        key={role}
                        onPress={() => changeRole(row.id, role)}
                        style={[
                          styles.roleChip,
                          {
                            borderColor: row.role === role ? colors.brand : colors.line,
                            backgroundColor: row.role === role ? `${colors.brand}14` : 'transparent',
                          },
                        ]}
                      >
                        <Text style={{ color: colors.ink, fontSize: 12 }}>{role}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
                {isAdmin ? (
                  <TouchableOpacity onPress={() => dropMember(row.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger || '#b42318'} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {!members.length ? (
              <Text style={{ color: colors.muted }}>
                Legg til medarbeidere som deltakere — da får de prosjektet i Arbeid-modulen og kan føre timer.
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal transparent visible={memberOpen} animationType="fade" onRequestClose={() => setMemberOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setMemberOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Legg til medlemskap</Text>
            <ScrollView style={{ maxHeight: 240 }}>
              {availableEmployees.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setPickEmployeeId(row.id)}
                  style={[styles.sheetRow, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: pickEmployeeId === row.id ? '700' : '400' }}>
                    {employeeDisplayName(row)}
                  </Text>
                </TouchableOpacity>
              ))}
              {!availableEmployees.length ? (
                <Text style={{ color: colors.muted }}>Alle ansatte er allerede deltakere, eller ingen ansatte er registrert.</Text>
              ) : null}
            </ScrollView>
            <Text style={{ color: colors.muted, marginTop: 10, marginBottom: 6 }}>Rolle</Text>
            <View style={styles.chipRow}>
              {PROJECT_ROLES.map((role) => (
                <TouchableOpacity
                  key={role}
                  onPress={() => setMemberRole(role)}
                  style={[
                    styles.roleChip,
                    {
                      borderColor: memberRole === role ? colors.brand : colors.line,
                      backgroundColor: memberRole === role ? `${colors.brand}14` : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: colors.ink, fontSize: 12 }}>{role}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setMemberOpen(false)} style={[styles.ghostBtn, { borderColor: colors.line, flex: 1 }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addMember} style={[styles.primaryBtn, { backgroundColor: colors.brand, flex: 1, justifyItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Legg til</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal transparent visible={activityOpen} animationType="fade" onRequestClose={() => setActivityOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setActivityOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Ny aktivitet</Text>
            <TextInput
              value={activityName}
              onChangeText={setActivityName}
              placeholder="F.eks. Hovedaktivitet"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setActivityOpen(false)} style={[styles.ghostBtn, { borderColor: colors.line, flex: 1 }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={createActivity} style={[styles.primaryBtn, { backgroundColor: colors.brand, flex: 1, alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Opprett</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
      {editingTrip ? (
        <MileageWizard
          key={editingTrip.id}
          colors={colors}
          state={state}
          customers={customers}
          contracts={contracts}
          launch={false}
          editingTrip={editingTrip}
          onDismiss={() => setEditingTrip(null)}
          onApply={(result) => {
            if (result?.ok && result.state) onChangeState(result.state);
            return result;
          }}
        />
      ) : null}
    </View>
  );
}

function Info({ label, value, colors, wide = false }) {
  return (
    <View style={[styles.infoCell, wide && styles.infoCellWide]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '500' }}>{value}</Text>
    </View>
  );
}

function Kpi({ label, value, colors }) {
  return (
    <View style={styles.kpiCell}>
      <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  crumb: { fontSize: 12, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, marginBottom: 8 },
  tabs: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 44,
  },
  tabsInner: { flexDirection: 'row', alignItems: 'center' },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 4,
  },
  bodyScroll: { flex: 1, minHeight: 0 },
  bodyContent: { paddingBottom: 40, flexGrow: 0 },
  columns: { flexDirection: 'row', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  mainCol: { flex: 1.6, minWidth: 300, borderWidth: 1, borderRadius: 10, padding: 16 },
  sideCol: { flex: 1, minWidth: 260, maxWidth: 420, gap: 12 },
  sideCard: { borderWidth: 1, borderRadius: 10, padding: 14 },
  panel: { borderWidth: 1, borderRadius: 10, padding: 16 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  blockTitle: { fontSize: 15, fontWeight: '700' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  infoCell: { width: '48%', minWidth: 140, paddingVertical: 8, paddingRight: 8, gap: 2 },
  infoCellWide: { width: '100%' },
  settingsGrid: { gap: 2 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCell: { width: '47%', minWidth: 100, gap: 2, paddingVertical: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarLg: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  barTrack: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', marginTop: 4 },
  barFill: { height: 8 },
  tableHead: { flexDirection: 'row', borderBottomWidth: 1, paddingBottom: 8, gap: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 8, alignItems: 'center' },
  th: { flex: 1, fontSize: 11 },
  td: { flex: 1, fontSize: 12 },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  roleChip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 6,
    marginTop: 6,
  },
  agreementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  invoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  docLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  primaryBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  ghostBtn: { borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 12, padding: 16 },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  sheetRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
