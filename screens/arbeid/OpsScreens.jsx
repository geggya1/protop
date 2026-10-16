import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { formatMoney } from '../../src/economy/invoices.js';
import { ApprovalsScreen } from './ApprovalsScreen';
import { useModuleHeroHosted } from '../../components/ModulePageBg';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';

export { ProjectExpensesScreen } from '../economy/ProjectExpensesScreen';

function money(value) {
  if (typeof formatMoney === 'function') return formatMoney(value);
  const n = Number(value) || 0;
  return `${n.toLocaleString('nb-NO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;
}

export function ProductSalesScreen({ lockedEmployeeId = '' } = {}) {
  const colors = useColors();
  const hostedHero = useModuleHeroHosted();
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const activeId = workspace.lockedId || workspace.linked?.id || '';
  const rows = (workspace.state?.sales || []).filter((row) => !activeId || !row.employeeId || row.employeeId === activeId);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="mine-produktsalg">
      {hostedHero ? null : (
        <>
          <Text style={[styles.crumb, { color: colors.muted }]}>Mine sider / Tid / Mine produktsalg</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Mine produktsalg</Text>
        </>
      )}
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

export { ApprovalsScreen };

const styles = StyleSheet.create({
  body: { padding: 16, gap: 8, paddingBottom: 40 },
  crumb: { fontSize: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  cell: { width: 160, padding: 8, fontSize: 13 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 },
});
