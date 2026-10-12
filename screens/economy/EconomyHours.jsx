import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import HoursOrganizePanel from '../../components/arbeid/HoursOrganizePanel';
import TimesheetDayView from '../../components/arbeid/TimesheetDayView';
import { loadAnbudState } from '../../src/anbud/storage';
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  HOUR_IMPORT_ACCEPT,
  linkImportPlanCustomer,
  linkImportPlanEmployee,
  linkImportPlanProject,
  reviewRowsForHourPlan,
  suggestEmployees,
  toggleHourReviewRow,
} from '../../src/economy/hoursImport.js';
import { suggestCustomers } from '../../src/economy/invoiceImport.js';
import {
  DEFAULT_HOUR_COLUMNS,
  HOUR_COLUMNS,
  dayTimesheetRows,
  employeeHourOptions,
  filterHours,
  formatDate,
  formatHours,
  groupHours,
  hourFacets,
  hourTotals,
  shiftDateKey,
  sortHours,
} from '../../src/economy/hoursList.js';
import { readHourImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { emptyProjectState, importTimeEntries } from '../../src/project/engine';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { watchEmployees } from '../../src/employees/storage';
import { recordUsage } from '../../src/employees/usageClient';
import { displayName } from '../../src/employees/model.js';
import { toDateKey } from '../../src/arbeid/calendar.js';

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

const TABLE_MIN_FALLBACK = 720;

function columnStyle(column) {
  if (column.flex) {
    return { flexGrow: 1, flexShrink: 1, flexBasis: column.minWidth || 160, minWidth: column.minWidth || 120 };
  }
  return { width: column.width, flexGrow: 0, flexShrink: 0 };
}

function toggleColumn(keys, key) {
  const current = keys?.length ? keys : DEFAULT_HOUR_COLUMNS;
  if (current.includes(key)) {
    const next = current.filter((item) => item !== key);
    return next.length ? next : current;
  }
  return [...current, key];
}

export default function EconomyHours({
  familyId,
  customers: customersProp = [],
  projects: projectsProp = [],
  onOpenCustomer,
  onOpenProject,
}) {
  const colors = useColors();
  const { familyId: appFamilyId, requestShellTab } = useApp();
  const resolvedFamilyId = familyId || appFamilyId;
  const { width, isPhone, hasRail, railWidth } = useLayout();
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 720;

  const [state, setState] = useState(emptyProjectState());
  const [employees, setEmployees] = useState([]);
  const [anbudCustomers, setAnbudCustomers] = useState([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState('list');
  const [query, setQuery] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState('');
  const [period, setPeriod] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [sort, setSort] = useState('date-desc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_HOUR_COLUMNS);
  const [panelOpen, setPanelOpen] = useState(!isPhone);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [pageSize, setPageSize] = useState(80);
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    loadProjectState(resolvedFamilyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [resolvedFamilyId]);

  useEffect(() => {
    const stop = watchEmployees(resolvedFamilyId, setEmployees, () => {});
    return stop;
  }, [resolvedFamilyId]);

  useEffect(() => {
    if (customersProp.length) return undefined;
    let live = true;
    loadAnbudState(resolvedFamilyId).then((loaded) => {
      if (!live) return;
      setAnbudCustomers(loaded?.customers || []);
    });
    return () => { live = false; };
  }, [resolvedFamilyId, customersProp.length]);

  const entries = state.timeEntries || [];
  const customers = customersProp.length ? customersProp : anbudCustomers;
  const projectList = projectsProp.length ? projectsProp : (state.projects || []);
  const openProject = onOpenProject || ((projectId) => requestShellTab?.('projects', null, { type: 'openProject', projectId }));

  const scoped = useMemo(() => filterHours(entries, {
    query,
    customerId: customerFilter,
    projectId: projectFilter,
    activityName: activityFilter,
    period,
    fromDate,
    toDate,
    billable: billableFilter,
  }), [entries, query, customerFilter, projectFilter, activityFilter, period, fromDate, toDate, billableFilter]);

  const visible = useMemo(() => sortHours(filterHours(scoped, {
    employeeId: employeeFilter,
  }), sort), [scoped, employeeFilter, sort]);

  const groups = useMemo(() => groupHours(visible, groupBy), [visible, groupBy]);
  const pageRows = useMemo(() => visible.slice(0, pageSize), [visible, pageSize]);
  const totals = useMemo(() => hourTotals(visible), [visible]);
  const employeeOptions = useMemo(
    () => employeeHourOptions(scoped, employees),
    [scoped, employees],
  );
  const facets = useMemo(() => hourFacets(scoped), [scoped]);
  const columns = useMemo(() => {
    const keys = new Set(visibleColumns.length ? visibleColumns : DEFAULT_HOUR_COLUMNS);
    const picked = HOUR_COLUMNS.filter((column) => keys.has(column.key));
    return picked.length ? picked : HOUR_COLUMNS.filter((column) => DEFAULT_HOUR_COLUMNS.includes(column.key));
  }, [visibleColumns]);
  const tableMin = columns.reduce((sum, column) => sum + (column.minWidth || column.width || 80), 0) || TABLE_MIN_FALLBACK;
  const groupedList = useMemo(() => {
    if (groupBy === 'none') return pageRows.map((row) => ({ type: 'row', id: row.id, row }));
    const out = [];
    let remaining = pageSize;
    for (const group of groups) {
      if (remaining <= 0) break;
      out.push({ type: 'header', id: `g-${group.id}`, label: group.label, hours: group.hours, count: group.rows.length });
      const slice = group.rows.slice(0, remaining);
      remaining -= slice.length;
      slice.forEach((row) => out.push({ type: 'row', id: row.id, row }));
    }
    return out;
  }, [groupBy, groups, pageRows, pageSize]);
  const reviewRows = useMemo(
    () => (importPlan ? reviewRowsForHourPlan(importPlan, { dropped }) : []),
    [importPlan, dropped],
  );

  useEffect(() => {
    if (!stackRows) return;
    if (employeeFilter) return;
    if (employeeOptions[0]?.id) setEmployeeFilter(employeeOptions[0].id);
  }, [stackRows, employeeFilter, employeeOptions, employees]);

  const daySheet = useMemo(() => dayTimesheetRows({
    entries,
    projects: projectList,
    members: state.members || [],
    date: selectedDay,
    employeeId: employeeFilter,
  }), [entries, projectList, state.members, selectedDay, employeeFilter]);

  useEffect(() => {
    setPageSize(80);
  }, [query, employeeFilter, customerFilter, projectFilter, activityFilter, period, fromDate, toDate, billableFilter, sort, entries.length]);

  useEffect(() => {
    if (!employeeFilter) return;
    if (!employeeOptions.some((row) => row.id === employeeFilter)) setEmployeeFilter('');
  }, [employeeFilter, employeeOptions]);

  function resetOrganize() {
    setQuery('');
    setEmployeeFilter('');
    setCustomerFilter('');
    setProjectFilter('');
    setActivityFilter('');
    setBillableFilter('');
    setPeriod('all');
    setFromDate('');
    setToDate('');
    setGroupBy('none');
    setSort('date-desc');
    setVisibleColumns(DEFAULT_HOUR_COLUMNS);
  }

  function persist(next) {
    setState(next);
    const job = saveChain.current.then(() => saveProjectState(next, resolvedFamilyId));
    saveChain.current = job.catch(() => {});
    return job;
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: HOUR_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    setProgress('Leser fil…');
    try {
      const bytes = await bytesFromFile(file);
      const plan = await readHourImport(bytes, file.name, {
        familyId: resolvedFamilyId,
        existingEntries: entries,
        employees,
        customers,
        projects: projectList,
      }, (payload) => askImportInterpret(payload));
      if (!plan.rows.length) {
        setError('Fant ingen timer i filen.');
        return;
      }
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setLinkQuery({});
      const engine = plan.interpretation?.engine;
      setNote(engine && engine !== 'lokal'
        ? `Listen er tolket (${engine}). Kontroller koblinger før import.`
        : 'Duplikater hoppes over automatisk. Kontroller medarbeider og prosjekt før lagring.');
      setView('import');
      setProgress('');
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese timelisten.'));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function confirmImport() {
    if (!importPlan || busy) return;
    const chosen = [];
    const leftOut = [];
    importPlan.rows.forEach((row, index) => {
      const id = String(index);
      const missingLink = !row.entry?.employeeId || !row.entry?.projectId;
      if (
        row.severity === 'block'
        || row.severity === 'existing'
        || dropped.has(id)
        || !row.entry
        || missingLink
      ) {
        leftOut.push({
          name: row.title || 'Uten dato',
          reason: row.severity === 'existing'
            ? (row.issues?.[0] || 'Duplikat — hoppet over.')
            : row.severity === 'block'
              ? (row.issues?.[0] || 'Kan ikke importeres.')
              : missingLink
                ? 'Mangler kobling til medarbeider eller prosjekt.'
                : 'Valgt bort før lagring.',
        });
        return;
      }
      chosen.push(row);
    });
    if (!chosen.length) {
      setError('Ingen timer er valgt for import.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = importTimeEntries(state, chosen.map((row) => row.entry));
      if (!result.ok) throw new Error(result.error || 'Kunne ikke importere timer.');
      await persist(result.state);
      const withIssues = chosen.filter((row) => (row.issues || []).length).length;
      const report = importResult(
        [{ name: `${result.added.length} timeføringer`, issues: withIssues ? [`${withIssues} med avvik`] : [] }],
        leftOut,
      );
      report.saved = result.added.length;
      report.total = chosen.length + leftOut.length;
      report.complete = !leftOut.length && !withIssues && !result.skipped.length;
      setImportReport(report);
      setImportPlan(null);
      setDropped(new Set());
      setNote(`${result.added.length} timer er lagret. Medarbeidere er lagt til på prosjektene, og oppstillingene er oppdatert.`);
      const latestByEmployee = new Map();
      for (const row of result.added || []) {
        const current = latestByEmployee.get(row.employeeId);
        if (!current || String(row.date) >= String(current.date)) latestByEmployee.set(row.employeeId, row);
      }
      for (const row of [...latestByEmployee.values()].slice(0, 20)) {
        recordUsage({
          type: 'hour',
          companyId: resolvedFamilyId,
          employeeId: row.employeeId,
          summary: ['Import', row.hours != null ? `${row.hours} t` : '', row.date, row.projectName].filter(Boolean).join(' · '),
          detail: {
            hours: row.hours,
            date: row.date || '',
            projectName: row.projectName || '',
            entryId: row.id || '',
          },
        }).catch(() => {});
      }
      setView('list');
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre timene.');
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  function cellValue(row, key) {
    if (key === 'date') return formatDate(row.date);
    if (key === 'hours' || key === 'billableHours') return formatHours(row[key]);
    if (key === 'projectName') {
      return row.projectNumber
        ? `${row.projectNumber} ${row.projectName || ''}`.trim()
        : (row.projectName || '—');
    }
    return row[key] || '—';
  }

  function renderListRow({ item: row }) {
    return (
      <View style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: colors.card }]}>
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[styles.td, columnStyle(column), { color: colors.ink }]}
            numberOfLines={column.key === 'description' || column.key === 'projectName' || column.key === 'internalNote' ? 2 : 1}
          >
            {cellValue(row, column.key)}
          </Text>
        ))}
      </View>
    );
  }

  if (view === 'import' && importPlan) {
    return (
      <ScrollView
        nativeID="economy-hours-import"
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.heading, { color: colors.ink }]}>Kontroller timeimport</Text>
        <Text style={{ color: colors.muted }}>
          Duplikater hoppes over. Medarbeidere legges automatisk inn på prosjektene ved lagring,
          og timene oppdaterer prosjektets oppstilling.
        </Text>
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
        <ImportReview
          colors={colors}
          nativeID="hour-import-review"
          lead="Fjern rader du ikke vil ha med. Grupper med samme avvik kan tas ut samlet."
          rows={reviewRows}
          busy={busy}
          confirmLabel={(count) => `Importer ${count} timer`}
          onToggle={(id) => {
            const row = reviewRows.find((item) => item.id === id);
            if (!row) return;
            setDropped((current) => toggleHourReviewRow(current, row, importPlan));
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
          renderRowExtra={(row) => {
            if (row.severity === 'ok' || row.severity === 'existing') return null;
            const planRow = importPlan.rows[row.rowIndex];
            if (!planRow?.entry) return null;
            const q = linkQuery[row.id] || '';
            return (
              <View style={{ gap: 6, marginTop: 4 }}>
                {!planRow.employeeId ? (
                  <>
                    <TextInput
                      value={q}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [row.id]: value }))}
                      placeholder="Søk medarbeider for å koble…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {suggestEmployees(employees, {
                      ...planRow,
                      query: q || planRow.employeeName || planRow.employeeNumber,
                    }, 6).map((employee) => (
                      <TouchableOpacity
                        key={employee.id}
                        onPress={() => {
                          setImportPlan((current) => linkImportPlanEmployee(current, row.rowIndex, employee, { applyGroup: true }));
                          setNote(`Koblet til ${displayName(employee)}.`);
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {displayName(employee)}
                          {employee.company?.externalEmployeeNumber
                            ? ` · ${employee.company.externalEmployeeNumber}`
                            : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
                {!planRow.projectId ? (
                  <TouchableOpacity
                    onPress={() => {
                      const hit = projectList.find((project) => (
                        String(project.number) === String(planRow.projectNumber)
                        || (planRow.projectName && project.name === planRow.projectName)
                      ));
                      if (hit) {
                        setImportPlan((current) => linkImportPlanProject(current, row.rowIndex, hit));
                        setNote(`Koblet prosjekt ${hit.number}.`);
                      } else {
                        setError('Fant ikke prosjektet i registeret. Importer prosjektlisten først.');
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>Prøv å koble prosjekt fra registeret</Text>
                  </TouchableOpacity>
                ) : null}
                {!planRow.customerId ? (
                  <>
                    <TextInput
                      value={linkQuery[`${row.id}-c`] || ''}
                      onChangeText={(value) => setLinkQuery((current) => ({ ...current, [`${row.id}-c`]: value }))}
                      placeholder="Søk kunde for å koble…"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                    />
                    {suggestCustomers(customers, {
                      ...planRow,
                      client: planRow.customerName,
                      query: linkQuery[`${row.id}-c`] || '',
                    }, 6).map((customer) => (
                      <TouchableOpacity
                        key={customer.id}
                        onPress={() => {
                          setImportPlan((current) => linkImportPlanCustomer(current, row.rowIndex, customer, { applyGroup: true }));
                          setNote(`Koblet til ${customer.name}.`);
                        }}
                        accessibilityRole="button"
                      >
                        <Text style={{ color: colors.brand }}>
                          {customer.name}
                          {customer.customerNumber ? ` · ${customer.customerNumber}` : ''}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </>
                ) : null}
              </View>
            );
          }}
        />
      </ScrollView>
    );
  }

  const selectedEmployeeName = employeeFilter
    ? (employeeOptions.find((row) => row.id === employeeFilter)?.name
      || displayName(employees.find((row) => row.id === employeeFilter))
      || 'Medarbeider')
    : 'Velg medarbeider';

  if (stackRows && view === 'list') {
    return (
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.phoneInner}
        keyboardShouldPersistTaps="handled"
        nativeID="economy-hours"
      >
        <View style={styles.phoneTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.crumb, { color: colors.muted }]}>Arbeid / Timerapport</Text>
            <Text style={[styles.heading, { color: colors.ink }]} numberOfLines={1}>{selectedEmployeeName}</Text>
          </View>
          <TouchableOpacity
            onPress={importFile}
            disabled={busy || !resolvedFamilyId}
            accessibilityRole="button"
            accessibilityLabel="Importer timer"
            style={[styles.primaryBtn, styles.primaryBtnCompact, { backgroundColor: colors.brand, opacity: busy || !resolvedFamilyId ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryBtnText}>{busy ? '…' : 'Importer'}</Text>
          </TouchableOpacity>
        </View>

        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
        <ImportResult colors={colors} result={importReport} />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusChips}>
          {employeeOptions.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setEmployeeFilter(item.id)}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: employeeFilter === item.id ? colors.brand : colors.card }]}
            >
              <Text style={{ color: employeeFilter === item.id ? '#fff' : colors.ink }} numberOfLines={1}>
                {item.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TimesheetDayView
          colors={colors}
          dateKey={selectedDay}
          totalHours={daySheet.totalHours}
          onPrevDay={() => setSelectedDay((day) => shiftDateKey(day, -1))}
          onNextDay={() => setSelectedDay((day) => shiftDateKey(day, 1))}
          emptyText={employeeFilter
            ? 'Ingen prosjekt med timer denne dagen. Bytt dag eller importer Excel.'
            : 'Velg medarbeider for å se timelisten.'}
          rows={daySheet.rows.map((row) => ({
            ...row,
            onPress: row.id ? () => openProject?.(row.id) : undefined,
            testID: `economy-timesheet-${row.number || row.id}`,
          }))}
        />
      </ScrollView>
    );
  }

  const organizePanel = (
    <HoursOrganizePanel
      colors={colors}
      query={query}
      onQuery={(value) => {
        setQuery(value);
        if (importReport) setImportReport(null);
      }}
      period={period}
      onPeriod={setPeriod}
      fromDate={fromDate}
      toDate={toDate}
      onFromDate={setFromDate}
      onToDate={setToDate}
      groupBy={groupBy}
      onGroupBy={setGroupBy}
      sort={sort}
      onSort={setSort}
      visibleColumns={visibleColumns}
      onToggleColumn={(key) => setVisibleColumns((current) => toggleColumn(current, key))}
      onResetColumns={() => setVisibleColumns(DEFAULT_HOUR_COLUMNS)}
      employeeId={employeeFilter}
      onEmployee={setEmployeeFilter}
      employees={employeeOptions}
      customerId={customerFilter}
      onCustomer={setCustomerFilter}
      customers={facets.customers}
      projectId={projectFilter}
      onProject={setProjectFilter}
      projects={facets.projects}
      activityName={activityFilter}
      onActivity={setActivityFilter}
      activities={facets.activities}
      billable={billableFilter}
      onBillable={setBillableFilter}
      onReset={resetOrganize}
      onClose={stackRows ? () => setPanelOpen(false) : undefined}
    />
  );

  const table = (
    <View style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth: tableMin }}>
          <View style={[styles.tr, styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
            {columns.map((column) => (
              <Text key={column.key} style={[styles.th, columnStyle(column), { color: colors.muted }]}>{column.label}</Text>
            ))}
          </View>
          <FlatList
            data={groupedList}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => {
              if (item.type === 'header') {
                return (
                  <View style={[styles.groupHead, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}>
                    <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.label}</Text>
                    <Text style={{ color: colors.muted }}>{formatHours(item.hours)} · {item.count}</Text>
                  </View>
                );
              }
              return renderListRow({ item: item.row });
            }}
            style={{ maxHeight: 720 }}
            initialNumToRender={24}
            ListEmptyComponent={(
              <View style={{ padding: 16 }}>
                <Text style={{ color: colors.muted }}>
                  Ingen timer i dette utvalget. Juster filteret til høyre, eller importer en timeliste.
                </Text>
              </View>
            )}
            ListFooterComponent={visible.length > pageRows.length ? (
              <TouchableOpacity
                onPress={() => setPageSize((n) => n + 80)}
                accessibilityRole="button"
                style={{ padding: 14, alignItems: 'center' }}
              >
                <Text style={{ color: colors.brand, fontWeight: '600' }}>
                  Vis flere ({pageRows.length} av {visible.length})
                </Text>
              </TouchableOpacity>
            ) : null}
          />
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-hours">
      <View style={styles.desk}>
        <View style={styles.mainCol}>
          <View style={styles.toolbar}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[styles.crumb, { color: colors.muted }]}>Arbeid / Timerapport</Text>
              <Text style={[styles.heading, { color: colors.ink }]}>Timerapport</Text>
              <Text style={{ color: colors.muted }}>
                {ready
                  ? `${entries.length} registrerte føringer · ${formatHours(totals.hours)} vist`
                  : 'Laster timer…'}
              </Text>
            </View>
            {stackRows ? (
              <TouchableOpacity
                onPress={() => setPanelOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel="Organiser visningen"
                nativeID="hours-organize-toggle"
                style={[styles.ghostBtn, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>Organiser</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={importFile}
              disabled={busy || !resolvedFamilyId}
              accessibilityRole="button"
              accessibilityLabel="Importer timer"
              style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: busy || !resolvedFamilyId ? 0.6 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>{busy ? 'Jobber…' : 'Importer Excel'}</Text>
            </TouchableOpacity>
          </View>

          {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
          {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
          {!!progress && <Text style={{ color: colors.muted }}>{progress}</Text>}
          <ImportResult colors={colors} result={importReport} />

          <View style={styles.summaryRow}>
            <Text style={{ color: colors.muted }}>Timer {formatHours(totals.hours)}</Text>
            <Text style={{ color: colors.muted }}>Fakturerbart {formatHours(totals.billable)}</Text>
            <Text style={{ color: colors.muted }}>{totals.count} føringer</Text>
          </View>

          {table}
        </View>
        {(!stackRows || panelOpen) ? organizePanel : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'flex-start', gap: 14 },
  desk: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 16, paddingBottom: 48, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 14 },
  phoneInner: { padding: 12, paddingBottom: 40, gap: 12 },
  phoneTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  crumb: { fontSize: 12, marginBottom: 2 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  ghostBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, minWidth: 480 },
  heading: { fontSize: 22, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnCompact: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  filters: { gap: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 42 },
  statusChips: { gap: 8, paddingVertical: 2 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  head: { paddingVertical: 8 },
  th: { fontSize: 12, fontWeight: '700' },
  td: { fontSize: 13 },
});
