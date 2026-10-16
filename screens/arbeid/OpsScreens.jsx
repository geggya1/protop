import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { ApprovalsScreen } from './ApprovalsScreen';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

function money(value) {
  if (typeof formatMoney === 'function') return formatMoney(value);
  const n = Number(value) || 0;
  return `${n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

export function ProjectExpensesScreen({ lockedEmployeeId = '', embedded = false } = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const [employeeId, setEmployeeId] = useState(lockedEmployeeId || '');
  const activeId = workspace.lockedId || employeeId || workspace.linked?.id || '';
  const rows = (workspace.state?.expenses || []).filter((row) => !activeId || row.employeeId === activeId);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="prosjektutlegg">
      {hostedHero || embedded ? null : (
        <>
          <Text style={[styles.crumb, { color: colors.muted }]}>Medarbeidere / Prosjektutlegg</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Prosjektutlegg</Text>
        </>
      )}
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

export { ProductSalesScreen } from './ProductSalesScreen';

export { ApprovalsScreen };

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
