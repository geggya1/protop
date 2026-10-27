import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import { dateKey } from '../../src/utils/dates';
import { fold } from '../../src/economy/invoices.js';
import { supplierFromCompany } from '../../src/economy/ehf.js';
import { buildReadyProjects, PERIOD_OPTIONS, periodEndFor } from '../../src/economy/billingReady.js';
import { osloDate } from '../../src/indeksregulering/watch';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import ConfirmDialog from '../../components/ConfirmDialog';
import DateField from '../../components/DateField';
import BillingProjectRow from './billing/BillingProjectRow';
import useBillingData from './billing/useBillingData';
import useBillingWorkflow from './billing/useBillingWorkflow';
import { Banner, Button, Check, money } from './billing/ui';
import { withIndexWarnings } from './billing/indexWarnings';

const SCOPES = [
  { id: 'all', label: 'Alle prosjekter' },
  { id: 'mine', label: 'Mine prosjekter' },
  { id: 'warnings', label: 'Med varsler' },
  { id: 'drafts', label: 'Med utkast' },
];

/**
 * Økonomi · Til fakturering: åpne poster per prosjekt → godkjenn → fakturautkast.
 * Utkastene ferdigstilles og sendes fra fakturasiden.
 */
export default function EconomyBilling({ demo = null, storage = null, onOpenInvoice = null } = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId, family, requestShellTab, uid, activeProfile, isAdmin } = useApp();
  const access = useCompanyAccess();
  const { isPhone, width, hasRail, railWidth } = useLayout();
  const stacked = isPhone || width - (hasRail ? railWidth : 0) < 1100;
  const canEdit = !!demo || !!isAdmin || access.canEdit('economyBilling');
  const company = demo ? '__demo__' : familyId;
  const data = useBillingData({ familyId: company, canSeePowerOffice: !!isAdmin && !demo, storage, demo });
  const today = osloDate();
  const [period, setPeriod] = useState('lastMonth');
  const [customDate, setCustomDate] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [openIds, setOpenIds] = useState(() => new Set());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const periodEnd = periodEndFor(period, today, customDate);
  const supplier = useMemo(() => (demo?.supplier || supplierFromCompany(family?.company, family?.name)), [family, demo]);
  const actor = useMemo(() => ({ byUid: uid || '', byName: activeProfile?.name || '' }), [uid, activeProfile?.name]);

  const ready = useMemo(() => {
    if (!data.ready) return [];
    const built = buildReadyProjects({
      projects: data.projects,
      customers: data.customers,
      timeEntries: data.timeEntries,
      expenses: data.expenses,
      trips: data.trips,
      sales: data.sales,
      invoices: data.invoices,
      timesheetLocks: data.timesheetLocks,
      contracts: data.contracts,
      settingsFor: data.settingsFor,
      periodEnd,
      today,
    });
    return withIndexWarnings(built, data, today);
  }, [data, periodEnd, today]);

  const me = fold(activeProfile?.name);
  const visible = useMemo(() => {
    const needle = fold(query);
    return ready.filter((project) => {
      if (scope === 'mine' && (!me || fold(project.project?.manager) !== me)) return false;
      if (scope === 'warnings' && !project.warnings.length) return false;
      if (scope === 'drafts' && !project.drafts.length) return false;
      if (!needle) return true;
      return fold([project.number, project.name, project.customerName, project.customerNumber].join(' ')).includes(needle);
    });
  }, [ready, query, scope, me]);

  const workflow = useBillingWorkflow({
    familyId: company,
    storage,
    projects: visible,
    data,
    supplier,
    actor,
    periodEnd,
    onCreated: (created, failed) => {
      setError(failed.length ? failed.map((row) => `${row.project ? `#${row.project.number} ${row.project.name}: ` : ''}${row.error}`).join('\n') : '');
      if (created.length) {
        const text = created.length === 1
          ? 'Fakturautkastet er laget.'
          : `${created.length} fakturautkast er laget.`;
        setNote(`${text} Kontroller og ferdigstill dem fra fakturasiden.`);
        showSaveToast(text);
      }
    },
    onError: (message) => setError(message),
  });

  const allChecked = visible.length > 0 && visible.every((project) => workflow.checked.has(project.projectId));
  const someChecked = visible.some((project) => workflow.checked.has(project.projectId));
  const checkedProjects = visible.filter((project) => workflow.checked.has(project.projectId));

  function toggleOpen(projectId) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function openDraft(invoice) {
    if (onOpenInvoice) {
      onOpenInvoice(invoice.id);
      return;
    }
    requestShellTab?.('okonomi', 'faktura', { type: 'openInvoice', invoiceId: invoice.id });
  }

  function openProject(project, tab) {
    requestShellTab?.('projects', null, { type: 'openProject', projectId: project.projectId, tab });
  }

  async function approve(list) {
    setError('');
    const count = await workflow.approve(list);
    if (count) {
      const text = count === 1 ? '1 post er godkjent.' : `${count} poster er godkjent.`;
      setNote(text);
      showSaveToast(text);
    }
  }

  if (!data.ready) {
    return (
      <View style={[styles.wrap, { backgroundColor: colors.bg, padding: 16 }]}>
        <Text style={{ color: colors.muted }}>Henter det som skal faktureres…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg }]} nativeID="economy-billing">
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {hostedHero ? null : <Text style={[styles.title, { color: colors.ink }]}>Til fakturering</Text>}
        <Text style={{ color: colors.muted, fontSize: 13, maxWidth: 760, lineHeight: 19 }}>
          Ufakturerte timer, utlegg, kjøring og salg per prosjekt. Åpne et prosjekt for å se linjene,
          godkjenn og lag fakturautkast. Utkastene får nummer først når de ferdigstilles.
        </Text>

        <View style={styles.toolbar}>
          <View style={styles.chipRow}>
            {PERIOD_OPTIONS.map((row) => {
              const on = period === row.id;
              return (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setPeriod(row.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  nativeID={`billing-period-${row.id}`}
                  style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{row.label}</Text>
                </TouchableOpacity>
              );
            })}
            {period === 'custom' ? (
              <DateField
                value={customDate || periodEnd}
                onChange={(date) => setCustomDate(date ? dateKey(date) : '')}
                style={[styles.dateField, { borderColor: colors.line, backgroundColor: colors.card }]}
              />
            ) : (
              <Text style={{ color: colors.muted, fontSize: 12 }}>{`t.o.m. ${periodEnd.split('-').reverse().join('.')}`}</Text>
            )}
          </View>
          <View style={styles.chipRow}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Søk prosjekt eller kunde"
              placeholderTextColor={colors.muted}
              accessibilityLabel="Søk prosjekt eller kunde"
              nativeID="billing-search"
              style={[styles.search, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
            />
            {SCOPES.map((row) => {
              const on = scope === row.id;
              return (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setScope(row.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{row.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {data.mode === 'poweroffice' ? (
          <Banner tone="info" colors={colors} title="PowerOffice Go er koblet">
            Utkastene lages her. Fra fakturasiden overføres de til PowerOffice, som setter fakturanummer, KID og sender fakturaen.
          </Banner>
        ) : null}
        {data.error ? <Banner tone="block" colors={colors}>{data.error}</Banner> : null}
        {error ? <Banner tone="block" colors={colors}>{error}</Banner> : null}
        {note ? <Banner tone="ok" colors={colors}>{note}</Banner> : null}

        <View style={[styles.summary, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={styles.summaryLeft}>
            <Check
              checked={allChecked}
              partial={!allChecked && someChecked}
              onPress={() => workflow.setAllChecked(!allChecked, visible)}
              colors={colors}
              disabled={!visible.length || !canEdit}
              label="Velg alle"
              nativeID="billing-check-all"
            />
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Velg alle</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {visible.length === 1 ? '1 prosjekt' : `${visible.length} prosjekter`}
            </Text>
          </View>
          <View style={[styles.summaryRight, isPhone && styles.summaryRightStacked]}>
            <Text style={{ color: colors.ink }}>
              <Text style={{ fontWeight: '700' }}>Totalt å faktureres: </Text>
              {money(workflow.totals.open)}
              <Text style={{ color: colors.muted }}> eks. mva</Text>
            </Text>
            {someChecked ? (
              <Text style={{ color: colors.muted, fontSize: 13 }}>{`Valgt ${money(workflow.totals.picked)}`}</Text>
            ) : null}
            {canEdit ? (
              <View style={[styles.actions, isPhone && { width: '100%' }]}>
                <Button
                  label="Godkjenn utvalg"
                  icon="checkmark"
                  tone="success"
                  colors={colors}
                  disabled={!checkedProjects.length || !!workflow.busy}
                  busy={workflow.busy === 'approve'}
                  onPress={() => approve(checkedProjects)}
                  nativeID="billing-approve-selected"
                />
                <Button
                  label="Lag fakturautkast av utvalg"
                  icon="document-text-outline"
                  colors={colors}
                  disabled={!checkedProjects.length || !!workflow.busy}
                  busy={workflow.busy === 'draft'}
                  onPress={() => { setError(''); setNote(''); workflow.requestCreate(checkedProjects); }}
                  nativeID="billing-draft-selected"
                />
              </View>
            ) : null}
          </View>
        </View>

        {!visible.length ? (
          <View style={[styles.empty, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Ionicons name="checkmark-done-outline" size={22} color={colors.muted} />
            <Text style={{ color: colors.ink, fontWeight: '700' }}>
              {ready.length ? 'Ingen prosjekter passer filteret.' : 'Ingenting å fakturere i perioden.'}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', maxWidth: 520 }}>
              Timer, utlegg, kjøring og salg dukker opp her når de er ført på et prosjekt med kunde.
              Velg «T.o.m. i dag» for å ta med arbeid fra denne måneden.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          {visible.map((project) => (
            <BillingProjectRow
              key={project.projectId}
              project={project}
              colors={colors}
              open={openIds.has(project.projectId)}
              onToggleOpen={() => toggleOpen(project.projectId)}
              selected={workflow.selectedFor(project)}
              onToggleKey={(key) => workflow.toggleKey(project, key)}
              checked={workflow.checked.has(project.projectId)}
              onToggleCheck={() => workflow.toggleChecked(project.projectId)}
              fixedAmount={workflow.fixedAmounts[project.projectId]}
              onFixedAmount={(value) => workflow.setFixedAmount(project.projectId, value)}
              stacked={stacked}
              busy={!!workflow.busy}
              canEdit={canEdit}
              onApprove={() => approve([project])}
              onCreateDraft={() => { setError(''); setNote(''); workflow.requestCreate([project]); }}
              onOpenDraft={openDraft}
              onOpenProject={(tab) => openProject(project, tab)}
            />
          ))}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={!!workflow.pending}
        title="Ikke godkjent"
        message={workflow.pending
          ? `${workflow.pending.unapproved === 1 ? '1 post' : `${workflow.pending.unapproved} poster`} i utvalget er ikke godkjent. Vil du godkjenne dem og ta dem med, eller bare ta med det som er godkjent?`
          : ''}
        buttons={[
          { text: 'Avbryt', style: 'cancel', onPress: workflow.cancelPending },
          { text: 'Bare godkjente', style: 'cancel', onPress: () => workflow.confirmPending(false) },
          { text: 'Godkjenn og lag utkast', onPress: () => workflow.confirmPending(true) },
        ]}
        onClose={() => {}}
      />
      <BrandBusyOverlay
        visible={workflow.busy === 'draft'}
        label="Lager fakturautkast…"
        detail="Postene reserveres på utkastene. Vent til det er ferdig."
        done={workflow.progress?.done}
        total={workflow.progress?.total}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  inner: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  toolbar: { gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  dateField: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, minWidth: 180 },
  search: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 220, flexGrow: 1, maxWidth: 360, fontSize: 14 },
  summary: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexGrow: 1 },
  summaryRight: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', flexShrink: 1, minWidth: 0 },
  summaryRightStacked: { justifyContent: 'flex-start' },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', flexShrink: 1, minWidth: 0 },
  empty: { borderWidth: 1, borderRadius: 10, padding: 24, alignItems: 'center', gap: 8 },
});
