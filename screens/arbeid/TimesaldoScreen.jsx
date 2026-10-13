import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { buildTimesaldo } from '../../src/arbeid/balance.js';
import { agreedHoursForDate } from '../../src/arbeid/holidays.js';
import { scheduledHours, timeSettingsOf } from '../../src/arbeid/schedule.js';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { setBalanceAdjustment } from '../../src/arbeid/timesheetState.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

function todayKey() {
  return toDateKey(new Date());
}

export default function TimesaldoScreen({ lockedEmployeeId = '', companyId = '' } = {}) {
  const colors = useColors();
  const [through, setThrough] = useState(todayKey());
  const year = Number(through.slice(0, 4)) || new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    companyId,
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: through,
  });
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '');
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState('');
  const activeId = workspace.lockedId || employeeId || workspace.linked?.id || '';
  const employee = workspace.employees.find((row) => row.id === activeId) || workspace.linked;
  const settings = timeSettingsOf(employee);
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;

  const report = useMemo(() => buildTimesaldo({
    year,
    throughDate: through,
    employeeId: activeId,
    entries: workspace.state.timeEntries,
    absences: workspace.state.absences,
    adjustments: workspace.state.balanceAdjustments,
    flexCountsAsPay: settings.flexCountsAsPay,
    agreedForDate: (dateKey) => {
      const [yy, mm, dd] = String(dateKey).split('-').map(Number);
      const date = new Date(yy, (mm || 1) - 1, dd || 1);
      const schedule = scheduledHours(employee, date, fullDay);
      return agreedHoursForDate(date, {
        fullDayHours: fullDay,
        redDays: workspace.state.redDays,
        scheduleHours: schedule,
      }).hours;
    },
  }), [year, through, activeId, workspace.state, settings.flexCountsAsPay, employee, fullDay]);

  function saveAdjustment() {
    if (!edit) return;
    const result = setBalanceAdjustment(workspace.state, {
      employeeId: activeId,
      month: edit.month,
      hours: parseHours(draft),
      note: 'Timebank tatt ut i lønn',
    });
    if (!result.ok) {
      workspace.setError(result.error);
      return;
    }
    workspace.setState(result.state);
    workspace.setError('');
    setEdit(null);
  }

  const choices = filterEmployeesForPicker(workspace.employees, '');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="timesaldo-screen">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Timesaldo</Text>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.ink }]}>Timesaldo</Text>
        <View style={styles.through}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Sluttdato</Text>
          <TextInput
            value={through}
            onChangeText={setThrough}
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            accessibilityLabel="Sluttdato"
            nativeID="timesaldo-through"
          />
        </View>
      </View>
      {workspace.manager && !workspace.lockedId ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
          {choices.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => setEmployeeId(row.id)}
              style={[styles.chip, { borderColor: row.id === activeId ? colors.brand : colors.line, backgroundColor: row.id === activeId ? `${colors.brand}18` : colors.card }]}
            >
              <Text style={{ color: colors.ink }}>{employeeDisplayName(row)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        <Text style={{ color: colors.ink, fontWeight: '600', marginBottom: 8 }}>{employeeDisplayName(employee) || 'Medarbeider'}</Text>
      )}
      {workspace.error ? <Text style={{ color: colors.danger || '#b42318', marginBottom: 8 }}>{workspace.error}</Text> : null}
      <Text style={{ color: colors.muted, marginBottom: 10, maxWidth: 640 }}>
        Saldo er timebank. Justering ned brukes når overtid tas ut i lønn.
      </Text>
      <ScrollView horizontal nativeID="timesaldo-table">
        <View>
          <View style={[styles.row, { backgroundColor: colors.sunken || '#f4f4f5' }]}>
            {['Måned', 'Avtalte timer', 'Faktiske timer', 'Med lønn', 'Uten lønn', 'Inkl. overtid', 'Ekskl. overtid', 'Mertid', 'Justering', 'Saldo'].map((label) => (
              <Text key={label} style={[styles.cell, styles.headCell, { color: colors.muted }]}>{label}</Text>
            ))}
          </View>
          {report.rows.map((row) => (
            <View key={row.id} style={[styles.row, { borderBottomColor: colors.line }]}>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '600' }]}>{row.label}</Text>
              {row.kind === 'opening' ? (
                <Text style={[styles.cell, { color: colors.muted }]} />
              ) : (
                <Text style={[styles.cell, { color: colors.ink }]}>
                  {row.partial ? `${formatHours(row.agreed)} (av ${formatHours(row.agreedFull)})` : formatHours(row.agreed)}
                </Text>
              )}
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.actual)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.paidAbsence)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.unpaidAbsence)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.payrollIncl)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.payrollExcl)}</Text>
              <Text style={[styles.cell, { color: colors.ink }]}>{row.kind === 'opening' ? '' : formatHours(row.flex, { signed: true })}</Text>
              <TouchableOpacity
                onPress={() => { setEdit(row); setDraft(formatHours(row.adjustment || 0)); }}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityLabel={`Juster ${row.label}`}
                nativeID={`timesaldo-adjust-${row.month}`}
              >
                <Text style={{ color: colors.ink }}>{formatHours(row.adjustment || 0)}</Text>
                <Ionicons name="pencil" size={12} color={colors.brand} />
              </TouchableOpacity>
              <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(row.saldo)}</Text>
            </View>
          ))}
          <View style={[styles.row, { backgroundColor: colors.sunken || '#f4f4f5' }]}>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>Totalt</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.agreed)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.actual)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.paidAbsence)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.unpaidAbsence)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.payrollIncl)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.payrollExcl)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.flex, { signed: true })}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.adjustment)}</Text>
            <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{formatHours(report.totals.saldo)}</Text>
          </View>
        </View>
      </ScrollView>
      {edit ? (
        <View style={[styles.editor, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="timesaldo-editor">
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Justering · {edit.label}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Negativt tall tar timer ut av timebanken og over i lønn.</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, marginTop: 8 }]}
            accessibilityLabel="Justeringstimer"
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity onPress={() => setEdit(null)} style={[styles.btn, { borderColor: colors.line, borderWidth: 1 }]}>
              <Text style={{ color: colors.ink }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveAdjustment} style={[styles.btn, { backgroundColor: colors.brand }]} nativeID="timesaldo-save">
              <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 4, paddingBottom: 40 },
  crumb: { fontSize: 12, marginBottom: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  through: { gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 140 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  cell: { width: 120, paddingVertical: 10, paddingHorizontal: 8, fontSize: 12 },
  headCell: { fontSize: 11, fontWeight: '600' },
  editor: { marginTop: 16, borderWidth: 1, borderRadius: 12, padding: 12, maxWidth: 420, gap: 4 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
});
