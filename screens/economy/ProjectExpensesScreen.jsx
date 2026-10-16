import React, { useEffect, useMemo, useState } from 'react';
import {
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
import { useColors } from '../../src/context/ThemeContext';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useTimesheetWorkspace } from '../arbeid/useTimesheetWorkspace';
import { loadAnbudState } from '../../src/anbud/storage';
import { formatMoney, parseDate } from '../../src/economy/invoices.js';
import { EXPENSE_STATUSES } from '../../src/economy/expenses.js';
import { formatDate } from '../../src/economy/hoursList.js';
import {
  EXPENSE_PERIODS,
  EXPENSE_SORT_OPTIONS,
  expenseStatusLabel,
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

function Choice({ label, on, onPress, colors, nativeID }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      nativeID={nativeID}
      style={[styles.choice, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.card }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ProjectExpensesScreen({ lockedEmployeeId = '', embedded = false } = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const workspace = useTimesheetWorkspace({ lockedEmployeeId });
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [linkQuery, setLinkQuery] = useState({});

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
  }, [workspace.workspaceId]);

  const allRows = useMemo(() => {
    const inline = (workspace.state?.expenses || []).filter((row) => !isExternalExpense(row));
    const merged = mergeExpenseLists(remoteExpenses, inline);
    const locked = workspace.lockedId;
    return locked ? merged.filter((row) => row.employeeId === locked) : merged;
  }, [workspace.state, remoteExpenses, workspace.lockedId]);

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

  function resetFilters() {
    setQuery('');
    setEmployeeQuery('');
    setCustomerQuery('');
    setProjectQuery('');
    setStatus('');
    setPeriod('all');
    setFromDate('');
    setToDate('');
    setSort('date-desc');
  }

  const activeFilterCount = [
    String(query || '').trim(),
    !workspace.lockedId && String(employeeQuery || '').trim(),
    String(customerQuery || '').trim(),
    String(projectQuery || '').trim(),
    status,
    period !== 'all',
    sort !== 'date-desc',
  ].filter(Boolean).length;
  const filtersActive = activeFilterCount > 0;

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

  const columns = [
    ['date', 'Dato'],
    ['employee', 'Medarbeider'],
    ['customer', 'Kunde'],
    ['project', 'Prosjekt'],
    ['description', 'Beskrivelse'],
    ['amount', 'Beløp'],
    ['status', 'Status'],
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="prosjektutlegg">
      {hostedHero || embedded ? null : (
        <>
          <Text style={[styles.crumb, { color: colors.muted }]}>Økonomi / Prosjektutlegg</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Prosjektutlegg</Text>
          <Text style={{ color: colors.muted }}>Utlegg som hører til prosjektet</Text>
        </>
      )}
      <View style={styles.toolbar}>
        <Text style={[styles.count, { color: colors.muted }]}>
          {remoteReady ? `${visible.length} av ${allRows.length} utlegg` : 'Laster utlegg…'}
        </Text>
        <TouchableOpacity
          onPress={() => {
            setFiltersOpen((open) => !open);
            setSettingsOpen(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Filtrer og sorter"
          accessibilityState={{ expanded: filtersOpen }}
          nativeID="expense-filter-toggle"
          style={[
            styles.ghostBtn,
            {
              borderColor: filtersOpen || filtersActive ? colors.brand : colors.line,
              backgroundColor: filtersOpen || filtersActive ? (colors.brandSoft || '#E8F1FF') : colors.card,
            },
          ]}
        >
          <Ionicons name="options-outline" size={18} color={filtersOpen || filtersActive ? colors.brand : colors.ink} />
          <Text style={{ color: filtersOpen || filtersActive ? colors.brand : colors.ink, fontWeight: '600' }}>Filtrer</Text>
          {activeFilterCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: colors.brand }]}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            setSettingsOpen((open) => !open);
            setFiltersOpen(false);
          }}
          accessibilityRole="button"
          accessibilityLabel="Innstillinger"
          accessibilityState={{ expanded: settingsOpen }}
          nativeID="expense-settings"
          style={[
            styles.iconBtn,
            {
              borderColor: settingsOpen ? colors.brand : colors.line,
              backgroundColor: settingsOpen ? (colors.brandSoft || '#E8F1FF') : colors.card,
            },
          ]}
        >
          <Ionicons name="settings-outline" size={18} color={settingsOpen ? colors.brand : colors.ink} />
        </TouchableOpacity>
      </View>
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {!!note && <Text style={{ color: colors.muted }}>{note}</Text>}

      <ScrollView horizontal>
        <View style={{ minWidth: 980 }}>
          <View style={[styles.tableRow, { backgroundColor: colors.sunken }]}>
            {columns.map(([key, label]) => (
              <TouchableOpacity key={key} onPress={() => toggleSort(key)} accessibilityRole="button">
                <Text style={[styles.cell, { color: colors.muted, fontWeight: '700' }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {visible.slice(0, pageSize).map((row) => (
            <View key={row.id || row.importFingerprint} style={[styles.tableRow, { borderBottomColor: colors.line }]}>
              <Text style={[styles.cell, { color: colors.ink }]}>{formatDate(row.date)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]} numberOfLines={2}>{row.employeeName || '—'}</Text>
              <Text style={[styles.cell, { color: colors.ink }]} numberOfLines={2}>{row.customerName || '—'}</Text>
              <Text style={[styles.cell, { color: colors.ink }]} numberOfLines={2}>
                {row.projectNumber ? `#${row.projectNumber}` : ''} {row.projectName || ''}
              </Text>
              <Text style={[styles.cell, { color: colors.ink }]} numberOfLines={2}>{row.purpose || row.description || '—'}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{money(row.amountInclVat)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{expenseStatusLabel(row.status)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      {!visible.length ? (
        <Text style={{ color: colors.muted, padding: 12 }}>
          {allRows.length
            ? 'Ingen utlegg i dette utvalget. Åpne Filtrer for periode, status eller sortering.'
            : 'Ingen prosjektutlegg er registrert.'}
        </Text>
      ) : null}
      {visible.length > pageSize ? (
        <TouchableOpacity onPress={() => setPageSize((n) => n + 60)} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Vis flere ({pageSize} av {visible.length})</Text>
        </TouchableOpacity>
      ) : null}
      <Modal transparent visible={filtersOpen} animationType="slide" onRequestClose={() => setFiltersOpen(false)}>
        <View style={[styles.modalBg, styles.modalSheet]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setFiltersOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk filter"
            nativeID="expense-filter-dismiss"
          />
          <View
            style={[styles.filterSheet, { backgroundColor: colors.bg, borderColor: colors.line }]}
            accessibilityViewIsModal
            nativeID="expense-filter-sheet"
          >
            <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%' }} contentContainerStyle={styles.sheetScroll}>
              <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="expense-filters">
                <View style={styles.sheetHead}>
                  <Text style={[styles.sheetTitle, { color: colors.ink }]}>Filtrer og sorter</Text>
                  <TouchableOpacity
                    onPress={() => setFiltersOpen(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Lukk filter"
                    nativeID="expense-filter-close"
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={20} color={colors.ink} />
                  </TouchableOpacity>
                </View>
                <View style={styles.searchRow}>
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Søk i beskrivelse, kunde, prosjekt…"
                    placeholderTextColor={colors.placeholder || colors.muted}
                    nativeID="expense-filter-search"
                    style={[styles.input, styles.searchInput, { color: colors.ink, borderColor: colors.line }]}
                  />
                  <TouchableOpacity
                    onPress={resetFilters}
                    accessibilityRole="button"
                    nativeID="expense-filter-reset"
                    style={[styles.ghostBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
                  >
                    <Text style={{ color: colors.ink }}>Nullstill</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.label, { color: colors.muted }]}>Periode</Text>
                <View style={styles.rowWrap}>
                  {EXPENSE_PERIODS.map((item) => (
                    <Choice
                      key={item.id}
                      label={item.label}
                      on={period === item.id}
                      onPress={() => setPeriod(item.id)}
                      colors={colors}
                      nativeID={`expense-period-${item.id}`}
                    />
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
                <View style={styles.rowWrap}>
                  {EXPENSE_SORT_OPTIONS.map((item) => (
                    <Choice
                      key={item.id}
                      label={item.label}
                      on={sort === item.id}
                      onPress={() => setSort(item.id)}
                      colors={colors}
                      nativeID={`expense-sort-${item.id}`}
                    />
                  ))}
                </View>
                <Text style={[styles.label, { color: colors.muted }]}>Status</Text>
                <View style={styles.rowWrap}>
                  <Choice label="Alle" on={!status} onPress={() => setStatus('')} colors={colors} nativeID="expense-status-all" />
                  {EXPENSE_STATUSES.map((item) => (
                    <Choice
                      key={item.id}
                      label={item.label}
                      on={status === item.id}
                      onPress={() => setStatus(item.id)}
                      colors={colors}
                      nativeID={`expense-status-${item.id}`}
                    />
                  ))}
                </View>
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
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal transparent visible={settingsOpen} animationType="fade" onRequestClose={() => setSettingsOpen(false)}>
        <View style={[styles.modalBg, styles.modalSheet]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSettingsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk innstillinger"
            nativeID="expense-settings-dismiss"
          />
          <View
            style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessibilityViewIsModal
            nativeID="expense-settings-menu"
          >
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Innstillinger</Text>
            <TouchableOpacity
              onPress={() => {
                setSettingsOpen(false);
                importFile();
              }}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Importer prosjektutlegg"
              nativeID="expense-import-open"
              style={[styles.importBtn, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
            >
              <Ionicons name="cloud-upload-outline" size={16} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700' }}>{busy ? 'Leser…' : 'Importer fra fil'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  count: { flex: 1, minWidth: 120, fontSize: 13 },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  importBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  panel: { width: '100%', maxWidth: '100%', borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, alignSelf: 'stretch' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sheetTitle: { fontSize: 16, fontWeight: '700', flex: 1 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0 },
  label: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' },
  modalBg: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)' },
  modalSheet: { justifyContent: 'flex-end' },
  filterSheet: {
    maxHeight: '88%',
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 2,
  },
  sheetScroll: { padding: 12, paddingBottom: 28, width: '100%' },
  settingsCard: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 28,
    gap: 10,
    zIndex: 2,
  },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  dateInput: { minWidth: 140, flexGrow: 1 },
  tableRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { width: 140, padding: 8, fontSize: 13 },
});
