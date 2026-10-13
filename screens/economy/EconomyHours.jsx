import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import { ImportResult } from '../../components/ImportReview';
import HoursImportReview from '../../components/arbeid/HoursImportReview';
import HoursOrganizePanel from '../../components/arbeid/HoursOrganizePanel';
import TimesheetDayView from '../../components/arbeid/TimesheetDayView';
import { loadAnbudState } from '../../src/anbud/storage';
import { importResult } from '../../src/imports/review';
import { pickDocument } from '../../src/utils/media';
import {
  HOUR_IMPORT_ACCEPT,
  buildHourImportReview,
  linkImportPlanCustomer,
  linkImportPlanEmployee,
  linkImportPlanProject,
  toggleHourReviewRow,
} from '../../src/economy/hoursImport.js';
import {
  DEFAULT_HOUR_COLUMNS,
  HOUR_COLUMNS,
  dayTimesheetRows,
  employeeHourOptions,
  filterEmployeeHourOptions,
  filterHours,
  formatDate,
  formatHours,
  groupHours,
  hourFacets,
  hourTotals,
  hydrateHourEntry,
  shiftDateKey,
  sortHours,
} from '../../src/economy/hoursList.js';
import { readHourImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { emptyProjectState, importTimeEntries } from '../../src/project/engine';
import { loadProjectState, persistProjectState, putProjectState } from '../../src/project/storage';
import { saveTimeEntryImport } from '../../src/economy/timeEntryStorage.js';
import { watchEmployees } from '../../src/employees/storage';
import { recordUsage } from '../../src/employees/usageClient';
import { displayName } from '../../src/employees/model.js';
import { parseDate } from '../../src/economy/invoices.js';
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
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empPickerQuery, setEmpPickerQuery] = useState('');
  const pickerSearchRef = useRef(null);
  const [customerFilter, setCustomerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState('');
  // Standard: inneværende år — unngår å filtrere/sortere alle ~30k føringer.
  const [period, setPeriod] = useState('year');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [sort, setSort] = useState('date-desc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_HOUR_COLUMNS);
  const [panelOpen, setPanelOpen] = useState(!isPhone);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { label, done?, total? }
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [pageSize, setPageSize] = useState(60);
  const [selectedDay, setSelectedDay] = useState(() => toDateKey(new Date()));
  const saveChain = useRef(Promise.resolve());

  useEffect(() => {
    let live = true;
    loadProjectState(resolvedFamilyId, { force: true }).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    }).catch((cause) => {
      if (!live) return;
      setError(String(cause?.message || '') || 'Kunne ikke laste timer.');
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

  const employeesById = useMemo(() => {
    const map = new Map();
    for (const employee of employees) {
      if (employee?.id) map.set(employee.id, employee);
    }
    return map;
  }, [employees]);
  const projectsById = useMemo(() => {
    const map = new Map();
    for (const project of projectList) {
      if (project?.id) map.set(project.id, project);
    }
    return map;
  }, [projectList]);
  const customersById = useMemo(() => {
    const map = new Map();
    for (const customer of customers) {
      if (customer?.id) map.set(customer.id, customer);
    }
    return map;
  }, [customers]);
  const hydrateOpts = useMemo(() => ({
    employeesById,
    projectsById,
    customersById,
  }), [employeesById, projectsById, customersById]);

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
  const pageRows = useMemo(
    () => visible.slice(0, pageSize).map((row) => hydrateHourEntry(row, hydrateOpts)),
    [visible, pageSize, hydrateOpts],
  );
  const totals = useMemo(() => hourTotals(visible), [visible]);
  const employeeOptions = useMemo(
    () => employeeHourOptions(
      scoped.map((row) => hydrateHourEntry(row, hydrateOpts)),
      employees,
    ),
    [scoped, employees, hydrateOpts],
  );
  const pickerEmployees = useMemo(
    () => filterEmployeeHourOptions(employeeOptions, empPickerQuery),
    [employeeOptions, empPickerQuery],
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
      const slice = group.rows.slice(0, remaining).map((row) => hydrateHourEntry(row, hydrateOpts));
      remaining -= slice.length;
      slice.forEach((row) => out.push({ type: 'row', id: row.id, row }));
    }
    return out;
  }, [groupBy, groups, pageRows, pageSize, hydrateOpts]);
  const importReview = useMemo(
    () => (importPlan ? buildHourImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );
  const importReadyCount = importReview?.readyCount || 0;

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
    setPageSize(60);
  }, [query, employeeFilter, customerFilter, projectFilter, activityFilter, period, fromDate, toDate, billableFilter, sort, entries.length]);

  useEffect(() => {
    if (!employeeFilter) return;
    if (!employeeOptions.some((row) => row.id === employeeFilter)) setEmployeeFilter('');
  }, [employeeFilter, employeeOptions]);

  useEffect(() => {
    if (!empPickerOpen) {
      setEmpPickerQuery('');
      return undefined;
    }
    const timer = setTimeout(() => pickerSearchRef.current?.focus?.(), 60);
    return () => clearTimeout(timer);
  }, [empPickerOpen]);

  function resetOrganize() {
    setQuery('');
    setEmployeeFilter('');
    setCustomerFilter('');
    setProjectFilter('');
    setActivityFilter('');
    setBillableFilter('');
    setPeriod('year');
    setFromDate('');
    setToDate('');
    setGroupBy('none');
    setSort('date-desc');
    setVisibleColumns(DEFAULT_HOUR_COLUMNS);
  }

  function persist(next) {
    setState(next);
    putProjectState(next, resolvedFamilyId);
    const job = saveChain.current.then(() => persistProjectState(next, resolvedFamilyId));
    saveChain.current = job.catch(() => {});
    return job;
  }

  async function importFile() {
    setError('');
    const file = await pickDocument({ accept: HOUR_IMPORT_ACCEPT });
    if (!file) return;
    if (!employees.length) {
      setError('Fant ingen medarbeidere i Ansatte ennå. Vent til listen er lastet, eller åpne Ansatte og prøv igjen.');
      return;
    }
    setBusy(true);
    setProgress({ label: 'Leser fil…' });
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
        : 'Føringer som allerede finnes i systemet hoppes over. Kontroller medarbeider og prosjekt før lagring.');
      setView('import');
      setProgress(null);
    } catch (cause) {
      const message = String(cause?.message || '');
      setError(/failed to fetch/i.test(message) || (cause?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese timelisten.'));
    } finally {
      setBusy(false);
      setProgress(null);
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
    setProgress({ label: 'Lagrer timer…', done: 0, total: chosen.length });
    try {
      const result = importTimeEntries(state, chosen.map((row) => row.entry));
      if (!result.ok) throw new Error(result.error || 'Kunne ikke importere timer.');
      // Først egen subcollection (tåler store volumer), deretter prosjektstate uten timeEntries-blob.
      putProjectState(result.state, resolvedFamilyId);
      setState(result.state);
      await saveTimeEntryImport(resolvedFamilyId, result.added, {
        onProgress: (done, total) => setProgress({ label: 'Lagrer timer…', done, total }),
      });
      try {
        await persistProjectState(result.state, resolvedFamilyId);
      } catch (projectError) {
        // Timene ligger allerede i timeEntries-subcollection — ikke mist dem.
        console.warn('Prosjektstate etter timeimport', projectError);
      }
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
      setNote(`${result.added.length} timer er lagret i skyen. Medarbeidere er lagt til på prosjektene.`);
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
      const message = String(cause?.message || cause?.code || '');
      setError(
        /permission|insufficient/i.test(message)
          ? 'Mangler tilgang til å lagre timer i skyen.'
          : /exceeds|too big|size|invalid-argument/i.test(message)
            ? 'Kunne ikke lagre: dataene er for store eller ugyldige. Prøv færre rader, eller last siden på nytt og importer igjen.'
            : (message || 'Kunne ikke lagre timene i skyen. Sjekk nettverket og prøv igjen.'),
      );
    } finally {
      setBusy(false);
      setProgress(null);
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

  const busyOverlay = (
    <BrandBusyOverlay
      visible={busy}
      label={progress?.label || 'Jobber…'}
      detail="Vent til operasjonen er ferdig før du går videre."
      done={progress?.done}
      total={progress?.total}
    />
  );

  if (view === 'import' && importPlan && importReview) {
    return (
      <>
      <ScrollView
        nativeID="economy-hours-import"
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.importInner}
        keyboardShouldPersistTaps="handled"
      >
        {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
        <HoursImportReview
          colors={colors}
          review={importReview}
          employees={employees}
          customers={customers}
          projects={projectList}
          busy={busy}
          readyCount={importReadyCount}
          linkQuery={linkQuery}
          setLinkQuery={setLinkQuery}
          title="Kontroller timeimport"
          lead="Fjern rader du ikke vil ha med. Grupper med samme avvik kan tas ut samlet."
          confirmLabel={(count) => `Importer ${count} timer`}
          onToggleCard={(card) => {
            setDropped((current) => toggleHourReviewRow(current, card, importPlan));
          }}
          onToggleOkRow={(id) => {
            setDropped((current) => toggleHourReviewRow(current, { id }, importPlan));
          }}
          onLinkEmployee={(rowIndex, employee) => {
            setImportPlan((current) => linkImportPlanEmployee(current, rowIndex, employee, { applyGroup: true }));
            setNote(`Koblet til ${displayName(employee)}.`);
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkImportPlanProject(current, rowIndex, project, {
              applyGroup: true,
              customers,
            }));
            setNote(`Koblet prosjekt ${project.number || project.name}.`);
          }}
          onLinkCustomer={(rowIndex, customer) => {
            setImportPlan((current) => linkImportPlanCustomer(current, rowIndex, customer, { applyGroup: true }));
            setNote(`Koblet til ${customer.name}.`);
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
        />
      </ScrollView>
      {busyOverlay}
      </>
    );
  }

  const selectedEmployeeName = employeeFilter
    ? (employeeOptions.find((row) => row.id === employeeFilter)?.name
      || displayName(employees.find((row) => row.id === employeeFilter))
      || 'Medarbeider')
    : 'Velg medarbeider';

  const canSwitchEmployee = employeeOptions.length > 1;

  if (stackRows && view === 'list') {
    return (
      <>
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bg }]}
        contentContainerStyle={styles.phoneInner}
        keyboardShouldPersistTaps="handled"
        nativeID="economy-hours"
      >
        <View style={styles.phoneTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.crumb, { color: colors.muted }]}>Arbeid / Timerapport</Text>
            <TouchableOpacity
              onPress={() => canSwitchEmployee && setEmpPickerOpen(true)}
              disabled={!canSwitchEmployee}
              activeOpacity={canSwitchEmployee ? 0.7 : 1}
              accessibilityRole="button"
              accessibilityLabel={canSwitchEmployee ? 'Skift person' : selectedEmployeeName}
              nativeID="economy-employee-name"
              style={styles.nameBtn}
            >
              <Text style={[styles.headingPhone, { color: colors.ink, flexShrink: 1 }]} numberOfLines={1}>
                {selectedEmployeeName}
              </Text>
              {canSwitchEmployee ? <Ionicons name="chevron-down" size={16} color={colors.muted} /> : null}
            </TouchableOpacity>
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
      <Modal transparent visible={empPickerOpen} animationType="fade" onRequestClose={() => setEmpPickerOpen(false)}>
        <View style={styles.modalBg}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEmpPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk medarbeidervelger"
          />
          <View
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessibilityViewIsModal
          >
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Velg medarbeider</Text>
            <View style={[styles.pickerSearch, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                ref={pickerSearchRef}
                value={empPickerQuery}
                onChangeText={setEmpPickerQuery}
                placeholder="Søk medarbeider"
                placeholderTextColor={colors.placeholder}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.pickerSearchInput, { color: colors.ink }]}
                accessibilityLabel="Søk medarbeider"
                nativeID="economy-employee-picker-search"
              />
              {empPickerQuery ? (
                <TouchableOpacity
                  onPress={() => setEmpPickerQuery('')}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Tøm søk"
                >
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {pickerEmployees.length ? pickerEmployees.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => { setEmployeeFilter(row.id); setEmpPickerOpen(false); }}
                  style={[styles.sheetRow, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: row.id === employeeFilter ? '700' : '400' }}>
                    {row.name}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{formatHours(row.hours)}</Text>
                </TouchableOpacity>
              )) : (
                <Text style={{ color: colors.muted, paddingVertical: 12 }}>
                  {empPickerQuery.trim()
                    ? `Ingen treff for «${empPickerQuery.trim()}».`
                    : 'Ingen medarbeidere å velge.'}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
      {busyOverlay}
      </>
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
      onFromDate={(value) => setFromDate(value)}
      onToDate={(value) => setToDate(value)}
      onFromDateBlur={() => setFromDate((current) => parseDate(current) || current)}
      onToDateBlur={() => setToDate((current) => parseDate(current) || current)}
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
          {/* Enkel liste (paginert) — FlatList i horizontal ScrollView virtualiserer dårlig og bruker mer minne. */}
          <View style={{ maxHeight: 720 }} nativeID="economy-hours-table-body">
            <ScrollView nestedScrollEnabled>
              {!groupedList.length ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: colors.muted }}>
                    Ingen timer i dette utvalget. Juster filteret til høyre, eller importer en timeliste.
                  </Text>
                </View>
              ) : groupedList.map((item) => {
                if (item.type === 'header') {
                  return (
                    <View
                      key={item.id}
                      style={[styles.groupHead, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink, fontWeight: '700' }}>{item.label}</Text>
                      <Text style={{ color: colors.muted }}>{formatHours(item.hours)} · {item.count}</Text>
                    </View>
                  );
                }
                return (
                  <View key={item.id}>
                    {renderListRow({ item: item.row })}
                  </View>
                );
              })}
              {visible.length > pageRows.length ? (
                <TouchableOpacity
                  onPress={() => setPageSize((n) => n + 60)}
                  accessibilityRole="button"
                  style={{ padding: 14, alignItems: 'center' }}
                >
                  <Text style={{ color: colors.brand, fontWeight: '600' }}>
                    Vis flere ({pageRows.length} av {visible.length})
                  </Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
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
      {busyOverlay}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, maxWidth: 1100, width: '100%', alignSelf: 'flex-start', gap: 14 },
  importInner: { padding: 16, paddingBottom: 48, maxWidth: 1200, width: '100%', alignSelf: 'flex-start', gap: 14 },
  desk: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 16, paddingBottom: 48, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 14 },
  phoneInner: { padding: 12, paddingBottom: 40, gap: 12 },
  phoneTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  nameBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, alignSelf: 'flex-start' },
  crumb: { fontSize: 12, marginBottom: 2 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  ghostBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, minWidth: 480 },
  heading: { fontSize: 22, fontWeight: '700' },
  headingPhone: { fontSize: 16, fontWeight: '600' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnCompact: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  filters: { gap: 10 },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '80%',
    zIndex: 2,
    position: 'relative',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, outlineStyle: 'none', minHeight: 22 },
  sheetRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    gap: 2,
  },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  head: { paddingVertical: 8 },
  th: { fontSize: 12, fontWeight: '700' },
  td: { fontSize: 13 },
});
