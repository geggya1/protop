import React, { useEffect, useMemo, useState } from 'react';
import {
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
  updateActivity,
  updateProject,
  projectTimeSummary,
  projectEconomy,
  activityTimeSummary,
  setTimeEntryStatus,
  ensureMainActivity,
} from '../../src/project/engine';
import { projectCrossView } from '../../src/project/projectCrossView.js';
import { defaultWorkSettings } from '../../src/arbeid/roles.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { pricingModelLabel } from '../../src/project/projectFields.js';
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
import ProjectOverviewTab from './ProjectOverviewTab';
import ProjectTeamTab from './ProjectTeamTab';
import ProjectExpensesTab from './ProjectExpensesTab';
import ProjectSalesTab from './ProjectSalesTab';
import ProjectBillingTab from './ProjectBillingTab';
import ProjectBillingReadyTab from './ProjectBillingReadyTab';
import ProjectIndexArchive from './ProjectIndexArchive';

const TABS = [
  { id: 'hovedside', label: 'Hovedside' },
  { id: 'aktiviteter', label: 'Aktiviteter' },
  { id: 'fakturering', label: 'Faktureringsvalg' },
  { id: 'team', label: 'Team' },
  { id: 'timerapport', label: 'Timerapport' },
  { id: 'utlegg', label: 'Prosjektutlegg' },
  { id: 'produktsalg', label: 'Produktsalg' },
  { id: 'til_fakturering', label: 'Til fakturering' },
  { id: 'fakturaer', label: 'Fakturaer' },
  { id: 'indeks', label: 'Indeksregulering' },
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

/**
 * Oppdatert prosjektvisning med landingsside og faner.
 * Faktureringsvalg arver selskapets Økonomi-innstillinger.
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
  onOpenEconomySettings,
  onOpenEconomyBilling,
}) {
  const [tab, setTab] = useState('hovedside');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityName, setActivityName] = useState('');
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

  function removeTrip(id, confirmed = false) {
    if (!confirmed && pendingDelete !== id) {
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

  function saveEndDate(value) {
    const result = updateProject(state, project.id, { end: value });
    if (result.ok) {
      onChangeState(result.state);
      showSaveToast('Sluttdato lagret.');
    } else setError(result.error);
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
            <Text style={{ color: colors.ink }}>Rediger prosjekt</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={[styles.crumb, { color: colors.muted }]}>Prosjekter / #{project.number}</Text>
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.ink }]}>
          #{project.number} {project.name}
          {project.client ? ` (${project.client})` : ''}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
          <View style={[styles.statusDot, { backgroundColor: '#16a34a' }]} />
          <Text style={{ color: '#166534', fontWeight: '600', fontSize: 12 }}>
            {project.projectStatus || project.phase || 'Under arbeid'}
          </Text>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.line }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsInner}>
          {TABS.map((row) => {
            const on = tab === row.id;
            return (
              <TouchableOpacity
                key={row.id}
                onPress={() => setTab(row.id)}
                style={[styles.tab, on && { borderBottomColor: colors.brand }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                nativeID={`project-tab-${row.id}`}
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
          <>
            <ProjectOverviewTab
              state={state}
              project={project}
              cross={cross}
              summary={summary}
              members={members}
              timeEntries={timeEntries}
              colors={colors}
              onOpenTab={setTab}
              onOpenCustomer={onOpenCustomer}
              onEditForm={onEditForm}
              onSaveEndDate={saveEndDate}
            />
            <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card, marginTop: 12 }]}>
              <Text style={[styles.blockTitle, { color: colors.ink, marginBottom: 8 }]}>Avtale og indeks</Text>
              <TouchableOpacity
                nativeID="project-agreement-open"
                onPress={() => cross.contract && onOpenAgreement?.(cross.contract.id)}
                disabled={!cross.contract}
                style={[styles.agreementBtn, { borderColor: cross.contract ? colors.brand : (colors.danger || '#b42318') }]}
              >
                <Ionicons name={cross.contract ? 'document-text' : 'warning'} size={18} color={cross.contract ? colors.brand : (colors.danger || '#b42318')} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Avtale</Text>
                  <Text style={{ color: colors.ink, fontWeight: '700' }} numberOfLines={2}>
                    {cross.contract ? cross.contract.title : 'Ingen avtale er koblet til prosjektet'}
                  </Text>
                </View>
              </TouchableOpacity>
              <ProjectIndexNote project={project} contracts={contracts} timeEntries={state.timeEntries || []} colors={colors} />
              <IndexLetterTable
                rows={lettersForProject(project, contracts)}
                colors={colors}
                title="Indeksreguleringer på prosjektet"
                empty="Ingen indeksreguleringer er registrert på prosjektet."
              />
              <ProjectAddressEditor
                project={project}
                colors={colors}
                onSave={(patch) => {
                  const result = updateProject(state, project.id, patch);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  onChangeState(result.state);
                  showSaveToast('Lagret.');
                }}
              />
              <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 20 }]}>Kjøreturer</Text>
              {!projectTrips.length ? (
                <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen kjøreturer er registrert på prosjektet.</Text>
              ) : projectTrips.map((row) => (
                <View key={row.id} style={[styles.tripRow, { borderBottomColor: colors.line }]}>
                  <TouchableOpacity onPress={() => setEditingTrip(row)}>
                    <Text style={{ color: colors.ink, fontSize: 14 }}>
                      {row.date} · {row.from} → {row.to} · {row.km} km
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.tripActions}>
                    <TouchableOpacity onPress={() => setEditingTrip(row)}>
                      <Text style={{ color: colors.brand, fontWeight: '700' }}>Rediger</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeTrip(row.id)}>
                      <Text style={{ color: colors.danger || '#b42318', fontWeight: '700' }}>
                        {pendingDelete === row.id ? 'Slett nå' : 'Slett'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <Text style={[styles.blockTitle, { color: colors.ink, marginTop: 20 }]}>Innstillinger for timeføring</Text>
              {[
                ['showInAllTimesheets', 'Vis prosjekt i alles timelister'],
                ['allowSelfJoin', 'Ansatte kan legge seg selv inn på prosjektet'],
                ['requireDescription', 'Beskrivelse på timeføring er påkrevd'],
                ['showEstimatedHours', 'Vis estimerte og planlagte timer i timelisten'],
                ['notifyOnOverrun', 'Varsle prosjektleder på e-post ved overskridelse'],
              ].map(([key, label]) => (
                <TouchableOpacity key={key} onPress={() => patchSettings(key, !settings[key])} style={styles.checkRow}>
                  <Ionicons name={settings[key] ? 'checkbox' : 'square-outline'} size={20} color={settings[key] ? colors.brand : colors.muted} />
                  <Text style={{ color: colors.ink, flex: 1, fontSize: 14 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : null}

        {tab === 'fakturering' ? (
          <ProjectBillingTab
            state={state}
            project={project}
            activities={state.activities}
            colors={colors}
            isAdmin={isAdmin}
            onChangeState={onChangeState}
            onOpenEconomySettings={onOpenEconomySettings}
          />
        ) : null}

        {tab === 'team' ? (
          <ProjectTeamTab
            state={state}
            project={project}
            members={members}
            employees={employees}
            timeEntries={timeEntries}
            colors={colors}
            isAdmin={isAdmin}
            uid={uid}
            onChangeState={onChangeState}
          />
        ) : null}

        {tab === 'utlegg' ? (
          <ProjectExpensesTab
            state={state}
            project={project}
            colors={colors}
            isAdmin={isAdmin}
            onChangeState={onChangeState}
          />
        ) : null}

        {tab === 'produktsalg' ? (
          <ProjectSalesTab
            state={state}
            project={project}
            colors={colors}
            isAdmin={isAdmin}
            onChangeState={onChangeState}
          />
        ) : null}

        {tab === 'til_fakturering' ? (
          <ProjectBillingReadyTab
            state={state}
            project={project}
            colors={colors}
            onOpenEconomyBilling={onOpenEconomyBilling}
            onOpenTab={setTab}
          />
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

        {tab === 'indeks' ? (
          <ProjectIndexArchive
            project={project}
            contracts={contracts}
            colors={colors}
            onOpenIndex={onOpenIndex}
          />
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
      </ScrollView>

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
                <Text style={{ color: colors.ink, textAlign: 'center' }}>Avbryt</Text>
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
          onDelete={() => removeTrip(editingTrip.id, true)}
          onApply={(result) => {
            if (result?.ok && result.state) onChangeState(result.state);
            return result;
          }}
        />
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
      {hits.map((hit) => (
        <TouchableOpacity key={hit.placeId || hit.label} onPress={() => applyHit(hit)}>
          <Text style={{ color: colors.ink, fontSize: 13, paddingVertical: 4 }}>{hit.label}</Text>
        </TouchableOpacity>
      ))}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TextInput value={street} onChangeText={setStreet} placeholder="Gate" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, flexGrow: 1, minWidth: 140 }]} />
        <TextInput value={postalCode} onChangeText={setPostalCode} placeholder="Postnr" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, width: 90 }]} />
        <TextInput value={placeName} onChangeText={setPlaceName} placeholder="Poststed" placeholderTextColor={colors.muted} style={[styles.input, { color: colors.ink, borderColor: colors.line, flexGrow: 1, minWidth: 120 }]} />
      </View>
      <TouchableOpacity
        onPress={() => onSave({
          street,
          postalCode,
          placeName,
          place: [street, [postalCode, placeName].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        })}
        style={[styles.primaryBtn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Lagre adresse</Text>
      </TouchableOpacity>
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
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
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
  panel: { borderWidth: 1, borderRadius: 10, padding: 16 },
  blockHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  blockTitle: { fontSize: 15, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
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
  tripRow: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 6 },
  tripActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  th: { flex: 1, fontSize: 11 },
  td: { flex: 1, fontSize: 12 },
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
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
});
