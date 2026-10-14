import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { absencePickerTypes, absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import { buildAbsenceOverview, hoursToDays } from '../../src/arbeid/balance.js';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { employeeActivityTab } from '../../src/employees/model.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { useLayout } from '../../src/theme';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { AbsenceReportDesktop, PlannedAbsenceDesktop } from './CompanyAbsenceDesktop';

export { AbsenceOverviewScreen } from './AbsenceOverviewView';

function usePeople(lockedEmployeeId) {
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year - 1}-01-01`,
    toDate: `${year + 1}-12-31`,
  });
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '');
  const activeId = workspace.lockedId || employeeId || workspace.linked?.id || '';
  const employee = workspace.employees.find((row) => row.id === activeId) || workspace.linked;
  return { workspace, activeId, employee, setEmployeeId };
}

function PersonChips({ workspace, activeId, onPick }) {
  const colors = useColors();
  if (!workspace.manager || workspace.lockedId) return null;
  const choices = filterEmployeesForPicker(workspace.employees, '');
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
      {choices.map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => onPick(row.id)}
          style={[styles.chip, { borderColor: row.id === activeId ? colors.brand : colors.line }]}
        >
          <Text style={{ color: colors.ink }}>{employeeDisplayName(row)}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

export function AbsenceReportScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { workspace, activeId, employee, setEmployeeId } = usePeople(lockedEmployeeId);
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const today = toDateKey(new Date());
  const desktopPeople = (workspace.employees || []).filter((row) => employeeActivityTab(row) !== 'trash');
  const names = {};
  for (const row of desktopPeople) names[row.id] = employeeDisplayName(row);
  const rows = useMemo(() => absencePickerTypes().map((type) => {
    const overview = buildAbsenceOverview({
      employeeId: activeId,
      typeId: type.id,
      absences: workspace.state.absences,
      adjustments: workspace.state.absenceAdjustments,
      fullDayHours: fullDay,
      today,
    });
    return { type, summary: overview.summary };
  }).filter((row) => row.summary.used || row.summary.earned || row.summary.planned), [
    activeId, workspace.state.absences, workspace.state.absenceAdjustments, fullDay, today,
  ]);
  if (isDesktop) {
    return (
      <AbsenceReportDesktop
        employees={workspace.manager && !workspace.lockedId ? desktopPeople : desktopPeople.filter((row) => row.id === activeId)}
        names={names}
        absences={workspace.state.absences || []}
        adjustments={workspace.state.absenceAdjustments || []}
        fullDayHours={fullDay}
        today={today}
        canChooseEmployee={!!workspace.manager && !workspace.lockedId}
        lockedEmployeeId={activeId}
      />
    );
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="fravaersrapport">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Fraværsrapport</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Fraværsrapport</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>{employeeDisplayName(employee)}</Text>
      <PersonChips workspace={workspace} activeId={activeId} onPick={setEmployeeId} />
      {rows.map((row) => (
        <View key={row.type.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.type.label}</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>
            Brukt {row.summary.used} · til gode {row.summary.remaining} · planlagt {row.summary.planned}
          </Text>
        </View>
      ))}
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen fravær er registrert for denne personen.</Text> : null}
    </ScrollView>
  );
}

export function PlannedAbsenceScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { workspace, activeId, employee, setEmployeeId } = usePeople(lockedEmployeeId);
  const today = toDateKey(new Date());
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const desktopPeople = (workspace.employees || []).filter((row) => employeeActivityTab(row) !== 'trash');
  const names = {};
  for (const row of desktopPeople) names[row.id] = employeeDisplayName(row);
  const canChooseEmployee = !!workspace.manager && !workspace.lockedId;
  if (isDesktop) {
    return (
      <PlannedAbsenceDesktop
        employees={canChooseEmployee ? desktopPeople : desktopPeople.filter((row) => row.id === activeId)}
        names={names}
        absences={workspace.state.absences || []}
        adjustments={workspace.state.absenceAdjustments || []}
        fullDayHours={fullDay}
        today={today}
        canChooseEmployee={canChooseEmployee}
        lockedEmployeeId={activeId}
      />
    );
  }
  const rows = (workspace.state.absences || [])
    .filter((row) => row.employeeId === activeId && row.date >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="planlagt-fravaer">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Planlagt fravær</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Planlagt fravær</Text>
      <Text style={{ color: colors.muted, marginBottom: 8 }}>{employeeDisplayName(employee)}</Text>
      <PersonChips workspace={workspace} activeId={activeId} onPick={setEmployeeId} />
      {rows.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.date} · {absenceTypeById(row.type).label}</Text>
          <Text style={{ color: colors.muted }}>{hoursToDays(row.hours, fullDay)} dager · {row.description || 'Ingen merknad'}</Text>
        </View>
      ))}
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen planlagt fravær frem i tid.</Text> : null}
    </ScrollView>
  );
}

export function MyOverviewScreen() {
  const colors = useColors();
  const { workspace, activeId, employee } = usePeople('');
  const today = toDateKey(new Date());
  const month = today.slice(0, 7);
  const hours = (workspace.state.timeEntries || [])
    .filter((row) => row.employeeId === activeId && String(row.date || '').startsWith(month))
    .reduce((sum, row) => sum + Number(row.hours || 0), 0);
  const lock = (workspace.state.timesheetLocks || []).find((row) => row.employeeId === activeId);
  const vacation = buildAbsenceOverview({
    employeeId: activeId,
    typeId: 'ferie',
    absences: workspace.state.absences,
    adjustments: workspace.state.absenceAdjustments,
    fullDayHours: Number(workspace.state.fullDayHours) || 7.5,
    today,
  });
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="min-oversikt">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Min oversikt</Text>
      <Text style={[styles.title, { color: colors.ink }]}>{employeeDisplayName(employee) || 'Min oversikt'}</Text>
      <View style={styles.cards}>
        <Card colors={colors} label="Timer denne måneden" value={hours.toFixed(2)} />
        <Card colors={colors} label="Feriedager til gode" value={String(vacation.summary.remaining)} />
        <Card colors={colors} label="Timeliste" value={lock?.throughDate ? `Låst til ${lock.throughDate}` : 'Åpen'} />
      </View>
    </ScrollView>
  );
}

function Card({ colors, label, value }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, minWidth: 180 }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700', marginTop: 4 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 48 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
});
