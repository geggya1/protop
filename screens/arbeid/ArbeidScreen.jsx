import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
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
import { grantsForEmployee, hoursOnAssignedOnly } from '../../src/access/companyAccess';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import { watchEmployees } from '../../src/employees/storage';
import { isActiveEmployee, ownEmployee } from '../../src/employees/model';
import { recordUsage } from '../../src/employees/usageClient';
import {
  addAbsence,
  addProjectMember,
  emptyProjectState,
  mergeMemberLists,
  projectsForEmployee,
  upsertTimeEntry,
  deleteAbsence,
  deleteTimeEntry,
} from '../../src/project/engine';
import {
  adoptLoadedHours,
  ensureProjectHours,
  hoursRangeCovered,
  loadProjectState,
  peekProjectState,
  putProjectState,
  saveProjectState,
} from '../../src/project/storage';
import { removeTimeEntry } from '../../src/economy/timeEntryStorage.js';
import {
  canManageTimesheets,
  employeeDisplayName,
  findLinkedEmployee,
} from '../../src/arbeid/roles.js';
import {
  canSwitchTimesheetPerson,
  needsTimesheetPersonStep,
  timesheetCrumb,
  timesheetIdentity,
} from '../../src/arbeid/timesheetIdentity.js';
import {
  buildMonthGrid,
  monthDateRange,
  monthLabel,
  parseDateKey,
  shiftMonth,
  toDateKey,
  weekAround,
} from '../../src/arbeid/calendar.js';
import { formatHours, parseHours, roundHours } from '../../src/arbeid/hours.js';
import {
  entriesToCsv,
  filterTimeEntries,
  reportSummary,
} from '../../src/arbeid/reports.js';
import {
  filterTimesheetProjects,
  timesheetActivityRange,
  timesheetHourWindows,
} from '../../src/arbeid/timesheetProjects.js';
import TimeEntryModal from '../../components/arbeid/TimeEntryModal';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import TimesheetDayView from '../../components/arbeid/TimesheetDayView';
import MonthJump from '../../components/arbeid/MonthJump';
import TimesheetGrid from '../../components/arbeid/TimesheetGrid';
import TimesheetEmployeePicker from '../../components/arbeid/TimesheetEmployeePicker';
import AbsenceTypeModal from '../../components/arbeid/AbsenceTypeModal';
import TimesheetSideForm from '../../components/arbeid/TimesheetSideForm';
import ScrollSheet from '../../components/ScrollSheet';
import BillingChainLine from '../economy/billing/BillingChainLine';
import { agreedHoursForDate, redDayMap, resolveRedDays } from '../../src/arbeid/holidays.js';
import { resolveAbsenceTypes } from '../../src/arbeid/absenceCatalog.js';
import { scheduledHours, timeSettingsOf } from '../../src/arbeid/schedule.js';
import { monthTimebank, payrollHoursOnDate } from '../../src/arbeid/balance.js';
import { loadTimeEntries, readCachedTimeEntries } from '../../src/economy/timeEntryStorage.js';
import { loadAbsences } from '../../src/arbeid/absenceStorage.js';
import { HEALTH_FREE_TEXT_NOTICE, absenceTypeById, isHealthAbsence } from '../../src/arbeid/absenceCatalog.js';
import { isDateLocked } from '../../src/arbeid/locks.js';
import {
  applyTimesheetPrefsPatch,
  lockThroughDate,
  resolveTimesheetPrefs,
  timesheetPrefsPatch,
  toggleTimesheetLock,
} from '../../src/arbeid/timesheetState.js';
import {
  loadTimesheetPrefs,
  peekTimesheetPrefs,
  saveTimesheetPrefs,
} from '../../src/arbeid/timesheetPrefsStorage.js';
import { upsertExpense, upsertSale, upsertTrip } from '../../src/economy/opsState.js';

const DAILY = 8;

function dayLabel(day) {
  return `${day.weekday} ${day.day}`;
}

function entryKey(projectId, date) {
  return `${projectId}|${date}`;
}

function memberSignature(list) {
  return (list || [])
    .map((row) => `${row?.id || ''}|${row?.projectId || ''}|${row?.employeeId || ''}|${row?.starred ? 1 : 0}|${row?.updatedAt || ''}`)
    .sort()
    .join(';');
}

export default function ArbeidScreen({
  lockedEmployeeId = '',
  personal = false,
  companyId = '',
  companyFamily = null,
  embedded = false,
  // Bare visning (begrenset redigering på ansattsiden): ingen føring, flytting eller låsing.
  readOnly: readOnlyProp = false,
  // Skjul tannhjulet (rapport, eksport og utskrift).
  hideReportTools = false,
  // «Legg til prosjekt» viser bare prosjekter personen er registrert i.
  memberProjectsOnly = false,
} = {}) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId, family, user, isAdmin, requestShellTab, shellIntent, clearShellIntent } = useApp();
  const access = useCompanyAccess();
  const uid = user?.uid || null;
  const lockedId = String(lockedEmployeeId || '').trim();
  const workspaceId = String(companyId || '').trim() || familyId;
  const policySource = companyFamily || family;

  const cached = peekProjectState(workspaceId);
  const [state, setState] = useState(() => cached || emptyProjectState());
  const [employees, setEmployees] = useState([]);
  const [ready, setReady] = useState(!!cached);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const skipSave = useRef(true);

  function applyLoadedState(loaded) {
    setState((current) => {
      const next = adoptLoadedHours(current, loaded, workspaceId);
      const keptLocalEdit = memberSignature(next.members) !== memberSignature(loaded?.members);
      if (!keptLocalEdit) skipSave.current = true;
      return next;
    });
  }

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [employeeId, setEmployeeId] = useState(lockedId);
  const [projectQuery, setProjectQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState(toDateKey(today));
  const [editor, setEditor] = useState(null);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empPickerQuery, setEmpPickerQuery] = useState('');
  const pickerSearchRef = useRef(null);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [absenceForm, setAbsenceForm] = useState({ id: '', type: 'ferie', hours: '7:30', description: '', date: '' });
  const [monthJump, setMonthJump] = useState(false);
  const [typePicker, setTypePicker] = useState(false);
  const [sideForm, setSideForm] = useState(null);
  const [carriedHours, setCarriedHours] = useState({ key: '', entries: [], absences: [], failed: false });
  // Stjerner, skjulte prosjekter og faste fraværstyper er personlige og lagres på den ansatte.
  const [prefs, setPrefs] = useState(null);

  // Prosjekt/medlemskap først — ikke vent på hele timehistorikken.
  useEffect(() => {
    let live = true;
    const warm = peekProjectState(workspaceId);
    if (warm) {
      setState(warm);
      setReady(true);
      skipSave.current = true;
    }
    loadProjectState(workspaceId, { hours: false }).then((loaded) => {
      if (!live) return;
      applyLoadedState(loaded);
      setReady(true);
    }).catch(() => {
      if (!live) return;
      skipSave.current = true;
      setReady(true);
      setError('Kunne ikke laste timeføring.');
    });
    return () => { live = false; };
  }, [workspaceId]);

  // Timer for valgt medarbeider: aktivitetsvindu, og eldre måned som eget vindu.
  useEffect(() => {
    if (!ready || !workspaceId || !employeeId) {
      setHoursLoading(false);
      return undefined;
    }
    let live = true;
    const windows = timesheetHourWindows(today, year, monthIndex).map((range) => ({
      ...range,
      employeeId,
    }));
    const missing = windows.filter((range) => !hoursRangeCovered(workspaceId, range));
    if (!missing.length) {
      setHoursLoading(false);
      return undefined;
    }
    setHoursLoading(true);
    Promise.all(missing.map((range) => readCachedTimeEntries(workspaceId, range))).then((groups) => {
      if (!live) return;
      const rows = groups.flat().filter(Boolean);
      if (!rows.length) return;
      skipSave.current = true;
      startTransition(() => {
        setState((current) => adoptLoadedHours(current, { ...current, timeEntries: rows }, workspaceId));
      });
    }).catch(() => {});
    (async () => {
      try {
        let loaded = null;
        for (const range of missing) {
          loaded = await ensureProjectHours(workspaceId, range);
          if (!live) return;
        }
        if (!live) return;
        startTransition(() => {
          if (loaded) applyLoadedState(loaded);
          setHoursLoading(false);
        });
      } catch {
        if (!live) return;
        setHoursLoading(false);
        setError('Kunne ikke laste timer for måneden.');
      }
    })();
    return () => { live = false; };
  }, [ready, workspaceId, year, monthIndex, today, employeeId]);

  useEffect(() => {
    if (!workspaceId) {
      setEmployees([]);
      return undefined;
    }
    return watchEmployees(workspaceId, setEmployees, () => setEmployees([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId || !employeeId) {
      setPrefs(null);
      return undefined;
    }
    let live = true;
    setPrefs(peekTimesheetPrefs(workspaceId, employeeId));
    loadTimesheetPrefs(workspaceId, employeeId).then((loaded) => {
      if (live) setPrefs(loaded);
    }).catch(() => {});
    return () => { live = false; };
  }, [workspaceId, employeeId]);

  useEffect(() => {
    if (!ready) return;
    putProjectState(state, workspaceId);
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    // Timer og fravær går til egne samlinger. Prosjektdokumentet får bare radene som faktisk
    // er endret (lås, medlemskap, utlegg fra sideskjemaet), aldri hele listen fra denne kopien.
    saveProjectState(state, workspaceId).catch(() => setError('Kunne ikke lagre timeføring.'));
  }, [state, ready, workspaceId]);

  const linked = useMemo(() => {
    // «Se som bruker»: timelisten følger personen som vises, ikke innlogget konto.
    const previewed = !personal && access.previewing && access.viewingAs
      ? employees.find((row) => row.id === access.viewingAs.id) || access.viewingAs
      : null;
    const row = previewed || (personal
      ? ownEmployee(employees, {
        uid,
        emails: [user?.email],
        name: user?.displayName || '',
      })
      : findLinkedEmployee(employees, uid));
    if (!row || !isActiveEmployee(row)) return null;
    return row;
  }, [employees, uid, personal, user?.email, user?.displayName, access.previewing, access.viewingAs]);
  // Andres timer følger bare tilgangsstyringen, ikke administratorlisten på selskapet (adminUids).
  const manager = personal
    ? false
    : (access.ready
      ? access.canEdit('hoursOthers')
      : canManageTimesheets({ isAdmin, employee: linked }));
  // Bedriftstimeliste: Lese = bare se. Begrenset redigering på egne timer (eller andres timer for leder) = føre og endre.
  const companyTimesheet = !personal && !lockedId && access.active;
  const rightsReadOnly = companyTimesheet && !manager
    && (!access.ready || !access.canEdit('hours'));
  const readOnly = readOnlyProp || rightsReadOnly;

  useEffect(() => {
    if (lockedId) {
      setEmployeeId(lockedId);
      return;
    }
    if (personal) {
      if (linked?.id) setEmployeeId(linked.id);
      return;
    }
    // Mulige ledere venter på tilgang, så de ikke får auto-valg før steg 1.
    const maybeManager = isAdmin || canManageTimesheets({ isAdmin, employee: linked });
    if (maybeManager && !access.ready) return;
    // Bedriftstimeliste: leder velger person først (steg 1).
    if (manager) return;
    // Bytte av person i «Se som bruker» skal bytte timeliste.
    if (access.previewing && linked?.id) {
      if (employeeId !== linked.id) setEmployeeId(linked.id);
      return;
    }
    if (employeeId) return;
    if (linked?.id) setEmployeeId(linked.id);
  }, [linked, employees, manager, employeeId, lockedId, personal, access.ready, access.previewing, isAdmin]);

  useEffect(() => {
    if (lockedId || personal) return;
    if (!shellIntent || typeof shellIntent !== 'object') return;
    if (shellIntent.type !== 'openTimesheet') return;
    const id = String(shellIntent.employeeId || '').trim();
    if (id) setEmployeeId(id);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent, lockedId, personal]);

  useEffect(() => {
    if (!empPickerOpen) {
      setEmpPickerQuery('');
      return undefined;
    }
    const timer = setTimeout(() => pickerSearchRef.current?.focus?.(), 60);
    return () => clearTimeout(timer);
  }, [empPickerOpen]);

  const selectedEmployee = employees.find((row) => row.id === employeeId) || (!manager ? linked : null);
  const selectedName = employeeDisplayName(selectedEmployee) || 'Medarbeider';

  const { days, weeks } = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);
  const todayKey = toDateKey(today);

  const selectedGrants = useMemo(
    () => (selectedEmployee ? grantsForEmployee(policySource?.company?.accessPolicy, selectedEmployee) : null),
    [policySource?.company?.accessPolicy, selectedEmployee],
  );
  const assignedOnly = selectedGrants ? hoursOnAssignedOnly(selectedGrants) : false;

  const monthFromDate = days[0]?.key || '';
  const monthToDate = days[days.length - 1]?.key || '';

  const activityRange = useMemo(() => timesheetActivityRange(today), [today]);

  const ownPrefs = useMemo(
    () => resolveTimesheetPrefs(state, employeeId, prefs),
    [state.members, state.hiddenTimesheetProjects, state.timesheetPins, employeeId, prefs],
  );

  const myProjects = useMemo(() => {
    if (!employeeId) return [];
    const list = projectsForEmployee(state, employeeId, {
      assignedOnly,
      fromDate: activityRange.fromDate < monthFromDate ? activityRange.fromDate : monthFromDate,
      toDate: activityRange.toDate > monthToDate ? activityRange.toDate : monthToDate,
      includeHourProjects: true,
    });
    const q = projectQuery.trim().toLowerCase();
    const members = state.members.filter((row) => row.employeeId === employeeId && row.active !== false);
    const { starred } = ownPrefs;
    const roleByProject = new Map(members.map((row) => [row.projectId, row]));
    const mapped = list.map((project) => ({
      project,
      member: roleByProject.get(project.id),
      starred: starred.has(project.id),
    }));
    const visible = filterTimesheetProjects(mapped, {
      timeEntries: state.timeEntries,
      employeeId,
      activityFrom: activityRange.fromDate,
      activityTo: activityRange.toDate,
      viewFrom: monthFromDate,
      viewTo: monthToDate,
      keepAll: !!q,
    });
    return visible
      .filter(({ project }) => {
        if (!q) return true;
        return [`#${project.number}`, project.name, project.client, project.manager]
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return String(a.project.number).localeCompare(String(b.project.number), 'nb');
      });
  }, [state, employeeId, projectQuery, assignedOnly, monthFromDate, monthToDate, activityRange, ownPrefs]);

  const joinable = useMemo(() => {
    if (!employeeId || assignedOnly) return [];
    const mine = new Set(myProjects.map((row) => row.project.id));
    return projectsForEmployee(state, employeeId, {
      includeJoinable: !memberProjectsOnly,
      fromDate: monthFromDate,
      toDate: monthToDate,
      includeHourProjects: true,
    })
      .filter((project) => !mine.has(project.id));
  }, [state, employeeId, myProjects, assignedOnly, memberProjectsOnly, monthFromDate, monthToDate]);

  const entriesForCell = useMemo(() => {
    const map = new Map();
    for (const row of state.timeEntries) {
      if (row.employeeId !== employeeId) continue;
      const key = entryKey(row.projectId, row.date);
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [state.timeEntries, employeeId]);

  const entriesByCell = useMemo(() => {
    const map = new Map();
    for (const [key, list] of entriesForCell) {
      const hours = list.reduce((sum, row) => sum + parseHours(row.hours), 0);
      map.set(key, { ...list[0], hours: roundHours(hours), ids: list.map((row) => row.id) });
    }
    return map;
  }, [entriesForCell]);

  const fullDayHours = Number(state.fullDayHours) > 0 ? Number(state.fullDayHours) : DAILY;
  const timeSettings = timeSettingsOf(selectedEmployee);
  const lockThrough = lockThroughDate(state.timesheetLocks, employeeId);
  const redDays = useMemo(() => resolveRedDays(state, [year]), [state.redDays, year]);
  const absenceTypes = useMemo(() => resolveAbsenceTypes(state), [state.absenceTypes, state.absenceTypesCustom]);
  const markedDays = useMemo(() => {
    const marks = redDayMap(redDays);
    return days.map((day) => {
      const mark = marks.get(day.key);
      return {
        ...day,
        red: !!mark || day.weekend,
        half: mark?.portion === 'half',
        name: mark?.name || '',
      };
    });
  }, [days, redDays]);

  const agreedByDay = useMemo(() => {
    const map = new Map();
    for (const day of markedDays) {
      const schedule = scheduledHours(selectedEmployee, day.date, fullDayHours);
      const agreed = agreedHoursForDate(day.date, {
        fullDayHours,
        redDays,
        scheduleHours: schedule,
      });
      map.set(day.key, agreed.hours);
    }
    return map;
  }, [markedDays, selectedEmployee, fullDayHours, redDays]);

  const workedByDay = useMemo(() => {
    const map = new Map();
    for (const day of days) map.set(day.key, 0);
    for (const row of state.timeEntries) {
      if (row.employeeId !== employeeId) continue;
      if (!map.has(row.date)) continue;
      map.set(row.date, roundHours(map.get(row.date) + parseHours(row.hours)));
    }
    for (const row of state.absences) {
      if (row.employeeId !== employeeId) continue;
      if (!map.has(row.date)) continue;
      map.set(row.date, roundHours(map.get(row.date) + parseHours(row.hours)));
    }
    return map;
  }, [state.timeEntries, state.absences, employeeId, days]);

  const hiddenIds = ownPrefs.hidden;
  const shownProjects = myProjects.filter((row) => !hiddenIds.has(row.project.id));
  const hiddenProjects = myProjects.filter((row) => hiddenIds.has(row.project.id));
  const pinnedTypes = ownPrefs.pins;

  const payrollByDay = useMemo(() => {
    const map = new Map();
    for (const day of markedDays) {
      map.set(day.key, payrollHoursOnDate({
        entries: state.timeEntries,
        absences: state.absences,
        employeeId,
        date: day.key,
        flexCountsAsPay: timeSettings.flexCountsAsPay,
        types: absenceTypes,
      }));
    }
    return map;
  }, [markedDays, state.timeEntries, state.absences, employeeId, timeSettings.flexCountsAsPay, absenceTypes]);

  const carriedKey = employeeId ? `${employeeId}:${year}:${monthIndex}` : '';
  const historyReady = !!carriedKey && carriedHours.key === carriedKey && !carriedHours.failed;

  useEffect(() => {
    if (!ready || !workspaceId || !employeeId || hoursLoading) return undefined;
    const fromDate = `${year}-01-01`;
    const monthEnd = monthDateRange(year, monthIndex).toDate;
    const priorEnd = monthIndex === 0 ? '' : monthDateRange(year, monthIndex - 1).toDate;
    let live = true;
    Promise.all([
      priorEnd
        ? loadTimeEntries(workspaceId, { employeeId, fromDate, toDate: priorEnd })
        : Promise.resolve([]),
      loadAbsences(workspaceId, { employeeId, fromDate, toDate: monthEnd }),
    ]).then(([entries, absences]) => {
      if (!live) return;
      setCarriedHours({
        key: carriedKey,
        failed: false,
        entries: Array.isArray(entries) ? entries : [],
        absences: Array.isArray(absences) ? absences : [],
      });
    }).catch(() => {
      if (!live) return;
      setCarriedHours({ key: carriedKey, failed: true, entries: [], absences: [] });
    });
    return () => { live = false; };
  }, [ready, workspaceId, employeeId, year, monthIndex, carriedKey, hoursLoading]);

  const agreedForDate = useMemo(() => (dateKey) => {
    const date = parseDateKey(dateKey);
    if (!date) return 0;
    const schedule = scheduledHours(selectedEmployee, date, fullDayHours);
    return agreedHoursForDate(date, {
      fullDayHours,
      redDays,
      scheduleHours: schedule,
    }).hours;
  }, [selectedEmployee, fullDayHours, redDays]);

  const timebank = useMemo(() => monthTimebank({
    year,
    monthIndex,
    employeeId,
    entries: [...(state.timeEntries || []), ...(historyReady ? carriedHours.entries : [])],
    absences: [...(state.absences || []), ...(historyReady ? carriedHours.absences : [])],
    adjustments: state.balanceAdjustments,
    agreedForDate,
    types: absenceTypes,
  }), [
    year,
    monthIndex,
    employeeId,
    historyReady,
    carriedHours,
    state.timeEntries,
    state.absences,
    state.balanceAdjustments,
    agreedForDate,
    absenceTypes,
  ]);

  const balanceCells = useMemo(
    () => days.map((day) => timebank.byDate.get(day.key) || 0),
    [days, timebank],
  );

  const monthEntries = useMemo(() => {
    const fromDate = days[0]?.key || '';
    const toDate = days[days.length - 1]?.key || '';
    return filterTimeEntries(state.timeEntries, {
      fromDate,
      toDate,
      employeeId,
    });
  }, [state.timeEntries, days, employeeId]);

  const monthReport = useMemo(() => reportSummary(monthEntries), [monthEntries]);

  function exportMonthCsv() {
    const csv = entriesToCsv(monthEntries);
    const filename = `timer-${selectedName.replace(/\s+/g, '-').toLowerCase() || 'rapport'}-${year}-${String(monthIndex + 1).padStart(2, '0')}.csv`;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setNote(`CSV lastet ned (${monthEntries.length} føringer).`);
      return;
    }
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(csv).then(
        () => setNote(`CSV kopiert til utklippstavlen (${monthEntries.length} føringer).`),
        () => setNote('Kunne ikke kopiere CSV. Prøv i nettleser med nedlasting.'),
      );
      return;
    }
    setNote(`CSV klar for ${monthEntries.length} føringer — eksporter via nettleser (web).`);
  }

  function openCell(project, day) {
    if (readOnly) return;
    const key = entryKey(project.id, day.key);
    const activities = state.activities.filter((row) => row.projectId === project.id);
    setEditor({
      project,
      day,
      entries: entriesForCell.get(key) || [],
      activities,
      locked: isDateLocked(lockThrough, day.key),
    });
  }

  function applyResult(result, success) {
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre.');
      return false;
    }
    setState(result.state);
    setError('');
    if (success) {
      setNote(success);
      showSaveToast(success);
    }
    return true;
  }

  async function purgeCloudEntries(ids) {
    for (const id of ids) {
      if (!workspaceId || !id) continue;
      try {
        await removeTimeEntry(workspaceId, id);
      } catch (cause) {
        setError(String(cause?.message || '') || 'Kunne ikke slette føringen i skyen.');
        return false;
      }
    }
    return true;
  }

  async function saveEntry(blocks) {
    if (readOnly) return;
    if (!editor || !employeeId) return;
    const list = Array.isArray(blocks) ? blocks : [blocks];
    const previous = entriesForCell.get(entryKey(editor.project.id, editor.day.key)) || [];
    const kept = new Set(list.filter((row) => row?.id && parseHours(row.hours) > 0).map((row) => row.id));
    let next = state;
    for (const payload of list) {
      const hours = parseHours(payload.hours);
      if (!(hours > 0)) continue;
      const result = upsertTimeEntry(next, {
        id: payload.id,
        projectId: editor.project.id,
        employeeId,
        employeeName: selectedName,
        date: editor.day.key,
        hours,
        description: payload.description,
        internalNote: payload.internalNote,
        activityId: payload.activityId,
        activityName: payload.activityName,
        timeType: payload.timeType || 'ordinary',
        clockIn: payload.clockIn,
        clockOut: payload.clockOut,
        createdByUid: uid,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      next = result.state;
    }
    const removed = [];
    for (const row of previous) {
      if (kept.has(row.id)) continue;
      const result = deleteTimeEntry(next, row.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      next = result.state;
      removed.push(row.id);
    }
    setState(next);
    setEditor(null);
    setNote('Timer lagret.');
    showSaveToast('Timer lagret.');
    setError('');
    if (!(await purgeCloudEntries(removed))) return;
    const hours = list.reduce((sum, row) => sum + parseHours(row.hours), 0);
    recordUsage({
      type: 'hour',
      companyId: workspaceId,
      employeeId,
      summary: [`${roundHours(hours)} t`, editor.day?.key, editor.project?.name].filter(Boolean).join(' · '),
      detail: {
        hours: roundHours(hours),
        date: editor.day?.key || '',
        projectName: editor.project?.name || '',
      },
    }).catch(() => {});
  }

  async function removeEntry(ids) {
    if (readOnly) return;
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    let next = state;
    for (const id of list) {
      const result = deleteTimeEntry(next, id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      next = result.state;
    }
    setState(next);
    setEditor(null);
    setNote('Føring slettet.');
    showSaveToast('Føring slettet.');
    setError('');
    if (!(await purgeCloudEntries(list))) return;
    recordUsage({
      type: 'hour_deleted',
      companyId: workspaceId,
      employeeId,
      summary: 'Slettet timeføring',
      detail: { entryId: list.join(',') },
    }).catch(() => {});
  }

  function moveEntries({ ids, date, projectId }) {
    if (readOnly) return;
    const list = (ids || []).filter(Boolean);
    if (!list.length) return;
    let next = state;
    for (const id of list) {
      const row = next.timeEntries.find((item) => item.id === id);
      if (!row) continue;
      const result = upsertTimeEntry(next, {
        ...row,
        date: date || row.date,
        projectId: projectId || row.projectId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      next = result.state;
    }
    if (applyResult({ ok: true, state: next }, 'Føringen er flyttet.')) setEditor(null);
  }

  function toggleLock(dateKey) {
    if (readOnly) return;
    const result = toggleTimesheetLock(state, {
      employeeId,
      throughDate: dateKey,
      lockedByUid: uid,
    });
    const through = result.ok ? lockThroughDate(result.state.timesheetLocks, employeeId) : '';
    applyResult(result, through
      ? `Timelisten er låst til ${through}. Klar for kontroll.`
      : 'Timelisten er låst opp.');
  }

  /** Personlig valg: skrives på den ansatte, aldri i prosjektdokumentet. */
  function savePrefs(patch, success) {
    if (!patch || !employeeId) return false;
    const id = employeeId;
    setPrefs((current) => applyTimesheetPrefsPatch(current, patch));
    saveTimesheetPrefs(workspaceId, id, patch).then(() => {
      if (success) {
        setNote(success);
        showSaveToast(success);
      }
    }).catch(() => setError('Kunne ikke lagre valget.'));
    setError('');
    return true;
  }

  function hideProject(projectId, hidden) {
    if (readOnly) return;
    savePrefs(timesheetPrefsPatch('hidden', projectId, hidden));
  }

  function savePins(typeIds) {
    if (readOnly) return;
    const wanted = [...new Set((typeIds || []).map((item) => String(item || '').trim()).filter(Boolean))];
    if (savePrefs({ absencePins: wanted }, 'Fraværskategorier oppdatert.')) setTypePicker(false);
  }

  function saveSide(payload) {
    if (readOnly) return;
    if (!sideForm) return;
    const project = state.projects.find((row) => row.id === sideForm.projectId);
    const base = {
      date: sideForm.date,
      employeeId,
      employeeName: selectedName,
      projectId: sideForm.projectId || '',
      projectNumber: project?.number || '',
      projectName: project?.name || '',
      customerName: project?.client || '',
    };
    let result;
    if (sideForm.kind === 'expense') {
      result = upsertExpense(state, {
        ...base,
        description: payload.description,
        category: payload.category,
        amountInclVat: Number(String(payload.amount).replace(',', '.')),
      });
    } else if (sideForm.kind === 'sale') {
      result = upsertSale(state, {
        ...base,
        name: payload.name || payload.description,
        quantity: 1,
        unitPrice: payload.unitPrice,
      });
    } else {
      result = upsertTrip(state, {
        ...base,
        from: payload.from,
        to: payload.to,
        km: payload.km,
        notes: payload.notes,
        purpose: 'duty',
      });
    }
    if (applyResult(result, sideForm.kind === 'expense' ? 'Utlegg lagret.' : (sideForm.kind === 'sale' ? 'Produktsalg lagret.' : 'Bilgodtgjørelse lagret.'))) {
      setSideForm(null);
    }
  }

  function joinProject(project) {
    if (readOnly) return;
    const result = addProjectMember(state, {
      projectId: project.id,
      employeeId,
      employeeName: selectedName,
      photoUrl: selectedEmployee?.person?.photoUrl,
      role: selectedEmployee?.company?.projectRole || 'Prosjektmedlem',
      addedByUid: uid,
      // Uten timer siste to måneder skjules prosjektet. Stjerne holder det synlig.
      starred: true,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    savePrefs(timesheetPrefsPatch('starred', project.id, true));
    setAddProjectOpen(false);
    setNote(`Lagt til ${project.name} i listen.`);
    showSaveToast(`Lagt til ${project.name} i listen.`);
  }

  function starProject(memberId) {
    if (readOnly) return;
    if (!memberId) return;
    const member = state.members.find((row) => row.id === memberId);
    if (!member?.projectId) return;
    savePrefs(timesheetPrefsPatch('starred', member.projectId, !ownPrefs.starred.has(member.projectId)));
  }

  function openAbsenceCell(row, day) {
    if (readOnly) return;
    const existing = (state.absences || []).find((item) => (
      item.employeeId === employeeId && item.date === day.key && (item.type || 'ferie') === row.id
    ));
    const agreed = agreedByDay.get(day.key) || fullDayHours;
    setAbsenceForm({
      id: existing?.id || '',
      type: row.id,
      hours: existing ? formatHours(existing.hours) : formatHours(agreed || fullDayHours),
      description: existing?.description || '',
      date: day.key,
    });
    setAbsenceOpen(true);
  }

  function saveAbsence() {
    if (readOnly) return;
    const date = absenceForm.date || selectedDay || todayKey;
    const hours = parseHours(absenceForm.hours);
    if (!(hours > 0) && absenceForm.id) {
      const removed = deleteAbsence(state, absenceForm.id);
      if (applyResult(removed, 'Fravær fjernet.')) setAbsenceOpen(false);
      return;
    }
    const result = addAbsence(state, {
      id: absenceForm.id,
      employeeId,
      employeeName: selectedName,
      date,
      hours,
      type: absenceForm.type,
      description: absenceForm.description,
      createdByUid: uid,
    });
    if (applyResult(result, 'Fravær registrert.')) setAbsenceOpen(false);
  }

  function printSelection() {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.print) {
      window.print();
      return;
    }
    setNote('Utskrift er tilgjengelig i nettleseren.');
  }

  function monthNav(delta) {
    const next = shiftMonth(year, monthIndex, delta);
    setYear(next.year);
    setMonthIndex(next.monthIndex);
  }

  if (!ready) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted }}>Laster arbeid…</Text>
      </View>
    );
  }

  if (!employees.length) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.ink, fontSize: personal ? 16 : 22, fontWeight: personal ? '600' : '700' }}>
          {personal ? 'Timeliste' : 'Arbeid'}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 8, maxWidth: 480 }}>
          {personal
            ? 'Bedriften har ingen medarbeidere ennå, så timelisten kan ikke åpnes.'
            : 'Registrer medarbeidere under Ansatte før timeføring. Deretter kan de legges inn som deltakere på prosjekt.'}
        </Text>
        {personal ? null : (
          <TouchableOpacity
            onPress={() => requestShellTab?.('ansatte')}
            style={[styles.cta, { backgroundColor: colors.brand, marginTop: 16 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Gå til Ansatte</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Låst til én ansatt (ansattsiden): vis den ansattes timeliste selv om leseren ikke er koblet.
  if (!linked && !manager && !lockedId) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.ink, fontSize: personal ? 16 : 22, fontWeight: personal ? '600' : '700' }}>
          {personal ? 'Timeliste' : 'Arbeid'}
        </Text>
        <Text style={{ color: colors.muted, marginTop: 8, maxWidth: 480 }}>
          {personal
            ? 'Kontoen din er ikke koblet til en medarbeider i denne bedriften, så timelisten kan ikke åpnes for deg.'
            : 'Kontoen din er ikke koblet til en medarbeider. En administrator kan knytte brukeren din under Ansatte, så timeføringen vises her.'}
        </Text>
        {personal ? null : (
          <TouchableOpacity
            onPress={() => requestShellTab?.('ansatte')}
            style={[styles.cta, { backgroundColor: colors.brand, marginTop: 16 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>Gå til Ansatte</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const activeDay = days.find((day) => day.key === selectedDay)
    || days.find((day) => day.key === todayKey)
    || days[0];
  const activeKey = activeDay?.key || selectedDay;
  const phoneWeek = weekAround(parseDateKey(activeKey) || today);

  function selectDate(date) {
    setYear(date.getFullYear());
    setMonthIndex(date.getMonth());
    setSelectedDay(toDateKey(date));
  }

  function shiftSelected(deltaDays) {
    const base = parseDateKey(activeKey) || today;
    selectDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + deltaDays));
  }

  const actions = readOnly ? (rightsReadOnly && access.ready ? (
    <View style={[styles.footer, isPhone && styles.footerPhone]}>
      <Text style={{ color: colors.muted }}>Du har lesetilgang. Timene kan ses, men ikke endres.</Text>
    </View>
  ) : null) : (
    <View style={[styles.footer, isPhone && styles.footerPhone]}>
      {assignedOnly ? null : (
      <TouchableOpacity
        onPress={() => setAddProjectOpen(true)}
        style={[styles.cta, { backgroundColor: colors.brand }, isPhone && styles.ctaPhone]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>Legg til prosjekt</Text>
      </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => setTypePicker(true)}
        style={[styles.cta, { backgroundColor: colors.brand }, isPhone && styles.ctaPhone]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>Legg til fravær / ferie</Text>
      </TouchableOpacity>
      {assignedOnly || (personal && familyId !== workspaceId) ? null : (
      <TouchableOpacity
        onPress={() => requestShellTab?.('projects')}
        style={[styles.ctaGhost, { borderColor: colors.line }, isPhone && styles.ctaPhone]}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.ink }}>Åpne prosjekt</Text>
      </TouchableOpacity>
      )}
    </View>
  );

  const companyLabel = String(policySource?.company?.navn || policySource?.name || '').trim();
  const crumb = timesheetCrumb({ personal, locked: !!lockedId, companyLabel });
  const canSwitchPerson = canSwitchTimesheetPerson({ personal, locked: !!lockedId, manager });
  const needsPersonStep = needsTimesheetPersonStep({
    personal,
    locked: !!lockedId,
    manager,
    employeeId,
  });
  const identity = timesheetIdentity({ personal, compact: isPhone });
  const currentMonthLabel = monthLabel(year, monthIndex);

  // Leder: hvor timene står i kjeden mot faktura (Timer → Godkjenn → Til fakturering → Faktura).
  const chainLine = !personal && !lockedId && !embedded && manager ? (
    <View style={styles.chainLine}>
      <BillingChainLine
        current="timer"
        locks={state.timesheetLocks || []}
        employees={employees.filter(isActiveEmployee)}
      />
    </View>
  ) : null;

  if (needsPersonStep) {
    return (
      <View
        style={[styles.screen, { backgroundColor: colors.bg, position: 'relative' }]}
        nativeID="arbeid-screen"
      >
        {chainLine}
        {embedded ? null : (
          <Text style={[styles.crumb, { color: colors.muted, marginBottom: 8 }]}>{crumb}</Text>
        )}
        <TimesheetEmployeePicker
          colors={colors}
          employees={employees}
          selectedId={employeeId}
          companyName={companyLabel}
          query={empPickerQuery}
          onQueryChange={setEmpPickerQuery}
          onSelect={(row) => {
            setEmployeeId(row.id);
            setEmpPickerQuery('');
          }}
          title="Velg medarbeider"
          subtitle="Steg 1 · Velg intern eller ekstern medarbeider for å åpne timelisten."
        />
        <BrandBusyOverlay
          visible={!ready}
          label="Vent…"
          detail="Henter medarbeidere."
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, personal && styles.screenPersonal, { backgroundColor: colors.bg, position: 'relative' }]} nativeID={personal ? 'personal-timeliste-screen' : 'arbeid-screen'}>
      {chainLine}
      <View style={[styles.topBar, (personal || isPhone) && styles.topBarPersonal, isPhone && styles.topBarPhone]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {embedded ? null : (
            <Text style={[styles.crumb, { color: colors.muted }]}>
              {crumb}
            </Text>
          )}
          {embedded ? null : (
          <TouchableOpacity
            onPress={() => canSwitchPerson && setEmpPickerOpen(true)}
            style={[styles.empBtn, (personal || isPhone) && styles.empBtnPersonal]}
            disabled={!canSwitchPerson}
            activeOpacity={canSwitchPerson ? 0.7 : 1}
            accessibilityRole="button"
            accessibilityLabel={canSwitchPerson ? 'Skift person' : selectedName}
            nativeID="arbeid-employee-name"
          >
            {selectedEmployee?.person?.photoUrl ? (
              <Image
                source={{ uri: selectedEmployee.person.photoUrl }}
                style={[styles.avatar, { width: identity.avatar, height: identity.avatar, borderRadius: identity.avatar / 2 }]}
              />
            ) : (
              <View style={[styles.avatar, { width: identity.avatar, height: identity.avatar, borderRadius: identity.avatar / 2, backgroundColor: `${colors.brand}22` }]}>
                <Ionicons name="person" size={identity.icon} color={colors.brand} />
              </View>
            )}
            <Text
              style={[
                styles.title,
                {
                  color: colors.ink,
                  fontSize: identity.fontSize,
                  fontWeight: identity.fontWeight,
                  flexShrink: personal || isPhone ? 1 : undefined,
                  letterSpacing: personal || isPhone ? 0 : -0.3,
                },
              ]}
              numberOfLines={identity.numberOfLines}
            >
              {selectedName}
            </Text>
            {canSwitchPerson ? <Ionicons name="chevron-down" size={isPhone ? 16 : 18} color={colors.muted} /> : null}
          </TouchableOpacity>
          )}
        </View>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => monthNav(-1)} hitSlop={12} accessibilityRole="button" style={styles.navHit}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMonthJump(true)}
            accessibilityRole="button"
            accessibilityLabel="Velg måned og år"
            nativeID="timesheet-month-label"
          >
            <Text style={[styles.monthLabel, isPhone && styles.monthLabelPhone, { color: colors.ink }]}>{currentMonthLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => monthNav(1)} hitSlop={12} accessibilityRole="button" style={styles.navHit}>
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </TouchableOpacity>
          {readOnly || hideReportTools ? null : (
          <TouchableOpacity
            onPress={() => setReportMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Rapport og eksport"
            accessibilityState={{ expanded: reportMenuOpen }}
            nativeID="arbeid-report-gear"
            style={[styles.gearBtn, { borderColor: reportMenuOpen ? colors.brand : colors.line, backgroundColor: reportMenuOpen ? colors.brandSoft : colors.card, marginLeft: 4 }]}
          >
            <Ionicons name="settings-outline" size={18} color={reportMenuOpen ? colors.brand : colors.ink} />
          </TouchableOpacity>
          )}
        </View>
      </View>
      <MonthJump
        visible={monthJump}
        year={year}
        monthIndex={monthIndex}
        colors={colors}
        onYear={(delta) => setYear((current) => current + delta)}
        onPick={(index) => {
          setMonthIndex(index);
          setMonthJump(false);
        }}
        onClose={() => setMonthJump(false)}
      />
      <ScrollSheet
        visible={reportMenuOpen}
        title={`Rapport · ${currentMonthLabel}`}
        onClose={() => setReportMenuOpen(false)}
      >
        <View nativeID="arbeid-report-panel" style={{ gap: 12 }}>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {formatHours(monthReport.hours)} t · {formatHours(monthReport.billableHours)} fakturerbart
            {monthReport.overtimeHours ? ` · ${formatHours(monthReport.overtimeHours)} overtid` : ''}
            {' · '}
            {monthReport.approvedCount}/{monthReport.count} godkjent
          </Text>
          <TouchableOpacity
            onPress={() => {
              exportMonthCsv();
              setReportMenuOpen(false);
            }}
            style={[styles.ctaGhost, { borderColor: colors.line, flexDirection: 'row', gap: 6, alignSelf: 'flex-start' }]}
            accessibilityRole="button"
            accessibilityLabel="Eksporter timer som CSV"
            nativeID="arbeid-export-csv"
          >
            <Ionicons name="download-outline" size={16} color={colors.ink} />
            <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Eksporter CSV</Text>
          </TouchableOpacity>
          {isPhone ? null : (
            <TouchableOpacity
              onPress={() => {
                setReportMenuOpen(false);
                printSelection();
              }}
              accessibilityRole="button"
              accessibilityLabel="Skriv ut utvalg"
              nativeID="timesheet-print"
              style={[styles.ctaGhost, { borderColor: colors.line, flexDirection: 'row', gap: 6, alignSelf: 'flex-start' }]}
            >
              <Ionicons name="print-outline" size={16} color={colors.ink} />
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Skriv ut utvalg</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollSheet>

      {!ready || hoursLoading ? (
        <Text style={{ color: colors.muted, marginBottom: 6 }}>
          {hoursLoading ? 'Laster timer for måneden…' : 'Henter timeføring…'}
        </Text>
      ) : null}
      {note ? <Text style={{ color: colors.brand, marginBottom: 6 }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 6 }}>{error}</Text> : null}

      <View style={[styles.searchWrap, (isPhone || personal) && styles.searchWrapPhone, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          value={projectQuery}
          onChangeText={setProjectQuery}
          placeholder="Finn prosjekt"
          placeholderTextColor={colors.placeholder}
          style={[styles.search, { color: colors.ink }]}
        />
      </View>

      {isPhone ? (
        <ScrollView
          style={styles.phoneScroll}
          contentContainerStyle={styles.phoneScrollContent}
          keyboardShouldPersistTaps="handled"
          nativeID="arbeid-phone-timeliste"
        >
          <Text style={[styles.crumb, { color: colors.muted, marginBottom: 0 }]}>
            {personal ? 'Timeliste' : 'Arbeid / Timeliste'}
          </Text>
          <TimesheetDayView
            colors={colors}
            dateKey={activeKey}
            totalHours={payrollByDay.get(activeKey) || workedByDay.get(activeKey) || 0}
            locked={isDateLocked(lockThrough, activeKey)}
            onToggleLock={() => toggleLock(activeKey)}
            onPrevDay={() => shiftSelected(-1)}
            onNextDay={() => shiftSelected(1)}
            emptyText="Ingen prosjekt i listen. Legg til prosjekt du er deltaker på, eller be en leder legge deg inn på prosjektet."
            rows={[
              ...pinnedTypes.map((typeId) => {
                const type = absenceTypeById(typeId);
                const hours = (state.absences || []).reduce((sum, row) => (
                  row.employeeId === employeeId && row.date === activeKey && (row.type || 'ferie') === typeId
                    ? sum + parseHours(row.hours)
                    : sum
                ), 0);
                const day = markedDays.find((item) => item.key === activeKey) || activeDay;
                return {
                  id: `abs-${typeId}`,
                  name: type.label,
                  customer: 'Fravær',
                  role: '',
                  hours,
                  onPress: () => openAbsenceCell({ id: typeId, label: type.label }, day),
                  testID: `timesheet-absence-${typeId}`,
                };
              }),
              ...shownProjects.map(({ project, member }) => {
                const cell = entriesByCell.get(entryKey(project.id, activeKey));
                const hours = cell ? parseHours(cell.hours) : 0;
                const day = activeDay?.key === activeKey
                  ? activeDay
                  : phoneWeek.find((item) => item.key === activeKey) || activeDay;
                return {
                  id: project.id,
                  number: project.number,
                  name: project.name,
                  customer: project.client || '',
                  hours,
                  onPress: () => openCell(project, day),
                  testID: `timesheet-row-${project.number || project.id}`,
                };
              }),
            ]}
          />
          {actions}
        </ScrollView>
      ) : null}
      {!isPhone ? (
        <View style={styles.gridBleed}>
          <TimesheetGrid
            colors={colors}
            days={markedDays}
            weeks={weeks}
            monthLabel={currentMonthLabel}
            projects={shownProjects.map(({ project, member, starred }) => ({
              project,
              member,
              starred,
              hoursFor: (day) => {
                const cell = entriesByCell.get(entryKey(project.id, day.key));
                return cell ? parseHours(cell.hours) : 0;
              },
            }))}
            hiddenProjects={hiddenProjects}
            absenceRows={pinnedTypes.map((typeId) => ({
              id: typeId,
              label: absenceTypeById(typeId).label,
              hoursFor: (day) => (state.absences || []).reduce((sum, row) => (
                row.employeeId === employeeId && row.date === day.key && (row.type || 'ferie') === typeId
                  ? sum + parseHours(row.hours)
                  : sum
              ), 0),
            }))}
            agreedByDay={agreedByDay}
            balanceCells={balanceCells}
            incomingBalance={timebank.incoming}
            outgoingBalance={timebank.outgoing}
            balanceReady={historyReady}
            payrollByDay={payrollByDay}
            selectedDay={selectedDay}
            todayKey={todayKey}
            lockThrough={lockThrough}
            showFlex={timeSettings.showFlexInTimesheet}
            onSelectDay={setSelectedDay}
            onToggleLock={toggleLock}
            onOpenProject={openCell}
            onOpenAbsence={openAbsenceCell}
            onToggleStar={starProject}
            onHideProject={(projectId) => hideProject(projectId, true)}
            onShowProject={(projectId) => hideProject(projectId, false)}
          />
        </View>
      ) : null}

      {isPhone ? null : actions}

      <TimeEntryModal
        visible={!!editor}
        colors={colors}
        project={editor?.project}
        dateKey={editor?.day?.key || ''}
        dateLabel={editor ? `${dayLabel(editor.day)} · ${editor.day.key}` : ''}
        activities={editor?.activities || []}
        entries={editor?.entries || []}
        projects={myProjects.map((row) => row.project)}
        requireDescription={editor?.project?.workSettings?.requireDescription !== false}
        requireClock={timeSettings.requireClockTimes}
        locked={!!editor?.locked}
        onSave={saveEntry}
        onDelete={removeEntry}
        onClose={() => setEditor(null)}
        onMove={moveEntries}
        onAddExpense={() => setSideForm({ kind: 'expense', date: editor?.day?.key || '', projectId: editor?.project?.id || '' })}
        onAddSale={() => setSideForm({ kind: 'sale', date: editor?.day?.key || '', projectId: editor?.project?.id || '' })}
        onAddMileage={() => setSideForm({ kind: 'mileage', date: editor?.day?.key || '', projectId: editor?.project?.id || '' })}
      />
      <TimesheetSideForm
        kind={sideForm?.kind || ''}
        colors={colors}
        date={sideForm?.date || ''}
        onClose={() => setSideForm(null)}
        onSave={saveSide}
      />
      <AbsenceTypeModal
        visible={typePicker}
        colors={colors}
        selected={pinnedTypes}
        types={absenceTypes}
        onClose={() => setTypePicker(false)}
        onSave={savePins}
      />

      {/* Ansattvelger for leder (bytte etter steg 1) */}
      <Modal transparent visible={empPickerOpen} animationType="fade" onRequestClose={() => setEmpPickerOpen(false)}>
        <View style={styles.modalBg}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEmpPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Lukk medarbeidervelger"
          />
          <View
            style={[styles.sheet, styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.line }]}
            accessibilityViewIsModal
          >
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Bytt medarbeider</Text>
            <TimesheetEmployeePicker
              colors={colors}
              employees={employees}
              selectedId={employeeId}
              companyName={companyLabel}
              query={empPickerQuery}
              onQueryChange={setEmpPickerQuery}
              searchRef={pickerSearchRef}
              compact
              title="Bytt medarbeider"
              subtitle=""
              onSelect={(row) => {
                setEmployeeId(row.id);
                setEmpPickerOpen(false);
                setEmpPickerQuery('');
              }}
            />
          </View>
        </View>
      </Modal>

      {/* Legg til prosjekt */}
      <Modal transparent visible={addProjectOpen} animationType="fade" onRequestClose={() => setAddProjectOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setAddProjectOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Legg til prosjekt</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {joinable.length ? joinable.map((project) => (
                <TouchableOpacity
                  key={project.id}
                  onPress={() => joinProject(project)}
                  style={[styles.sheetRow, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>#{project.number} {project.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{project.client || 'Kan legges til selv'}</Text>
                </TouchableOpacity>
              )) : (
                <Text style={{ color: colors.muted, padding: 8 }}>
                  Ingen flere prosjekt tilgjengelig. En leder kan legge deg inn som deltaker under Prosjekt → Team.
                </Text>
              )}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      {/* Fravær */}
      <Modal transparent visible={absenceOpen} animationType="fade" onRequestClose={() => setAbsenceOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setAbsenceOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => {}}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>{absenceTypeById(absenceForm.type).label}</Text>
            <Text style={{ color: colors.muted, marginBottom: 8 }}>
              {isDateLocked(lockThrough, absenceForm.date) ? 'Dagen er låst.' : 'Timer på denne dagen'}
            </Text>
            <Text style={{ color: colors.muted, marginBottom: 6, marginTop: 10 }}>Dato (ÅÅÅÅ-MM-DD)</Text>
            <TextInput
              value={absenceForm.date}
              onChangeText={(date) => setAbsenceForm((f) => ({ ...f, date }))}
              style={[styles.field, { color: colors.ink, borderColor: colors.line }]}
            />
            <Text style={{ color: colors.muted, marginBottom: 6, marginTop: 10 }}>Timer</Text>
            <TextInput
              value={absenceForm.hours}
              onChangeText={(hours) => setAbsenceForm((f) => ({ ...f, hours }))}
              style={[styles.field, { color: colors.ink, borderColor: colors.line }]}
            />
            <Text style={{ color: colors.muted, marginBottom: 6, marginTop: 10 }}>Merknad</Text>
            <TextInput
              value={absenceForm.description}
              onChangeText={(description) => setAbsenceForm((f) => ({ ...f, description }))}
              accessibilityLabel="Merknad"
              style={[styles.field, { color: colors.ink, borderColor: colors.line }]}
            />
            {isHealthAbsence(absenceForm.type) ? (
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{HEALTH_FREE_TEXT_NOTICE}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setAbsenceOpen(false)} style={[styles.ctaGhost, { flex: 1, borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveAbsence} style={[styles.cta, { flex: 1, backgroundColor: colors.brand }]}>
                <Text style={styles.ctaText}>Lagre</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chainLine: { marginBottom: 10 },
  screen: { flex: 1, padding: 16, minHeight: 0 },
  screenPersonal: { paddingTop: 8 },
  gridBleed: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
    marginHorizontal: -16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  topBarPersonal: { alignItems: 'center' },
  topBarPhone: { marginBottom: 6, gap: 8 },
  crumb: { fontSize: 12, marginBottom: 4 },
  title: { letterSpacing: -0.3 },
  empBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  empBtnPersonal: { gap: 6, minWidth: 0, flexShrink: 1 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  monthLabelPhone: { fontSize: 15, minWidth: 0 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
    marginBottom: 10,
    maxWidth: 360,
  },
  searchWrapPhone: { maxWidth: '100%', alignSelf: 'stretch' },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneScroll: { flex: 1 },
  phoneScrollContent: { gap: 12, paddingBottom: 28 },
  phoneCard: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, minWidth: 0, minHeight: 52, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center', gap: 2 },
  footerPhone: { flexDirection: 'column', alignItems: 'stretch' },
  search: { flex: 1, fontSize: 14, outlineStyle: 'none' },
  gridScroll: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 280,
  },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  labelCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  projectLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weekCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  dayHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  cell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  cellBtn: { cursor: 'pointer' },
  cellText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  totalHead: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalCell: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
    alignItems: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  ctaText: { color: '#fff', fontWeight: '600' },
  ctaPhone: { alignSelf: 'stretch', justifyContent: 'center' },
  dayStrip: { flexDirection: 'row', gap: 6, paddingBottom: 4 },
  dayChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 64, alignItems: 'center' },
  phoneProject: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  ctaGhost: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
  },
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
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  pickerSheet: { zIndex: 2, maxHeight: '80%', position: 'relative' },
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
  pickerSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 8 : 6,
    marginBottom: 10,
  },
  pickerSearchInput: { flex: 1, fontSize: 14, outlineStyle: 'none', minHeight: 22 },
  sheetRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  field: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
