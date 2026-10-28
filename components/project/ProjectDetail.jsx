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
import BackLink from '../../src/ui/BackLink';
import { SHELL_DETAILS } from '../../src/navigation/shellPaths';
import {
  addActivity,
  updateActivity,
  projectTimeSummary,
  projectEconomy,
  activityTimeSummary,
  setTimeEntryStatus,
  ensureMainActivity,
} from '../../src/project/engine';
import { projectCrossView } from '../../src/project/projectCrossView.js';
import { formatHours } from '../../src/arbeid/hours.js';
import { pricingModelLabel } from '../../src/project/projectFields.js';
import { formatDate, formatMoney } from '../../src/economy/invoices.js';
import { mergeSaleLists, withoutExternalSales } from '../../src/economy/productSalesStorage.js';
import { salesForProject } from '../../src/economy/productSalesView.js';
import { useProductSales } from '../../src/economy/useProductSales.js';
import IndexLetterTable from '../economy/IndexLetterTable';
import { lettersForProject, projectNeedsIndexAttention } from '../../src/indeksregulering/groups';
import { mergeIndexSnapshot } from '../../src/indeksregulering/indexLedger';
import { loadRemoteIndexSnapshot } from '../../src/indeksregulering/remoteSsb';
import { loadCases, loadIndexCache } from '../../src/indeksregulering/storage';
import { dueByContractId, osloDate } from '../../src/indeksregulering/watch';
import ProjectOverviewTab from './ProjectOverviewTab';
import ProjectSettingsTab from './ProjectSettingsTab';
import ProjectTeamTab from './ProjectTeamTab';
import ProjectExpensesTab from './ProjectExpensesTab';
import ProjectSalesTab from './ProjectSalesTab';
import ProjectBillingTab from './ProjectBillingTab';
import ProjectBillingReadyTab from './ProjectBillingReadyTab';
import ProjectIndexArchive from './ProjectIndexArchive';
import ProjectEarningsTab from './ProjectEarningsTab';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { teamWithHourParticipants } from '../../src/project/myProjects';
import { projectStatusLabel } from '../../src/project/statusFilter';

const SALES_MAX_AGE_MS = 2 * 60 * 1000;

// Uten Admin: hovedside, egne utlegg, eget produktsalg og egne timer. Begrenset redigering får også innstillinger.
const LIMITED_TABS = new Set(['hovedside', 'utlegg', 'produktsalg', 'timerapport']);

const TABS = [
  { id: 'hovedside', label: 'Hovedside' },
  { id: 'aktiviteter', label: 'Aktiviteter' },
  { id: 'fakturering', label: 'Faktureringsvalg' },
  { id: 'team', label: 'Team' },
  { id: 'timerapport', label: 'Timerapport' },
  { id: 'inntjening', label: 'Inntjening' },
  { id: 'utlegg', label: 'Prosjektutlegg' },
  { id: 'produktsalg', label: 'Produktsalg' },
  { id: 'til_fakturering', label: 'Til fakturering' },
  { id: 'fakturaer', label: 'Fakturaer' },
  { id: 'indeks', label: 'Indeksregulering' },
  { id: 'innstillinger', label: 'Innstillinger' },
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
  familyId,
  onChangeState,
  onEditForm,
  onBack,
  backLabel = SHELL_DETAILS.project.list,
  onOpenAgreement,
  onOpenCustomer,
  onOpenInvoice,
  onOpenIndex,
  onOpenEconomySettings,
  onOpenEconomyBilling,
  onOpenProjectInvoice,
  initialTab = '',
  hoursLoading = false,
  projectMode = 'admin',
  myEmployeeId = '',
}) {
  const access = useCompanyAccess();
  const full = projectMode === 'admin';
  const editor = projectMode === 'editor';
  const canSeeEarnings = access.canView('economyEarnings') || access.canView('economy');
  const tabs = useMemo(
    () => TABS.filter((row) => {
      if (row.id === 'inntjening' && !canSeeEarnings) return false;
      if (full) return true;
      return LIMITED_TABS.has(row.id) || (editor && row.id === 'innstillinger');
    }),
    [canSeeEarnings, full, editor],
  );
  const [tab, setTab] = useState(initialTab || 'hovedside');
  useEffect(() => {
    if (!tabs.some((row) => row.id === tab)) setTab('hovedside');
  }, [tab, tabs]);
  const ownOnly = full ? '' : (myEmployeeId || '__ingen__');
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityName, setActivityName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  // Team: registrerte deltakere pluss de som har ført timer på prosjektet.
  const members = useMemo(
    () => teamWithHourParticipants(state.members, state.timeEntries, project.id),
    [state.members, state.timeEntries, project.id],
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
  // Timerapporten viser bare egne timer uten Admin.
  const reportEntries = useMemo(
    () => (ownOnly ? timeEntries.filter((row) => row.employeeId === ownOnly) : timeEntries),
    [timeEntries, ownOnly],
  );
  const summary = useMemo(() => projectTimeSummary(state, project.id), [state, project.id]);
  // Importerte salg ligger i egen samling. Slås sammen med salg i prosjektstate.
  // Listen deles med Produktsalg-siden og leses ikke på nytt for hvert prosjekt.
  const { rows: importedSales, ready: salesReady } = useProductSales(familyId, { maxAgeMs: SALES_MAX_AGE_MS });
  const projectRef = useMemo(() => ({ id: project.id, number: project.number }), [project.id, project.number]);
  const projectSales = useMemo(
    () => mergeSaleLists(
      salesForProject(importedSales, projectRef),
      salesForProject(withoutExternalSales(state.sales), projectRef),
    ),
    [importedSales, state.sales, projectRef],
  );
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
        <BackLink label={backLabel} onPress={onBack} nativeID="project-back" />
        {full || editor ? (
        <TouchableOpacity
          onPress={() => setTab('innstillinger')}
          style={[styles.editBtn, { borderColor: colors.line }]}
          accessibilityRole="button"
          accessibilityLabel="Prosjektinnstillinger"
        >
          <Ionicons name="settings-outline" size={16} color={colors.ink} />
          <Text style={{ color: colors.ink }}>Innstillinger</Text>
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
            {projectStatusLabel(project, 'Under arbeid')}
          </Text>
        </View>
      </View>

      <View style={[styles.tabs, { borderBottomColor: colors.line }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsInner}>
          {tabs.map((row) => {
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
              sales={projectSales}
              cross={cross}
              summary={summary}
              members={members}
              timeEntries={timeEntries}
              colors={colors}
              isAdmin={isAdmin}
              limited={!full}
              canEditCover={full || editor}
              ownEmployeeId={ownOnly}
              familyId={familyId}
              onChangeState={onChangeState}
              onOpenTab={setTab}
              onOpenCustomer={onOpenCustomer}
              onOpenAgreement={onOpenAgreement}
            />
            {full ? (
            <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card, marginTop: 8, padding: 10 }]}>
              <ProjectIndexNote project={project} contracts={contracts} timeEntries={state.timeEntries || []} colors={colors} />
              <IndexLetterTable
                rows={lettersForProject(project, contracts)}
                colors={colors}
                title="Indeksreguleringer"
                empty="Ingen indeksreguleringer på prosjektet."
              />
            </View>
            ) : null}
          </>
        ) : null}

        {tab === 'innstillinger' ? (
          <ProjectSettingsTab
            state={state}
            project={project}
            customers={customers}
            contracts={contracts}
            colors={colors}
            isAdmin={full && isAdmin}
            canEditBasics={editor}
            familyId={familyId}
            onChangeState={onChangeState}
            onEditForm={full ? onEditForm : undefined}
            onOpenAgreement={onOpenAgreement}
          />
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
            isAdmin={full && isAdmin}
            employeeId={ownOnly}
            myEmployeeId={myEmployeeId}
            employees={employees}
            onChangeState={onChangeState}
          />
        ) : null}

        {tab === 'produktsalg' ? (
          <ProjectSalesTab
            state={state}
            project={project}
            sales={projectSales}
            salesReady={salesReady}
            employees={employees}
            customers={customers}
            familyId={familyId}
            colors={colors}
            isAdmin={full && isAdmin}
            employeeId={ownOnly}
            onChangeState={onChangeState}
            onOpenInvoice={onOpenInvoice}
          />
        ) : null}

        {tab === 'til_fakturering' ? (
          <ProjectBillingReadyTab
            project={project}
            colors={colors}
            onOpenEconomyBilling={onOpenEconomyBilling}
            onOpenTab={(next) => setTab(tabs.some((row) => row.id === next) ? next : 'fakturering')}
            onOpenInvoice={onOpenProjectInvoice || onOpenInvoice}
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
                    accessibilityRole="button"
                    accessibilityLabel={row.status === 'avsluttet' ? `Gjenåpne ${row.name}` : `Merk ${row.name} som avsluttet`}
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
              {/* Fakturerbart er bare for Admin på Prosjekt. */}
              {['Dato', 'Medarbeider', 'Aktivitet', 'Beskrivelse', 'Timer', ...(full ? ['Fakturerbart'] : []), ''].map((label) => (
                <Text key={label} style={[styles.th, { color: colors.muted }]}>{label}</Text>
              ))}
            </View>
            {reportEntries.map((row) => (
              <View key={row.id} style={[styles.tableRow, { borderColor: colors.line }]}>
                <Text style={[styles.td, { color: colors.ink }]}>{row.date}</Text>
                <Text style={[styles.td, { color: colors.ink }]} numberOfLines={1}>{row.employeeName}</Text>
                <Text style={[styles.td, { color: colors.muted }]} numberOfLines={1}>{row.activityName}</Text>
                <Text style={[styles.td, { color: colors.ink, flex: 1.4 }]} numberOfLines={2}>{row.description || '—'}</Text>
                <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.hours)}</Text>
                {full ? <Text style={[styles.td, { color: colors.ink }]}>{formatHours(row.billableHours)}</Text> : null}
                <View style={styles.td}>
                  {row.status === 'godkjent' || row.status === 'låst' ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.success || '#16a34a'} />
                  ) : full && isAdmin ? (
                    <TouchableOpacity
                      onPress={() => approveEntry(row.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Godkjenn timene ${row.date} for ${row.employeeName || 'den ansatte'}`}
                    >
                      <Ionicons name="ellipse-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  ) : (
                    <Ionicons name="ellipse-outline" size={18} color={colors.line} />
                  )}
                </View>
              </View>
            ))}
            {!reportEntries.length ? (
              <Text style={{ color: colors.muted, paddingVertical: 16 }}>
                {hoursLoading ? 'Laster timer…' : (full ? 'Ingen timeføringer på prosjektet ennå.' : 'Du har ingen timer på prosjektet ennå.')}
              </Text>
            ) : null}
          </View>
        ) : null}

        {tab === 'inntjening' && canSeeEarnings ? (
          <ProjectEarningsTab
            project={project}
            entries={timeEntries}
            employees={employees}
            contracts={contracts}
            familyId={familyId}
            colors={colors}
            hoursLoading={hoursLoading}
          />
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
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
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3, flexShrink: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  tabs: {
    flexGrow: 0,
    flexShrink: 0,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    maxHeight: 40,
  },
  tabsInner: { flexDirection: 'row', alignItems: 'center' },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginRight: 2,
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
