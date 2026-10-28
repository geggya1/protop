import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Platform,
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
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { ImportResult } from '../../components/ImportReview';
import HourPhoneRow from '../../components/arbeid/HourPhoneRow';
import TimeEntryModal from '../../components/arbeid/TimeEntryModal';
import TimesheetDayView from '../../components/arbeid/TimesheetDayView';
import { toDateKey } from '../../src/arbeid/calendar.js';
import HoursImportReview from '../../components/arbeid/HoursImportReview';
import HoursOrganizePanel from '../../components/arbeid/HoursOrganizePanel';
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
  employeeHourOptions,
  filterHours,
  formatDate,
  formatHours,
  groupHours,
  hourFacets,
  hoursOutsideSelection,
  hourTotals,
  periodLoadRange,
  projectFromHourFilter,
  projectsMatchingHourQuery,
  sortHours,
} from '../../src/economy/hoursList.js';
import { readHourImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { emptyProjectState, importTimeEntries } from '../../src/project/engine';
import { projectLookupNumbers } from '../../src/project/projectFields.js';
import {
  applyReportEntryChange,
  applyReportEntryDelete,
  reportEntryEditor,
} from '../../src/economy/hourReportEdit.js';
import {
  adoptLoadedHours,
  ensureProjectHours,
  hoursRangeCovered,
  loadProjectState,
  peekProjectState,
  persistProjectState,
  putProjectState,
} from '../../src/project/storage';
import { readCachedTimeEntries, saveTimeEntryImport } from '../../src/economy/timeEntryStorage.js';
import {
  liveCustomerList, useCompanyDirectory, useCustomers, useEmployees, useProjects,
} from '../../src/context/CompanyDataContext';
import { freshRows, hydrateRows } from '../../src/company/companyData.js';
import { recordUsage } from '../../src/employees/usageClient';
import { displayName } from '../../src/employees/model.js';
import { parseDate } from '../../src/economy/invoices.js';
import { pickableProjects } from '../../src/project/myProjects';
import { useCompanyAiGuard } from '../../src/privacy/useCompanyAi';

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
// Ingen ansattprofil koblet: lås filteret til en id som ikke finnes.
const NO_EMPLOYEE = '__ingen-ansatt__';

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
  lockedEmployeeId = '',
  hideBillable = false,
  embedded = false,
  // Rettighetstrinn: 'read' = åpne uten å endre, 'edit' = endre uten å slette, 'admin' = alt.
  // Tomt: følger Timerapport i tilgangsstyringen.
  rights: rightsProp = '',
}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const { familyId: appFamilyId } = useApp();
  const access = useCompanyAccess();
  const resolvedFamilyId = familyId || appFamilyId;
  const { width, height, isPhone, hasRail, railWidth } = useLayout();
  const rights = rightsProp || (!access.ready
    ? 'read'
    : access.canAdmin('hoursReport') ? 'admin' : access.canEdit('hoursReport') ? 'edit' : 'read');
  const readOnly = rights === 'read';
  const canImport = rights === 'admin';
  // Bedriftsrapporten: uten Admin eller tilgang til andres timer ser man bare egne timer.
  const companyReport = !lockedEmployeeId && !embedded;
  const ownEmployeeId = access.previewing ? (access.viewingAs?.id || '') : (access.employee?.id || '');
  const seesOthers = !companyReport || rights === 'admin' || (access.ready && access.canView('hoursOthers'));
  const lockedId = lockedEmployeeId || (seesOthers ? '' : (ownEmployeeId || NO_EMPLOYEE));
  const contentWidth = width - (hasRail ? railWidth : 0) - 32;
  const stackRows = isPhone || contentWidth < 720;

  const guardAi = useCompanyAiGuard();
  const [state, setState] = useState(() => peekProjectState(resolvedFamilyId) || emptyProjectState());
  // Ansatte, kunder og prosjekter fra skallets lyttere: nye navn slår gjennom uten omlasting.
  const { employees } = useEmployees(resolvedFamilyId);
  const directory = useCompanyDirectory(resolvedFamilyId);
  const liveCustomers = useCustomers(resolvedFamilyId, { enabled: !customersProp.length });
  const liveProjects = useProjects(resolvedFamilyId, { enabled: !projectsProp.length });
  const [anbudCustomers, setAnbudCustomers] = useState([]);
  const [ready, setReady] = useState(() => !!peekProjectState(resolvedFamilyId));
  const [view, setView] = useState('list');
  /** Mobil: listekort vs tabell. */
  const [displayMode, setDisplayMode] = useState('list');
  const [query, setQuery] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState(lockedId);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empQuery, setEmpQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [activityFilter, setActivityFilter] = useState('');
  const [billableFilter, setBillableFilter] = useState('');
  // Standard: siste uke — videre periode lastes via Filtrer/Organiser.
  const [period, setPeriod] = useState('7');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [groupBy, setGroupBy] = useState('none');
  const [sort, setSort] = useState('date-desc');
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_HOUR_COLUMNS);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { label, done?, total? }
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(new Set());
  const [importReport, setImportReport] = useState(null);
  const [linkQuery, setLinkQuery] = useState({});
  const [pageSize, setPageSize] = useState(60);
  const [editing, setEditing] = useState(null);
  const saveChain = useRef(Promise.resolve());
  const loadKeyRef = useRef('');

  // Prosjektstate først, deretter timer for valgt periode (standard siste uke).
  useEffect(() => {
    let live = true;
    loadKeyRef.current = '';
    const warm = peekProjectState(resolvedFamilyId);
    setState(warm || emptyProjectState());
    setReady(!!warm);
    loadProjectState(resolvedFamilyId, { hours: false }).then((loaded) => {
      if (!live) return;
      setState((current) => adoptLoadedHours(current, loaded, resolvedFamilyId));
      setReady(true);
    }).catch((cause) => {
      if (!live) return;
      setError(String(cause?.message || '') || 'Kunne ikke laste timer.');
      setReady(true);
    });
    return () => { live = false; };
  }, [resolvedFamilyId]);

  useEffect(() => {
    if (!ready || !resolvedFamilyId) return undefined;
    const range = periodLoadRange(period, fromDate, toDate);
    if (!range) return undefined;
    const key = range.all
      ? 'all'
      : `${range.fromDate}|${range.toDate}|${range.employeeId || ''}`;
    if (loadKeyRef.current === key) return undefined;
    let live = true;
    if (hoursRangeCovered(resolvedFamilyId, range)) {
      loadKeyRef.current = key;
      const cached = peekProjectState(resolvedFamilyId);
      if (cached) {
        startTransition(() => {
          setState((current) => adoptLoadedHours(current, cached, resolvedFamilyId));
        });
      }
      setHoursLoading(false);
      return undefined;
    }
    setHoursLoading(true);
    readCachedTimeEntries(resolvedFamilyId, range).then((rows) => {
      if (!live || !rows?.length) return;
      startTransition(() => {
        setState((current) => adoptLoadedHours(current, { ...current, timeEntries: rows }, resolvedFamilyId));
      });
    }).catch(() => {});
    ensureProjectHours(resolvedFamilyId, range).then((loaded) => {
      if (!live) return;
      loadKeyRef.current = key;
      startTransition(() => {
        setState((current) => adoptLoadedHours(current, loaded, resolvedFamilyId));
        setHoursLoading(false);
      });
    }).catch((cause) => {
      if (!live) return;
      setHoursLoading(false);
      setError(String(cause?.message || '') || 'Kunne ikke laste periode.');
    });
    return () => { live = false; };
  }, [ready, resolvedFamilyId, period, fromDate, toDate]);

  useEffect(() => {
    if (customersProp.length) return undefined;
    let live = true;
    loadAnbudState(resolvedFamilyId).then((loaded) => {
      if (!live) return;
      setAnbudCustomers(loaded?.customers || []);
    });
    return () => { live = false; };
  }, [resolvedFamilyId, customersProp.length]);

  const loadedEntries = state.timeEntries || [];
  const customers = customersProp.length ? customersProp : liveCustomerList(liveCustomers, anbudCustomers);
  const projectList = useMemo(
    () => (projectsProp.length ? projectsProp : freshRows(state.projects || [], liveProjects)),
    [projectsProp, state.projects, liveProjects],
  );
  const hourLookupProjects = useMemo(() => {
    const selected = projectFromHourFilter(projectList, projectFilter);
    const matched = projectsMatchingHourQuery(projectList, query);
    const map = new Map();
    for (const project of [selected, ...matched].filter(Boolean)) {
      if (project?.id) map.set(project.id, project);
    }
    return [...map.values()].slice(0, 8);
  }, [projectList, projectFilter, query]);
  const hourLookupKey = hourLookupProjects
    .map((project) => `${project.id}:${projectLookupNumbers(project).join(',')}`)
    .join('|');

  useEffect(() => {
    if (!ready || !resolvedFamilyId || !hourLookupProjects.length) return undefined;
    let live = true;
    const targets = hourLookupProjects;
    Promise.all(targets.map((project) => ensureProjectHours(resolvedFamilyId, {
      projectId: project.id,
      projectNumbers: projectLookupNumbers(project),
    }))).then((loadedList) => {
      if (!live) return;
      startTransition(() => {
        setState((current) => loadedList.reduce(
          (acc, loaded) => adoptLoadedHours(acc, loaded, resolvedFamilyId),
          current,
        ));
      });
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, resolvedFamilyId, hourLookupKey]);

  const hydrateOpts = useMemo(() => ({
    directory,
    projects: projectList,
    customers,
  }), [directory, projectList, customers]);
  // Navn, kunde og prosjekt slås opp før filtrering, sortering og gruppering (DS-08),
  // så et nytt navn sorteres og søkes riktig. Kopien på timen er reserve for slettede.
  const entries = useMemo(() => {
    const rows = hydrateRows(loadedEntries, hydrateOpts);
    return lockedId ? filterHours(rows, { employeeId: lockedId }) : rows;
  }, [loadedEntries, lockedId, hydrateOpts]);

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
  const outsidePeriod = useMemo(() => {
    if (period === 'all') return null;
    const gap = hoursOutsideSelection(entries, visible, hourLookupProjects);
    if (!gap) return null;
    const label = hourLookupProjects.length === 1
      ? [hourLookupProjects[0].number, hourLookupProjects[0].name].filter(Boolean).join(' ')
      : 'Prosjektene i søket';
    return { ...gap, label };
  }, [period, entries, visible, hourLookupProjects]);

  const groups = useMemo(() => groupHours(visible, groupBy), [visible, groupBy]);
  const pageRows = useMemo(
    () => visible.slice(0, pageSize),
    [visible, pageSize],
  );
  const totals = useMemo(() => hourTotals(visible), [visible]);
  const employeeOptions = useMemo(
    () => employeeHourOptions(
      scoped,
      employees,
    ),
    [scoped, employees],
  );
  const facets = useMemo(() => hourFacets(scoped), [scoped]);
  const columns = useMemo(() => {
    const keys = new Set(visibleColumns.length ? visibleColumns : DEFAULT_HOUR_COLUMNS);
    const picked = HOUR_COLUMNS.filter((column) => keys.has(column.key) && !(hideBillable && column.key === 'billableHours'));
    return picked.length ? picked : HOUR_COLUMNS.filter((column) => DEFAULT_HOUR_COLUMNS.includes(column.key) && !(hideBillable && column.key === 'billableHours'));
  }, [visibleColumns, hideBillable]);
  const webGrid = Platform.OS === 'web' && !isPhone;
  // Tabellen holder seg innenfor skjermhøyden, så rullefeltene ikke havner under bretten.
  const [gridTop, setGridTop] = useState(0);
  // Web: tabellen slutter ved skjermkanten, så det sidelengse rullefeltet alltid er synlig.
  const tableHeight = webGrid && gridTop
    ? Math.max(320, height - gridTop - 16)
    : Math.max(320, Math.min(height - 160, 900));

  function measureGrid() {
    if (!webGrid || typeof document === 'undefined') return;
    const node = document.getElementById('economy-hours-table-body');
    if (!node) return;
    const top = Math.round(node.getBoundingClientRect().top);
    if (top > 0 && top !== gridTop) setGridTop(top);
  }

  // Meldinger over tabellen kan flytte den uten at størrelsen endres.
  useEffect(() => {
    measureGrid();
  });
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
  const importReview = useMemo(
    () => (importPlan ? buildHourImportReview(importPlan, { dropped }) : null),
    [importPlan, dropped],
  );
  const importReadyCount = importReview?.readyCount || 0;

  useEffect(() => {
    loadKeyRef.current = '';
  }, [resolvedFamilyId]);

  useEffect(() => {
    setPageSize(60);
  }, [query, employeeFilter, customerFilter, projectFilter, activityFilter, period, fromDate, toDate, billableFilter, sort, entries.length]);

  // Låsen kan løsne når tilgangen er lastet (Admin ser alle igjen).
  useEffect(() => {
    setEmployeeFilter(lockedId);
  }, [lockedId]);

  useEffect(() => {
    if (lockedId) return;
    if (!employeeFilter) return;
    if (!employeeOptions.some((row) => row.id === employeeFilter)) setEmployeeFilter('');
  }, [employeeFilter, employeeOptions, lockedId]);

  function resetOrganize() {
    setQuery('');
    setEmployeeFilter(lockedId);
    setCustomerFilter('');
    setProjectFilter('');
    setActivityFilter('');
    setBillableFilter('');
    setPeriod('7');
    setFromDate('');
    setToDate('');
    setGroupBy('none');
    setSort('date-desc');
    setVisibleColumns(DEFAULT_HOUR_COLUMNS);
    loadKeyRef.current = '';
  }

  function persist(next) {
    setState(next);
    putProjectState(next, resolvedFamilyId);
    const job = saveChain.current.then(() => persistProjectState(next, resolvedFamilyId));
    saveChain.current = job.catch(() => {});
    return job;
  }

  async function importFile() {
    if (!canImport) return;
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
        existingEntries: loadedEntries,
        employees,
        customers,
        projects: projectList,
      }, guardAi((payload) => askImportInterpret(payload)));
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
    if (!canImport) return;
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
      showSaveToast(`${result.added.length} timer er lagret i skyen.`);
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

  // Begrenset redigering på andres føringer krever også redigering på «Andres timer».
  function entryRights(row) {
    if (rights !== 'edit') return rights;
    if (!companyReport || (ownEmployeeId && row?.employeeId === ownEmployeeId)) return 'edit';
    return access.canEdit('hoursOthers') ? 'edit' : 'read';
  }

  function openEntry(row) {
    const next = reportEntryEditor(state, row);
    if (!next) return;
    setEditing({ ...next, rights: entryRights(row) });
    setError('');
  }

  async function commitEntryChange(result, success) {
    if (!editing || editing.rights === 'read') return;
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre føringen.');
      return;
    }
    try {
      await persist(result.state);
      setEditing(null);
      setError('');
      setNote(success);
      showSaveToast(success);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre føringen.');
    }
  }

  function saveEditing(blocks) {
    commitEntryChange(applyReportEntryChange(state, editing, blocks), 'Føring lagret.');
  }

  function deleteEditing(ids) {
    if (editing?.rights !== 'admin') return;
    commitEntryChange(applyReportEntryDelete(state, ids), 'Føring slettet.');
  }

  function moveEditing({ ids, date, projectId }) {
    const id = (ids || []).find(Boolean) || editing?.row?.id;
    if (!id) return;
    commitEntryChange(applyReportEntryChange(state, editing, [{
      ...editing.row,
      id,
      hours: editing.row.hours,
      description: editing.row.description,
      date: date || editing.row.date,
      projectId: projectId || editing.row.projectId,
      activityId: editing.row.activityId,
      activityName: editing.row.activityName,
    }]), 'Føringen er flyttet.');
  }

  function renderListRow({ item: row }) {
    return (
      <Pressable
        onPress={() => openEntry(row)}
        accessibilityRole="button"
        accessibilityLabel={`Åpne føring ${formatDate(row?.date)} ${row?.projectName || ''}`.trim()}
        nativeID={row?.id ? `hour-row-${row.id}` : undefined}
        style={[styles.tr, { borderBottomColor: colors.line, backgroundColor: colors.card }]}
      >
        {columns.map((column) => (
          <Text
            key={column.key}
            style={[styles.td, columnStyle(column), { color: colors.ink }]}
            numberOfLines={column.key === 'description' || column.key === 'projectName' || column.key === 'internalNote' ? 2 : 1}
          >
            {cellValue(row, column.key)}
          </Text>
        ))}
      </Pressable>
    );
  }

  const periodHint = outsidePeriod ? (
    <TouchableOpacity
      onPress={() => setPeriod('all')}
      accessibilityRole="button"
      accessibilityLabel="Vis alle timer på prosjektet"
      nativeID="hours-outside-period"
    >
      <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 18 }}>
        {outsidePeriod.label} har {formatHours(outsidePeriod.hours)} timer. {formatHours(outsidePeriod.shown)} vises i valgt periode. Vis alle timer.
      </Text>
    </TouchableOpacity>
  ) : null;

  const rightsNote = rights === 'admin' || !access.ready ? null : (
    <Text style={{ color: colors.muted, fontSize: 13 }} nativeID="economy-hours-rights">
      {readOnly
        ? 'Du har lesetilgang. Føringene kan åpnes, men ikke endres.'
        : 'Du kan endre føringer, men ikke slette dem.'}
    </Text>
  );

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
            showSaveToast(`Koblet til ${displayName(employee)}.`);
          }}
          onLinkProject={(rowIndex, project) => {
            setImportPlan((current) => linkImportPlanProject(current, rowIndex, project, {
              applyGroup: true,
              customers,
            }));
            setNote(`Koblet prosjekt ${project.number || project.name}.`);
            showSaveToast(`Koblet prosjekt ${project.number || project.name}.`);
          }}
          onLinkCustomer={(rowIndex, customer) => {
            setImportPlan((current) => linkImportPlanCustomer(current, rowIndex, customer, { applyGroup: true }));
            setNote(`Koblet til ${customer.name}.`);
            showSaveToast(`Koblet til ${customer.name}.`);
          }}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setView('list'); setDropped(new Set()); }}
        />
      </ScrollView>
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
      showEmployees={!lockedId}
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
      onClose={stackRows || isPhone ? () => setPanelOpen(false) : undefined}
    />
  );

  const emptyHint = (
    <View style={{ padding: 16 }}>
      <Text style={{ color: colors.muted }}>
        {hoursLoading
          ? 'Laster timer…'
          : outsidePeriod
            ? `${outsidePeriod.label} har ${formatHours(outsidePeriod.hours)} timer, men ingen i valgt periode.`
            : 'Ingen timer i dette utvalget. Åpne Filtrer for periode, søk eller sortering — eller importer Excel.'}
      </Text>
    </View>
  );

  const moreButton = visible.length > pageRows.length ? (
    <TouchableOpacity
      onPress={() => setPageSize((n) => n + 60)}
      accessibilityRole="button"
      style={{ padding: 14, alignItems: 'center' }}
    >
      <Text style={{ color: colors.brand, fontWeight: '600' }}>
        Vis flere ({pageRows.length} av {visible.length})
      </Text>
    </TouchableOpacity>
  ) : null;

  const tableHead = (
    <View style={[styles.tr, styles.head, webGrid && styles.stickyHead, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
      {columns.map((column) => (
        <Text key={column.key} style={[styles.th, columnStyle(column), { color: colors.muted }]}>{column.label}</Text>
      ))}
    </View>
  );
  const tableRows = (
    <>
      {!groupedList.length ? emptyHint : groupedList.map((item) => {
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
      {moreButton}
    </>
  );

  // Web: én rulleflate med faste rullefelt i kanten, så opp/ned og sidelengs alltid er synlige.
  const table = webGrid ? (
    <View style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="economy-hours-table">
      <View
        style={[styles.gridScroll, { height: tableHeight }]}
        nativeID="economy-hours-table-body"
        onLayout={measureGrid}
      >
        <View style={{ minWidth: tableMin }}>
          {tableHead}
          {tableRows}
        </View>
      </View>
    </View>
  ) : (
    <View style={[styles.tableWrap, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="economy-hours-table">
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth: Math.max(tableMin, isPhone ? contentWidth : tableMin) }}>
          {tableHead}
          <View style={{ maxHeight: isPhone ? undefined : tableHeight }} nativeID="economy-hours-table-body">
            <ScrollView nestedScrollEnabled={!isPhone} showsVerticalScrollIndicator>
              {tableRows}
            </ScrollView>
          </View>
        </View>
      </ScrollView>
    </View>
  );

  const phoneList = (
    <View style={[styles.listWrap, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="economy-hours-list">
      {!groupedList.length ? emptyHint : groupedList.map((item) => {
        if (item.type === 'header') {
          return (
            <View
              key={item.id}
              style={[styles.listGroupHead, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}
            >
              <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>{item.label}</Text>
              <Text style={{ color: colors.muted }}>{formatHours(item.hours)} · {item.count}</Text>
            </View>
          );
        }
        return <HourPhoneRow key={item.id} row={item.row} colors={colors} onPress={openEntry} />;
      })}
      {moreButton}
    </View>
  );

  const entryModal = (
    <TimeEntryModal
      visible={!!editing}
      colors={colors}
      project={editing?.project}
      dateKey={editing?.row?.date || ''}
      dateLabel={editing ? `${formatDate(editing.row.date)} · ${editing.project?.name || editing.row.projectName || ''}` : ''}
      activities={editing?.activities || []}
      entries={editing ? [editing.row] : []}
      projects={pickableProjects(state, editing?.row?.employeeId ? { id: editing.row.employeeId } : null, employees, {
        all: !access.active || rights === 'admin' || (access.ready && access.canAdmin('projects')),
        keepId: editing?.project?.id || '',
      })}
      requireDescription={editing?.project?.workSettings?.requireDescription !== false}
      locked={!!editing?.locked}
      readOnly={editing?.rights === 'read'}
      canDelete={editing?.rights === 'admin'}
      onSave={saveEditing}
      onDelete={deleteEditing}
      onClose={() => setEditing(null)}
      onMove={moveEditing}
    />
  );

  const filterModal = (
    <Modal transparent visible={panelOpen} animationType="slide" onRequestClose={() => setPanelOpen(false)}>
      <View style={styles.modalBg}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setPanelOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Lukk filter"
        />
        <View
          style={[styles.filterSheet, { backgroundColor: colors.bg, borderColor: colors.line }]}
          accessibilityViewIsModal
          nativeID="hours-filter-sheet"
        >
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            {organizePanel}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const modeToggle = (
    <View
      style={[styles.modeTrack, { borderColor: colors.line, backgroundColor: colors.sunken || '#f4f6f9' }]}
      accessibilityRole="tablist"
      accessibilityLabel="Visning"
      nativeID="hours-display-mode"
    >
      <TouchableOpacity
        onPress={() => setDisplayMode('list')}
        accessibilityRole="tab"
        accessibilityState={{ selected: displayMode === 'list' }}
        style={[styles.modeSeg, displayMode === 'list' && { backgroundColor: colors.card }, displayMode === 'list' && styles.modeSegOn]}
      >
        <Text style={{ color: displayMode === 'list' ? colors.ink : colors.muted, fontWeight: displayMode === 'list' ? '600' : '500', fontSize: 13 }}>
          Liste
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => setDisplayMode('table')}
        accessibilityRole="tab"
        accessibilityState={{ selected: displayMode === 'table' }}
        style={[styles.modeSeg, displayMode === 'table' && { backgroundColor: colors.card }, displayMode === 'table' && styles.modeSegOn]}
      >
        <Text style={{ color: displayMode === 'table' ? colors.ink : colors.muted, fontWeight: displayMode === 'table' ? '600' : '500', fontSize: 13 }}>
          Tabell
        </Text>
      </TouchableOpacity>
    </View>
  );

  const pickedEmployee = employees.find((row) => row.id === (lockedId || employeeFilter));
  const employeeChoices = employees.filter((row) => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return true;
    return displayName(row).toLowerCase().includes(q);
  });
  const employeeHeading = (
    <>
      <TouchableOpacity
        onPress={() => { if (!lockedId) setEmpPickerOpen(true); }}
        disabled={!!lockedId}
        nativeID="economy-employee-name"
        accessibilityRole="button"
        accessibilityLabel={pickedEmployee ? displayName(pickedEmployee) : 'Velg medarbeider'}
      >
        <Text style={{ color: colors.ink, fontWeight: '700' }}>
          {pickedEmployee
            ? displayName(pickedEmployee)
            : lockedId === NO_EMPLOYEE ? 'Ingen ansattprofil er koblet til brukeren' : 'Alle medarbeidere'}
        </Text>
      </TouchableOpacity>
      <Modal transparent visible={empPickerOpen} animationType="fade" onRequestClose={() => setEmpPickerOpen(false)}>
        <Pressable style={styles.pickerBg} onPress={() => setEmpPickerOpen(false)}>
          <Pressable style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => {}}>
            <TextInput
              value={empQuery}
              onChangeText={setEmpQuery}
              placeholder="Søk medarbeider"
              placeholderTextColor={colors.placeholder}
              nativeID="economy-employee-picker-search"
              style={[styles.pickerInput, { color: colors.ink, borderColor: colors.line }]}
            />
            <ScrollView style={{ maxHeight: 280 }}>
              <TouchableOpacity onPress={() => { setEmployeeFilter(''); setEmpPickerOpen(false); }} style={styles.pickerRow}>
                <Text style={{ color: colors.ink }}>Alle medarbeidere</Text>
              </TouchableOpacity>
              {employeeChoices.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => { setEmployeeFilter(row.id); setEmpPickerOpen(false); }}
                  style={styles.pickerRow}
                >
                  <Text style={{ color: colors.ink, fontWeight: row.id === employeeFilter ? '700' : '400' }}>{displayName(row)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );

  if (isPhone && view === 'list') {
    return (
      <>
        <ScrollView
          style={[styles.screen, { backgroundColor: colors.bg }]}
          contentContainerStyle={styles.phoneInner}
          keyboardShouldPersistTaps="handled"
          nativeID="economy-hours"
        >
          <View style={styles.phoneTop}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              {hostedHero || embedded ? null : (
                <>
                  <Text style={[styles.crumb, { color: colors.muted }]}>Arbeid / Timerapport</Text>
                  <Text style={[styles.headingPhone, { color: colors.ink }]}>Timerapport</Text>
                </>
              )}
              {embedded ? null : employeeHeading}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {!ready || hoursLoading
                  ? 'Laster timer…'
                  : `${formatHours(totals.hours)} · ${totals.count} føringer`}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setPanelOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Filtrer og sorter"
              nativeID="hours-organize-toggle"
              style={[styles.ghostBtn, styles.ghostBtnCompact, { borderColor: colors.line }]}
            >
              <Ionicons name="options-outline" size={18} color={colors.ink} />
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Filtrer</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.phoneActions}>
            {modeToggle}
            {!canImport ? null : (
            <TouchableOpacity
              onPress={importFile}
              disabled={busy || !resolvedFamilyId}
              accessibilityRole="button"
              accessibilityLabel="Importer timer"
              style={[styles.primaryBtn, styles.primaryBtnCompact, { backgroundColor: colors.brand, opacity: busy || !resolvedFamilyId ? 0.6 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>{busy ? '…' : 'Importer'}</Text>
            </TouchableOpacity>
            )}
          </View>

          {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
          {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
          <ImportResult colors={colors} result={importReport} />

          <View style={styles.summaryRow}>
            <Text style={{ color: colors.muted }}>Timer {formatHours(totals.hours)}</Text>
            {hideBillable ? null : <Text style={{ color: colors.muted }}>Fakt. {formatHours(totals.billable)}</Text>}
            <Text style={{ color: colors.muted }}>{totals.count} føringer</Text>
          </View>
          {periodHint}
          {rightsNote}

          {hideBillable ? (
            <TimesheetDayView
              colors={colors}
              dateKey={toDateKey(new Date())}
              totalHours={totals.hours}
              rows={[]}
              emptyText="Føringene for perioden står under."
            />
          ) : null}
          {displayMode === 'table' ? table : phoneList}
        </ScrollView>
        {filterModal}
        {entryModal}
        {busyOverlay}
      </>
    );
  }

  // Innebygd (ansattsiden) har verten fast høyde, så rapporten må rulle selv.
  const Shell = embedded ? ScrollView : View;
  const shellProps = embedded
    ? { contentContainerStyle: styles.embeddedInner, keyboardShouldPersistTaps: 'handled' }
    : {};
  return (
    <Shell style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="economy-hours" {...shellProps}>
      <View style={styles.desk}>
        <View style={styles.mainCol}>
          <View style={styles.toolbar}>
            <View style={{ flex: 1, gap: 4 }}>
              {hostedHero || embedded ? null : (
                <>
                  <Text style={[styles.crumb, { color: colors.muted }]}>Arbeid / Timerapport</Text>
                  <Text style={[styles.heading, { color: colors.ink }]}>Timerapport</Text>
                </>
              )}
              {embedded ? null : employeeHeading}
              <Text style={{ color: colors.muted }}>
                {!ready || hoursLoading
                  ? 'Laster timer…'
                  : `${entries.length} lastet · ${formatHours(totals.hours)} vist`}
              </Text>
            </View>
            {stackRows ? (
              <TouchableOpacity
                onPress={() => setPanelOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Filtrer og sorter"
                nativeID="hours-organize-toggle"
                style={[styles.ghostBtn, { borderColor: colors.line }]}
              >
                <Ionicons name="options-outline" size={18} color={colors.ink} />
                <Text style={{ color: colors.ink, fontWeight: '600' }}>Filtrer</Text>
              </TouchableOpacity>
            ) : null}
            {!canImport ? null : (
            <TouchableOpacity
              onPress={importFile}
              disabled={busy || !resolvedFamilyId}
              accessibilityRole="button"
              accessibilityLabel="Importer timer"
              style={[styles.primaryBtn, { backgroundColor: colors.brand, opacity: busy || !resolvedFamilyId ? 0.6 : 1 }]}
            >
              <Text style={styles.primaryBtnText}>{busy ? 'Jobber…' : 'Importer Excel'}</Text>
            </TouchableOpacity>
            )}
          </View>

          {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
          {!!note && <Text style={{ color: colors.ink }}>{note}</Text>}
          <ImportResult colors={colors} result={importReport} />

          <View style={styles.summaryRow}>
            <Text style={{ color: colors.muted }}>Timer {formatHours(totals.hours)}</Text>
            {hideBillable ? null : <Text style={{ color: colors.muted }}>Fakturerbart {formatHours(totals.billable)}</Text>}
            <Text style={{ color: colors.muted }}>{totals.count} føringer</Text>
          </View>
          {periodHint}
          {rightsNote}

          {table}
        </View>
        {!stackRows ? organizePanel : null}
      </View>
      {stackRows ? filterModal : null}
      {entryModal}
      {busyOverlay}
    </Shell>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  embeddedInner: { flexGrow: 1 },
  importInner: { padding: 16, paddingBottom: 48, maxWidth: 1200, width: '100%', alignSelf: 'flex-start', gap: 14 },
  desk: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 16, paddingBottom: 48, width: '100%' },
  mainCol: { flex: 1, minWidth: 0, gap: 14 },
  phoneInner: { padding: 12, paddingBottom: 40, gap: 12, width: '100%' },
  phoneTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  phoneActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  crumb: { fontSize: 12, marginBottom: 2 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  ghostBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ghostBtnCompact: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  modeTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  modeSeg: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    minWidth: 64,
    alignItems: 'center',
  },
  modeSegOn: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minWidth: 480,
  },
  listGroupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heading: { fontSize: 22, fontWeight: '700' },
  headingPhone: { fontSize: 20, fontWeight: '700' },
  primaryBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnCompact: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  pickerBg: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  pickerSheet: { borderWidth: 1, borderRadius: 12, padding: 12, maxWidth: 420, width: '100%', alignSelf: 'center' },
  pickerInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 8 },
  pickerRow: { paddingVertical: 10 },
  filterSheet: {
    maxHeight: '88%',
    zIndex: 2,
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  tableWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', width: '100%' },
  listWrap: { borderWidth: 1, borderRadius: 12, overflow: 'hidden', width: '100%' },
  tr: { flexDirection: 'row', alignItems: 'flex-start', borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 10, gap: 8 },
  head: { paddingVertical: 8 },
  // scroll (ikke auto): rullefeltene står fast også når innholdet får plass.
  gridScroll: { overflowX: 'scroll', overflowY: 'scroll', width: '100%' },
  stickyHead: { position: 'sticky', top: 0, zIndex: 2 },
  th: { fontSize: 12, fontWeight: '700' },
  td: { fontSize: 13 },
});
