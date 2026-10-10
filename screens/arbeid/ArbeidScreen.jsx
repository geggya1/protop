import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { watchEmployees } from '../../src/employees/storage';
import {
  addAbsence,
  addProjectMember,
  emptyProjectState,
  projectsForEmployee,
  toggleMemberStar,
  upsertTimeEntry,
  deleteTimeEntry,
} from '../../src/project/engine';
import {
  loadProjectState,
  peekProjectState,
  putProjectState,
  saveProjectState,
} from '../../src/project/storage';
import {
  ABSENCE_TYPES,
  canManageTimesheets,
  employeeDisplayName,
  findLinkedEmployee,
} from '../../src/arbeid/roles.js';
import {
  agreedHoursForDay,
  buildMonthGrid,
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
import TimeEntryModal from '../../components/arbeid/TimeEntryModal';
import TimesheetDayView from '../../components/arbeid/TimesheetDayView';

const CELL_W = 44;
const LABEL_W = 280;
const TOTAL_W = 64;
const DAILY = 7.5;

function dayLabel(day) {
  return `${day.weekday} ${day.day}`;
}

function entryKey(projectId, date) {
  return `${projectId}|${date}`;
}

export default function ArbeidScreen() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId, family, user, isAdmin, requestShellTab } = useApp();
  const access = useCompanyAccess();
  const uid = user?.uid || null;

  const cached = peekProjectState(familyId);
  const [state, setState] = useState(() => cached || emptyProjectState());
  const [employees, setEmployees] = useState([]);
  const [ready, setReady] = useState(!!cached);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const skipSave = useRef(true);

  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [employeeId, setEmployeeId] = useState('');
  const [projectQuery, setProjectQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState(toDateKey(today));
  const [editor, setEditor] = useState(null);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [absenceForm, setAbsenceForm] = useState({ type: 'ferie', hours: '7:30', description: '', date: '' });

  useEffect(() => {
    let live = true;
    const warm = peekProjectState(familyId);
    if (warm) {
      setState(warm);
      setReady(true);
      skipSave.current = true;
    }
    loadProjectState(familyId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
      skipSave.current = true;
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setEmployees([]);
      return undefined;
    }
    return watchEmployees(familyId, setEmployees, () => setEmployees([]));
  }, [familyId]);

  useEffect(() => {
    if (!ready) return;
    putProjectState(state, familyId);
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    saveProjectState(state, familyId).catch(() => setError('Kunne ikke lagre timeføring.'));
  }, [state, ready, familyId]);

  const linked = useMemo(() => findLinkedEmployee(employees, uid), [employees, uid]);
  const manager = access.ready
    ? (isAdmin || access.can('hoursOthers', 'write'))
    : canManageTimesheets({ isAdmin, employee: linked });

  useEffect(() => {
    if (employeeId) return;
    if (linked?.id) setEmployeeId(linked.id);
    else if (manager && employees[0]?.id) setEmployeeId(employees[0].id);
  }, [linked, employees, manager, employeeId]);

  const selectedEmployee = employees.find((row) => row.id === employeeId) || linked;
  const selectedName = employeeDisplayName(selectedEmployee) || 'Medarbeider';

  const { days, weeks } = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);
  const todayKey = toDateKey(today);

  const selectedGrants = useMemo(
    () => (selectedEmployee ? grantsForEmployee(family?.company?.accessPolicy, selectedEmployee) : null),
    [family?.company?.accessPolicy, selectedEmployee],
  );
  const assignedOnly = selectedGrants ? hoursOnAssignedOnly(selectedGrants) : false;

  const myProjects = useMemo(() => {
    if (!employeeId) return [];
    const list = projectsForEmployee(state, employeeId, { assignedOnly });
    const q = projectQuery.trim().toLowerCase();
    const members = state.members.filter((row) => row.employeeId === employeeId && row.active !== false);
    const starred = new Set(members.filter((row) => row.starred).map((row) => row.projectId));
    const roleByProject = new Map(members.map((row) => [row.projectId, row]));
    return list
      .map((project) => ({
        project,
        member: roleByProject.get(project.id),
        starred: starred.has(project.id),
      }))
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
  }, [state, employeeId, projectQuery, assignedOnly]);

  const joinable = useMemo(() => {
    if (!employeeId || assignedOnly) return [];
    const mine = new Set(myProjects.map((row) => row.project.id));
    return projectsForEmployee(state, employeeId, { includeJoinable: true })
      .filter((project) => !mine.has(project.id));
  }, [state, employeeId, myProjects, assignedOnly]);

  const entriesByCell = useMemo(() => {
    const map = new Map();
    for (const row of state.timeEntries) {
      if (row.employeeId !== employeeId) continue;
      const key = entryKey(row.projectId, row.date);
      const prev = map.get(key);
      if (!prev) map.set(key, { ...row });
      else {
        map.set(key, {
          ...prev,
          hours: roundHours(parseHours(prev.hours) + parseHours(row.hours)),
          ids: [...(prev.ids || [prev.id]), row.id],
        });
      }
    }
    return map;
  }, [state.timeEntries, employeeId]);

  const agreedByDay = useMemo(() => {
    const map = new Map();
    for (const day of days) map.set(day.key, agreedHoursForDay(day.date, DAILY));
    return map;
  }, [days]);

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

  const balanceCells = useMemo(() => {
    let running = 0;
    // Startbalanse: sum før denne måneden
    for (const row of state.timeEntries) {
      if (row.employeeId !== employeeId) continue;
      if (row.date < days[0]?.key) running += parseHours(row.hours);
    }
    for (const row of state.absences) {
      if (row.employeeId !== employeeId) continue;
      if (row.date < days[0]?.key) running += parseHours(row.hours);
    }
    // Trekk avtalte arbeidsdager før måneden (forenklet: bare månedlig delta)
    const cells = [];
    for (const day of days) {
      const delta = (workedByDay.get(day.key) || 0) - (agreedByDay.get(day.key) || 0);
      running = roundHours(running + delta);
      cells.push(running);
    }
    return cells;
  }, [state.timeEntries, state.absences, employeeId, days, workedByDay, agreedByDay]);

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
    const key = entryKey(project.id, day.key);
    const existing = entriesByCell.get(key);
    const activities = state.activities.filter((row) => row.projectId === project.id);
    setEditor({
      project,
      day,
      entry: existing,
      activities,
    });
  }

  function saveEntry(payload) {
    if (!editor || !employeeId) return;
    const result = upsertTimeEntry(state, {
      id: payload.id || editor.entry?.id,
      projectId: editor.project.id,
      employeeId,
      employeeName: selectedName,
      date: editor.day.key,
      hours: payload.hours,
      description: payload.description,
      internalNote: payload.internalNote,
      activityId: payload.activityId,
      activityName: payload.activityName,
      timeType: payload.timeType || 'ordinary',
      createdByUid: uid,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setEditor(null);
    setNote('Timer lagret.');
    setError('');
  }

  function removeEntry(id) {
    const result = deleteTimeEntry(state, id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setEditor(null);
    setNote('Føring slettet.');
  }

  function joinProject(project) {
    const result = addProjectMember(state, {
      projectId: project.id,
      employeeId,
      employeeName: selectedName,
      photoUrl: selectedEmployee?.person?.photoUrl,
      role: selectedEmployee?.company?.projectRole || 'Prosjektmedlem',
      addedByUid: uid,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setAddProjectOpen(false);
    setNote(`Lagt til ${project.name} i listen.`);
  }

  function starProject(memberId) {
    if (!memberId) return;
    const result = toggleMemberStar(state, memberId);
    if (result.ok) setState(result.state);
  }

  function saveAbsence() {
    const date = absenceForm.date || selectedDay || todayKey;
    const result = addAbsence(state, {
      employeeId,
      employeeName: selectedName,
      date,
      hours: parseHours(absenceForm.hours),
      type: absenceForm.type,
      description: absenceForm.description,
      createdByUid: uid,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setState(result.state);
    setAbsenceOpen(false);
    setNote('Fravær registrert.');
  }

  function monthNav(delta) {
    const next = shiftMonth(year, monthIndex, delta);
    setYear(next.year);
    setMonthIndex(next.monthIndex);
  }

  const gridMinWidth = LABEL_W + days.length * CELL_W + TOTAL_W;

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
        <Text style={[styles.title, { color: colors.ink }]}>Arbeid</Text>
        <Text style={{ color: colors.muted, marginTop: 8, maxWidth: 480 }}>
          Registrer medarbeidere under Ansatte før timeføring. Deretter kan de legges inn som deltakere på prosjekt.
        </Text>
        <TouchableOpacity
          onPress={() => requestShellTab?.('ansatte')}
          style={[styles.cta, { backgroundColor: colors.brand, marginTop: 16 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Gå til Ansatte</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!linked && !manager) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Arbeid</Text>
        <Text style={{ color: colors.muted, marginTop: 8, maxWidth: 480 }}>
          Kontoen din er ikke koblet til en medarbeider. En administrator kan knytte brukeren din under Ansatte, så timeføringen vises her.
        </Text>
        <TouchableOpacity
          onPress={() => requestShellTab?.('ansatte')}
          style={[styles.cta, { backgroundColor: colors.brand, marginTop: 16 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Gå til Ansatte</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeDay = days.find((day) => day.key === selectedDay)
    || days.find((day) => day.key === todayKey)
    || days[0];
  const activeKey = activeDay?.key || selectedDay;
  const activeBalance = balanceCells[Math.max(0, days.findIndex((day) => day.key === activeKey))] || 0;
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

  const actions = (
    <View style={[styles.footer, isPhone && styles.footerPhone]}>
      {assignedOnly ? null : (
      <TouchableOpacity
        onPress={() => setAddProjectOpen(true)}
        style={[styles.cta, { backgroundColor: '#0d9488' }, isPhone && styles.ctaPhone]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>Legg til prosjekt</Text>
      </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={() => {
          setAbsenceForm({ type: 'ferie', hours: '7:30', description: '', date: activeKey || todayKey });
          setAbsenceOpen(true);
        }}
        style={[styles.cta, { backgroundColor: '#0f766e' }, isPhone && styles.ctaPhone]}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.ctaText}>Legg til fravær / ferie</Text>
      </TouchableOpacity>
      {assignedOnly ? null : (
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

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }]} nativeID="arbeid-screen">
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.crumb, { color: colors.muted }]}>Arbeid / Timeføring</Text>
          <TouchableOpacity
            onPress={() => manager && setEmpPickerOpen(true)}
            style={styles.empBtn}
            disabled={!manager}
            accessibilityRole="button"
          >
            {selectedEmployee?.person?.photoUrl ? (
              <Image source={{ uri: selectedEmployee.person.photoUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: `${colors.brand}22` }]}>
                <Ionicons name="person" size={16} color={colors.brand} />
              </View>
            )}
            <Text style={[styles.title, { color: colors.ink }]}>{selectedName}</Text>
            {manager ? <Ionicons name="chevron-down" size={18} color={colors.muted} /> : null}
          </TouchableOpacity>
        </View>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => monthNav(-1)} hitSlop={12} accessibilityRole="button" style={styles.navHit}>
            <Ionicons name="chevron-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: colors.ink }]}>{monthLabel(year, monthIndex)}</Text>
          <TouchableOpacity onPress={() => monthNav(1)} hitSlop={12} accessibilityRole="button" style={styles.navHit}>
            <Ionicons name="chevron-forward" size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      {note ? <Text style={{ color: colors.brand, marginBottom: 6 }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 6 }}>{error}</Text> : null}

      <View style={[styles.searchWrap, isPhone && styles.searchWrapPhone, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Ionicons name="search" size={16} color={colors.muted} />
        <TextInput
          value={projectQuery}
          onChangeText={setProjectQuery}
          placeholder="Finn prosjekt"
          placeholderTextColor={colors.placeholder}
          style={[styles.search, { color: colors.ink }]}
        />
      </View>

      <View
        style={[styles.reportPanel, isPhone && styles.reportPanelPhone, { borderColor: colors.line, backgroundColor: colors.card }]}
        nativeID="arbeid-report-panel"
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>
            Rapport · {monthLabel(year, monthIndex)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
            {formatHours(monthReport.hours)} t · {formatHours(monthReport.billableHours)} fakturerbart
            {monthReport.overtimeHours ? ` · ${formatHours(monthReport.overtimeHours)} overtid` : ''}
            {' · '}
            {monthReport.approvedCount}/{monthReport.count} godkjent
          </Text>
        </View>
        <TouchableOpacity
          onPress={exportMonthCsv}
          style={[styles.ctaGhost, { borderColor: colors.line, flexDirection: 'row', gap: 6 }]}
          accessibilityRole="button"
          accessibilityLabel="Eksporter timer som CSV"
          nativeID="arbeid-export-csv"
        >
          <Ionicons name="download-outline" size={16} color={colors.ink} />
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Eksporter CSV</Text>
        </TouchableOpacity>
      </View>

      {isPhone ? (
        <ScrollView
          style={styles.phoneScroll}
          contentContainerStyle={styles.phoneScrollContent}
          keyboardShouldPersistTaps="handled"
          nativeID="arbeid-phone-timeliste"
        >
          <Text style={[styles.crumb, { color: colors.muted, marginBottom: 0 }]}>Arbeid / Timeliste</Text>
          <TimesheetDayView
            colors={colors}
            dateKey={activeKey}
            totalHours={workedByDay.get(activeKey) || 0}
            locked={false}
            onPrevDay={() => shiftSelected(-1)}
            onNextDay={() => shiftSelected(1)}
            emptyText="Ingen prosjekt i listen. Legg til prosjekt du er deltaker på, eller be en leder legge deg inn på prosjektet."
            rows={myProjects.map(({ project, member }) => {
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
                role: member?.role || 'Deltaker',
                hours,
                onPress: () => openCell(project, day),
                testID: `timesheet-row-${project.number || project.id}`,
              };
            })}
          />
          {actions}
        </ScrollView>
      ) : null}
      {!isPhone ? (
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={[styles.gridScroll, { borderColor: colors.line, backgroundColor: colors.card }]}
        contentContainerStyle={{ minWidth: gridMinWidth }}
      >
        <ScrollView nestedScrollEnabled>
          {/* Uker */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]} />
            {weeks.map((week) => (
              <View
                key={`w-${week.week}`}
                style={[
                  styles.weekCell,
                  { width: week.span * CELL_W, borderColor: colors.line, backgroundColor: colors.sunken || colors.bg },
                ]}
              >
                <Text style={{ color: colors.muted, fontSize: 11 }}>Uke {week.week}</Text>
              </View>
            ))}
            <View style={[styles.totalHead, { width: TOTAL_W, borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>Sum</Text>
            </View>
          </View>

          {/* Dager */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Prosjekt</Text>
            </View>
            {days.map((day) => {
              const on = day.key === selectedDay;
              const isToday = day.key === todayKey;
              return (
                <TouchableOpacity
                  key={day.key}
                  onPress={() => setSelectedDay(day.key)}
                  style={[
                    styles.dayHead,
                    {
                      width: CELL_W,
                      borderColor: colors.line,
                      backgroundColor: on || isToday ? `${colors.brand}14` : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: day.weekend ? (colors.danger || '#dc2626') : colors.muted, fontSize: 11 }}>
                    {dayLabel(day)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={[styles.totalHead, { width: TOTAL_W, borderColor: colors.line }]} />
          </View>

          {/* Avtalte timer */}
          <View style={[styles.row, { backgroundColor: colors.sunken || colors.bg }]}>
            <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Avtalte timer</Text>
            </View>
            {days.map((day) => (
              <View key={`a-${day.key}`} style={[styles.cell, { width: CELL_W, borderColor: colors.line }]}>
                <Text style={styles.cellText}>
                  {agreedByDay.get(day.key) ? formatHours(agreedByDay.get(day.key)) : ''}
                </Text>
              </View>
            ))}
            <View style={[styles.totalCell, { width: TOTAL_W, borderColor: colors.line }]}>
              <Text style={styles.cellText}>
                {formatHours([...agreedByDay.values()].reduce((s, n) => s + n, 0))}
              </Text>
            </View>
          </View>

          {/* Timebalanse */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: LABEL_W, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontSize: 13 }}>Timebalanse</Text>
            </View>
            {balanceCells.map((value, index) => (
              <View key={`b-${days[index].key}`} style={[styles.cell, { width: CELL_W, borderColor: colors.line }]}>
                <Text style={[styles.cellText, { color: value >= 0 ? (colors.success || '#16a34a') : (colors.danger || '#dc2626'), fontSize: 10 }]}>
                  {days[index].workday || value !== balanceCells[index - 1] ? formatHours(value, { signed: true, empty: '0:00' }) : ''}
                </Text>
              </View>
            ))}
            <View style={[styles.totalCell, { width: TOTAL_W, borderColor: colors.line }]}>
              <Text style={[styles.cellText, { color: (balanceCells.at(-1) || 0) >= 0 ? (colors.success || '#16a34a') : (colors.danger || '#dc2626') }]}>
                {formatHours(balanceCells.at(-1) || 0, { signed: true })}
              </Text>
            </View>
          </View>

          {/* Prosjektrader */}
          {myProjects.map(({ project, member, starred }) => {
            let monthSum = 0;
            return (
              <View key={project.id} style={styles.row}>
                <View style={[styles.labelCell, styles.projectLabel, { width: LABEL_W, borderColor: colors.line }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }} numberOfLines={1}>
                      #{project.number} {project.name}
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
                      {project.client || '—'} · {member?.role || 'Deltaker'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => starProject(member?.id)} hitSlop={6}>
                    <Ionicons
                      name={starred ? 'star' : 'star-outline'}
                      size={16}
                      color={starred ? (colors.star || '#e2a325') : colors.muted}
                    />
                  </TouchableOpacity>
                </View>
                {days.map((day) => {
                  const cell = entriesByCell.get(entryKey(project.id, day.key));
                  const hours = cell ? parseHours(cell.hours) : 0;
                  monthSum += hours;
                  const on = day.key === selectedDay;
                  return (
                    <TouchableOpacity
                      key={`${project.id}-${day.key}`}
                      onPress={() => openCell(project, day)}
                      style={[
                        styles.cell,
                        styles.cellBtn,
                        {
                          width: CELL_W,
                          borderColor: colors.line,
                          backgroundColor: on ? `${colors.brand}10` : (hours ? `${colors.brand}08` : 'transparent'),
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Registrer timer ${project.name} ${day.key}`}
                    >
                      <Text style={[styles.cellText, hours ? { color: colors.ink, fontWeight: '600' } : { color: colors.placeholder }]}>
                        {hours ? formatHours(hours) : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <View style={[styles.totalCell, { width: TOTAL_W, borderColor: colors.line }]}>
                  <Text style={[styles.cellText, { fontWeight: '600', color: colors.ink }]}>
                    {formatHours(monthSum)}
                  </Text>
                </View>
              </View>
            );
          })}

          {!myProjects.length ? (
            <View style={{ padding: 24 }}>
              <Text style={{ color: colors.muted }}>
                Ingen prosjekt i listen. Legg til prosjekt du er deltaker på, eller be en leder legge deg inn på prosjektet.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </ScrollView>
      ) : null}

      {isPhone ? null : actions}

      <TimeEntryModal
        visible={!!editor}
        colors={colors}
        project={editor?.project}
        dateLabel={editor ? `${dayLabel(editor.day)} · ${editor.day.key}` : ''}
        activities={editor?.activities || []}
        initial={editor?.entry}
        requireDescription={editor?.project?.workSettings?.requireDescription !== false}
        onSave={saveEntry}
        onDelete={removeEntry}
        onClose={() => setEditor(null)}
      />

      {/* Ansattvelger for leder */}
      <Modal transparent visible={empPickerOpen} animationType="fade" onRequestClose={() => setEmpPickerOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setEmpPickerOpen(false)}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Velg medarbeider</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {employees.filter((row) => row.company?.status !== 'former').map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => { setEmployeeId(row.id); setEmpPickerOpen(false); }}
                  style={[styles.sheetRow, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: row.id === employeeId ? '700' : '400' }}>
                    {employeeDisplayName(row)}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {row.company?.accessRole || row.company?.title || ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Pressable>
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
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>Legg til fravær / ferie</Text>
            <Text style={{ color: colors.muted, marginBottom: 6 }}>Type</Text>
            <View style={styles.chipRow}>
              {ABSENCE_TYPES.map((row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setAbsenceForm((f) => ({ ...f, type: row.id }))}
                  style={[
                    styles.chip,
                    {
                      borderColor: absenceForm.type === row.id ? colors.brand : colors.line,
                      backgroundColor: absenceForm.type === row.id ? `${colors.brand}18` : colors.bg,
                    },
                  ]}
                >
                  <Text style={{ color: colors.ink, fontSize: 13 }}>{row.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
              style={[styles.field, { color: colors.ink, borderColor: colors.line }]}
            />
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
  screen: { flex: 1, padding: 16, minHeight: 0 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  crumb: { fontSize: 12, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  empBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navHit: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: 16, fontWeight: '600', minWidth: 140, textAlign: 'center' },
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
  reportPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  reportPanelPhone: { alignSelf: 'stretch' },
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
  sheetTitle: { fontSize: 17, fontWeight: '700', marginBottom: 12 },
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
