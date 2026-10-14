import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { approveTimesheetLock } from '../../src/arbeid/timesheetState.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

function money(value) {
  if (typeof formatMoney === 'function') return formatMoney(value);
  const n = Number(value) || 0;
  return `${n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

export function ProjectExpensesScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '');
  const activeId = workspace.lockedId || employeeId || workspace.linked?.id || '';
  const rows = (workspace.state.expenses || []).filter((row) => !activeId || row.employeeId === activeId);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="prosjektutlegg">
      <Text style={[styles.crumb, { color: colors.muted }]}>Medarbeidere / Prosjektutlegg</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Prosjektutlegg</Text>
      {workspace.manager && !workspace.lockedId ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {filterEmployeesForPicker(workspace.employees, '').map((row) => (
            <TouchableOpacity key={row.id} onPress={() => setEmployeeId(row.id)} style={[styles.chip, { borderColor: row.id === activeId ? colors.brand : colors.line }]}>
              <Text style={{ color: colors.ink }}>{employeeDisplayName(row)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <View style={[styles.row, { backgroundColor: colors.sunken }]}>
        {['Dato', 'Prosjekt', 'Beskrivelse', 'Beløp', 'Status'].map((label) => (
          <Text key={label} style={[styles.cell, { color: colors.muted, fontWeight: '600' }]}>{label}</Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.id} style={[styles.row, { borderBottomColor: colors.line }]}>
          <Text style={[styles.cell, { color: colors.ink }]}>{row.date}</Text>
          <Text style={[styles.cell, { color: colors.ink }]}>{row.projectNumber ? `#${row.projectNumber}` : '—'} {row.projectName || ''}</Text>
          <Text style={[styles.cell, { color: colors.ink }]}>{row.description || row.purpose || '—'}</Text>
          <Text style={[styles.cell, { color: colors.ink }]}>{money(row.amountInclVat)}</Text>
          <Text style={[styles.cell, { color: colors.ink }]}>{row.status || 'utkast'}</Text>
        </View>
      ))}
      {!rows.length ? <Text style={{ color: colors.muted, padding: 12 }}>Ingen prosjektutlegg er registrert.</Text> : null}
    </ScrollView>
  );
}

export function ProductSalesScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const activeId = workspace.lockedId || workspace.linked?.id || '';
  const rows = (workspace.state.sales || []).filter((row) => !activeId || !row.employeeId || row.employeeId === activeId);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="mine-produktsalg">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Mine produktsalg</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Mine produktsalg</Text>
      {rows.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.date} · {row.name}</Text>
          <Text style={{ color: colors.muted }}>{row.quantity} × {money(row.unitPrice)} · {row.projectName || 'Uten prosjekt'}</Text>
        </View>
      ))}
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen produktsalg er registrert fra timelisten.</Text> : null}
    </ScrollView>
  );
}

export function ApprovalsScreen() {
  const colors = useColors();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    fromDate: `${year}-01-01`,
    toDate: toDateKey(new Date()),
  });
  const locks = (workspace.state.timesheetLocks || []).filter((row) => (
    workspace.manager || row.employeeId === workspace.linked?.id
  ));
  function approve(employeeId) {
    const result = approveTimesheetLock(workspace.state, { employeeId, approvedByUid: workspace.uid });
    if (!result.ok) {
      workspace.setError(result.error);
      return;
    }
    workspace.setState(result.state);
    workspace.setError('');
  }
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="godkjenninger">
      <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Godkjenninger</Text>
      <Text style={[styles.title, { color: colors.ink }]}>Godkjenninger</Text>
      <Text style={{ color: colors.muted }}>Låst timeliste betyr at timene er klare for fakturering.</Text>
      {workspace.error ? <Text style={{ color: colors.danger || '#b42318' }}>{workspace.error}</Text> : null}
      {locks.map((row) => {
        const person = workspace.employees.find((item) => item.id === row.employeeId);
        return (
          <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: row.approvedAt ? colors.card : '#ecfdf5' }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{employeeDisplayName(person) || row.employeeId}</Text>
            <Text style={{ color: colors.muted }}>Låst til {row.throughDate}. {row.approvedAt ? 'Godkjent.' : 'Klar for fakturering.'}</Text>
            {workspace.manager && !row.approvedAt ? (
              <TouchableOpacity onPress={() => approve(row.employeeId)} style={[styles.btn, { backgroundColor: colors.brand }]} nativeID={`approve-lock-${row.employeeId}`}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Godkjenn</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
      {!locks.length ? <Text style={{ color: colors.muted }}>Ingen timelister er låst.</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { width: 160, padding: 8, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
});
