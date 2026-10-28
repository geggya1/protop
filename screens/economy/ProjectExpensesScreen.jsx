import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { canImportList } from '../../src/access/companyAccess';
import { useLayout } from '../../src/theme';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import OptionPicker from '../../components/OptionPicker';
import { useTimesheetWorkspace } from '../arbeid/useTimesheetWorkspace';
import { loadAnbudState } from '../../src/anbud/storage';
import { useCompanyRefs } from '../../src/context/CompanyDataContext';
import { hydrateRows } from '../../src/company/companyData.js';
import { formatMoney, parseDate } from '../../src/economy/invoices.js';
import { EXPENSE_STATUSES } from '../../src/economy/expenses.js';
import { formatDate } from '../../src/economy/hoursList.js';
import {
  EXPENSE_PERIODS,
  EXPENSE_SORT_OPTIONS,
  expenseStatusLabel,
  expensesForEmployee,
  filterExpenses,
  sortExpenses,
} from '../../src/economy/expenseList.js';
import {
  EXPENSE_IMPORT_ACCEPT,
  buildExpenseImportReview,
  linkExpenseImportPlanCustomer,
  linkExpenseImportPlanEmployee,
  linkExpenseImportPlanProject,
  readExpenseImport,
  toggleExpenseReviewRow,
} from '../../src/economy/expenseImport.js';
import { isExternalExpense, loadProjectExpenses, mergeExpenseLists, saveProjectExpenses } from '../../src/economy/expenseStorage.js';
import { createId } from '../../src/project/engine';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import ExpenseImportReview from '../../components/economy/ExpenseImportReview';
import Breadcrumb from '../../components/Breadcrumb';
import ReportTable from '../../components/table/ReportTable';
import InlineError from '../../src/ui/InlineError';
import Skeleton from '../../src/ui/Skeleton';
import { radius, space, type } from '../../src/ui/tokens';

function money(value) {
  return typeof formatMoney === 'function' ? formatMoney(value) : String(value ?? '');
}

async function bytesFromFile(file) {
  if (file?.bytes instanceof Uint8Array) return file.bytes;
  if (typeof file?.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  if (file?.uri && typeof fetch === 'function') {
    const response = await fetch(file.uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error('Kunne ikke lese filen.');
}

// Status i tabellen og på telefonkortet: grønn når utlegget er godkjent eller betalt, rød når det er avvist.
function statusTone(status, colors) {
  if (status === 'approved' || status === 'invoiced' || status === 'reimbursed') return colors.successInk || colors.success;
  if (status === 'rejected') return colors.dangerInk || colors.danger;
  if (status === 'submitted') return colors.brandInk || colors.brand;
  return colors.muted;
}

// Sorteringen i panelet («date-desc») og i tabellhodet ({ key, dir }) er den samme.
function sortState(sort) {
  const [key, dir] = String(sort || '').split('-');
  return { key: key || 'date', dir: dir === 'desc' ? 'desc' : 'asc' };
}

function Choice({ label, on, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={[styles.choice, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.card }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ProjectExpensesScreen({ lockedEmployeeId = '', embedded = false, canImport: canImportProp } = {}) {
  const colors = useColors();
  // Import av utleggslister krever Admin på Prosjektutlegg.
  const adminImport = canImportList(useCompanyAccess(), 'economyProjectExpenses');
  const canImport = adminImport && canImportProp !== false;
  const { width } = useLayout();
  // Brede skjermer: filter og sortering i høyre marg, som på Timer.
  const sideFilters = width >= 1100;
  const hostedHero = useModuleHeroHosted();
  const workspace = useTimesheetWorkspace({ lockedEmployeeId });
  const refs = useCompanyRefs(workspace.workspaceId);
  const [customers, setCustomers] = useState([]);
  const [remoteExpenses, setRemoteExpenses] = useState([]);
  const [remoteReady, setRemoteReady] = useState(false);
  const [query, setQuery] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [status, setStatus] = useState('');
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [pageSize, setPageSize] = useState(60);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [linkQuery, setLinkQuery] = useState({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let live = true;
    loadAnbudState(workspace.workspaceId).then((loaded) => {
      if (live) setCustomers(loaded?.customers || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [workspace.workspaceId]);

  useEffect(() => {
    let live = true;
    setRemoteReady(false);
    setError('');
    loadProjectExpenses(workspace.workspaceId).then((rows) => {
      if (!live) return;
      setRemoteExpenses(rows);
      setRemoteReady(true);
    }).catch((cause) => {
      if (!live) return;
      setRemoteReady(true);
      setError(String(cause?.message || '') || 'Kunne ikke laste importerte utlegg.');
    });
    return () => { live = false; };
  }, [workspace.workspaceId, reloadKey]);

  const allRows = useMemo(() => {
    const inline = (workspace.state?.expenses || []).filter((row) => !isExternalExpense(row));
    // Person, kunde og prosjekt slås opp før filtrering og sortering (DS-08).
    const merged = hydrateRows(mergeExpenseLists(remoteExpenses, inline), refs);
    const locked = workspace.lockedId;
    if (!locked) return merged;
    // Ansattsiden: det personen har registrert på prosjekt, også importerte rader uten kobling.
    const person = (workspace.employees || []).find((row) => row.id === locked) || { id: locked };
    return expensesForEmployee(merged, person);
  }, [workspace.state, remoteExpenses, workspace.lockedId, workspace.employees, refs]);

  const visible = useMemo(() => sortExpenses(filterExpenses(allRows, {
    query,
    employeeQuery: workspace.lockedId ? '' : employeeQuery,
    customerQuery,
    projectQuery,
    status,
    period,
    fromDate,
    toDate,
  }), sort), [allRows, query, employeeQuery, customerQuery, projectQuery, status, period, fromDate, toDate, sort, workspace.lockedId]);

  const importReview = useMemo(
    () => (importPlan ? buildExpenseImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );

  async function importFile() {
    if (!canImport) return;
    setError('');
    const file = await pickDocument({ accept: EXPENSE_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readExpenseImport(bytes, file.name, {
        existingExpenses: allRows,
        employees: workspace.employees,
        customers,
        projects: workspace.state?.projects || [],
      });
      setImportPlan(plan);
      setDropped(new Set());
      setLinkQuery({});
      setNote('Kontroller koblinger. Utlegg som allerede finnes hoppes over.');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lese utleggsfilen.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    importPlan.rows.forEach((row, index) => {
      if (row.severity === 'block' || row.severity === 'existing' || dropped.has(String(index)) || !row.entry) return;
      chosen.push(row.entry);
    });
    if (!chosen.length) {
      setError('Ingen utlegg er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const stamp = new Date().toISOString();
      const entries = chosen.map((row) => ({
        ...row,
        id: row.id || createId('utl'),
        externalStore: true,
        storage: 'projectExpenses',
        createdAt: row.createdAt || stamp,
        updatedAt: stamp,
      }));
      await saveProjectExpenses(workspace.workspaceId, entries, {});
      setRemoteExpenses((current) => mergeExpenseLists(current, entries));
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${entries.length} utlegg er lagret.`);
      showSaveToast(`${entries.length} utlegg er lagret.`);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre utleggene.');
    } finally {
      setBusy(false);
    }
  }

  function toggleSort(key) {
    const map = {
      date: sort === 'date-desc' ? 'date-asc' : 'date-desc',
      employee: 'employee',
      customer: 'customer',
      project: 'project',
      amount: sort === 'amount-desc' ? 'amount-asc' : 'amount-desc',
      status: 'status',
    };
    setSort(map[key] || 'date-desc');
  }

  if (importPlan && importReview) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body}>
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        <ExpenseImportReview
          colors={colors}
          review={importReview}
          employees={workspace.employees}
          customers={customers}
          projects={workspace.state?.projects || []}
          busy={busy}
          readyCount={importReview.readyCount}
          linkQuery={linkQuery}
          setLinkQuery={setLinkQuery}
          onToggleCard={(card) => setDropped((current) => toggleExpenseReviewRow(current, card))}
          onToggleOkRow={(id) => setDropped((current) => toggleExpenseReviewRow(current, { id }))}
          onLinkEmployee={(rowIndex, person) => {
            setImportPlan((current) => linkExpenseImportPlanEmployee(current, rowIndex, person, { applyGroup: true }));
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkExpenseImportPlanProject(current, rowIndex, project, { applyGroup: true, customers }));
          }}
          onLinkCustomer={(rowIndex, customer) => {
            setImportPlan((current) => linkExpenseImportPlanCustomer(current, rowIndex, customer, { applyGroup: true }));
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); }}
        />
      </ScrollView>
    );
  }

  // På ansattsiden er medarbeideren gitt.
  const showEmployee = !workspace.lockedId;
  // Felles rapporttabell (UX-24): tabell på bred skjerm, kort med beskrivelse, dato, kunde,
  // beløp og status på telefon. Før var tabellen 980 px bred også på telefon.
  // Minstebreddene (852 px) får plass ved siden av filterpanelet på PC; flex fordeler resten.
  const columns = [
    { key: 'date', label: 'Dato', width: 92, kind: 'date', text: (row) => formatDate(row.date), phone: 'meta' },
    ...(showEmployee ? [{ key: 'employee', label: 'Medarbeider', width: 120, flex: 1, text: (row) => row.employeeName || '', phone: 'meta' }] : []),
    { key: 'customer', label: 'Kunde', width: 120, flex: 1, text: (row) => row.customerName || '', phone: 'meta' },
    {
      key: 'project',
      label: 'Prosjekt',
      width: 140,
      flex: 1,
      text: (row) => `${row.projectNumber ? `#${row.projectNumber} ` : ''}${row.projectName || ''}`.trim(),
      phone: 'meta',
    },
    { key: 'description', label: 'Beskrivelse', width: 170, flex: 1.5, text: (row) => row.purpose || row.description || '', sortable: false, phone: 'title' },
    { key: 'amount', label: 'Beløp', width: 110, kind: 'money', value: (row) => row.amountInclVat, text: (row) => money(row.amountInclVat), phone: 'amount' },
    { key: 'status', label: 'Status', width: 100, text: (row) => expenseStatusLabel(row.status), phone: 'badge' },
  ];
  const totalAmount = visible.reduce((sum, row) => sum + (Number(row.amountInclVat) || 0), 0);

  const filterPanel = (
    <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="expense-filters">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i beskrivelse, kunde, prosjekt…"
        placeholderTextColor={colors.placeholder || colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
      <Text style={[styles.label, { color: colors.muted }]}>Periode</Text>
      <View style={styles.rowWrap}>
        {EXPENSE_PERIODS.map((item) => (
          <Choice key={item.id} label={item.label} on={period === item.id} onPress={() => setPeriod(item.id)} colors={colors} />
        ))}
      </View>
      {period === 'custom' ? (
        <View style={styles.rowWrap}>
          <TextInput
            value={fromDate}
            onChangeText={setFromDate}
            onBlur={() => setFromDate((value) => parseDate(value) || value)}
            placeholder="Fra dato"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.dateInput, { color: colors.ink, borderColor: colors.line }]}
          />
          <TextInput
            value={toDate}
            onChangeText={setToDate}
            onBlur={() => setToDate((value) => parseDate(value) || value)}
            placeholder="Til dato"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.dateInput, { color: colors.ink, borderColor: colors.line }]}
          />
        </View>
      ) : null}
      <Text style={[styles.label, { color: colors.muted }]}>Sortering</Text>
      <OptionPicker
        options={EXPENSE_SORT_OPTIONS}
        value={sort}
        onChange={(id) => { if (id) setSort(id); }}
        title="Sortering"
        clearable={false}
        small
      />
      <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
      <OptionPicker
        options={[{ id: '', label: 'Alle' }, ...EXPENSE_STATUSES.map((item) => ({ id: item.id, label: item.label }))]}
        value={status || ''}
        onChange={(id) => setStatus(id || '')}
        placeholder="Alle"
        title="Status"
        clearable={false}
        small
      />
      {workspace.lockedId ? null : (
        <TextInput
          value={employeeQuery}
          onChangeText={setEmployeeQuery}
          placeholder="Filtrer medarbeider"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
        />
      )}
      <TextInput
        value={customerQuery}
        onChangeText={setCustomerQuery}
        placeholder="Filtrer kunde"
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
      <TextInput
        value={projectQuery}
        onChangeText={setProjectQuery}
        placeholder="Filtrer prosjekt"
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
      />
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="prosjektutlegg">
      <View style={sideFilters ? styles.desk : styles.stack}>
      <View style={sideFilters ? styles.mainCol : styles.stack}>
      {hostedHero || embedded ? null : (
        <>
          <Breadcrumb tab="arbeid" subView="utlegg" />
          <Text style={[styles.title, { color: colors.ink }]}>Prosjektutlegg</Text>
          <Text style={{ color: colors.muted }}>Utlegg som hører til prosjektet</Text>
        </>
      )}
      <View style={styles.toolbar}>
        {sideFilters ? null : (
        <TouchableOpacity onPress={() => setFiltersOpen((open) => !open)} accessibilityRole="button" style={[styles.choice, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink }}>{filtersOpen ? 'Skjul filter' : 'Filter og sortering'}</Text>
        </TouchableOpacity>
        )}
        {canImport ? (
        <TouchableOpacity
          onPress={importFile}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Importer prosjektutlegg"
          nativeID="expense-import-open"
          style={[styles.importBtn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Leser…' : 'Importer fra fil'}</Text>
        </TouchableOpacity>
        ) : null}
      </View>
      <InlineError
        message={error}
        nativeID="expense-error"
        onRetry={remoteReady ? () => { setError(''); setReloadKey((n) => n + 1); } : undefined}
      />
      {!!note && <Text style={{ color: colors.muted }}>{note}</Text>}
      <Text style={{ color: colors.muted }}>
        {remoteReady ? `${visible.length} av ${allRows.length} utlegg` : 'Laster utlegg…'}
      </Text>

      {!sideFilters && filtersOpen ? filterPanel : null}

      {!remoteReady && !allRows.length ? (
        <Skeleton.Table rows={5} columns={columns.length} label="Laster utlegg" />
      ) : (
        <ReportTable
          nativeID="expense-table"
          colors={colors}
          columns={columns}
          rows={visible}
          rowKey={(row) => row.id || row.importFingerprint}
          sort={sortState(sort)}
          onSort={(col) => toggleSort(col.key)}
          rowLabel={(row) => [row.purpose || row.description, formatDate(row.date), money(row.amountInclVat)].filter(Boolean).join(', ')}
          renderCell={(row, col) => (col.key === 'status' ? (
            <Text style={[styles.status, { color: statusTone(row.status, colors), borderColor: colors.line }]} numberOfLines={1}>
              {expenseStatusLabel(row.status)}
            </Text>
          ) : undefined)}
          limit={pageSize}
          onMore={() => setPageSize((n) => n + 60)}
          totals={visible.length ? { amount: money(totalAmount) } : null}
          empty={allRows.length ? 'Ingen utlegg i dette utvalget.' : 'Ingen prosjektutlegg er registrert.'}
        />
      )}
      </View>
      {sideFilters ? <View style={styles.side}>{filterPanel}</View> : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  stack: { gap: 10 },
  desk: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 10 },
  side: { width: 300, flexShrink: 0 },
  title: { fontSize: 22, fontWeight: '700' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  importBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  panel: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  dateInput: { minWidth: 140, flexGrow: 1 },
  status: { alignSelf: 'flex-start', ...type.caption, fontWeight: '600', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.xs, paddingVertical: 2, overflow: 'hidden' },
});
