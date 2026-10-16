import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { hrControlCells } from '../../src/hr/directory';
import { companyProductivity } from '../../src/hr/productivity';
import {
  HrCard, HrChip, HrSectionTitle, HrStat, UtilizationBar,
} from './HrShared';
import { HrFilterBar, HrTable, useHrDirectory } from './HrDirectory';

const PERIODS = [
  { months: 1, label: '1 mnd' },
  { months: 3, label: '3 mnd' },
  { months: 6, label: '6 mnd' },
  { months: 12, label: '12 mnd' },
];

const COLUMNS = [
  { key: 'name', label: 'Navn', width: 200, value: (row) => displayName(row.employee) },
  { key: 'kind', label: 'Type', width: 100, value: (row) => row.cells.kindLabel },
  { key: 'billable', label: 'Fakturerbart', width: 120, value: (row) => row.cells.billableHours },
  { key: 'hours', label: 'Timer', width: 90, value: (row) => row.cells.totalHours },
  { key: 'util', label: 'Fakturerbarhet', width: 130, value: (row) => row.cells.utilization },
];

export default function HrProductivity({
  colors, employees, entries, months = 3, onMonthsChange, onSelectEmployee,
}) {
  const company = useMemo(() => companyProductivity(entries), [entries]);
  const dir = useHrDirectory(employees);
  const rows = useMemo(
    () => dir.rows.map((employee) => ({
      employee,
      cells: hrControlCells(employee, { hr: {}, entries }),
    })),
    [dir.rows, entries],
  );

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Produktivitet"
          subtitle="Utfakturerbare timer mot ikke-fakturerbare — hva vi klarer å få ut av kapasiteten"
        />
        <View style={styles.chips}>
          {PERIODS.map((row) => (
            <HrChip
              key={row.months}
              colors={colors}
              label={row.label}
              active={months === row.months}
              onPress={() => onMonthsChange?.(row.months)}
            />
          ))}
        </View>
        <View style={styles.statRow}>
          <HrStat colors={colors} label="Fakturerbart" value={`${company.billable} t`} />
          <HrStat colors={colors} label="Ikke-fakturerbart" value={`${company.nonBillable} t`} />
          <HrStat colors={colors} label="Totalt" value={`${company.total} t`} />
        </View>
        <UtilizationBar
          colors={colors}
          billablePct={company.utilizationPct}
          targetPct={company.targetPct}
          band={company.band}
        />
        <Text style={[styles.hint, { color: colors.muted }]}>
          Den vertikale streken er målet (standard 75 %). Grønn = på eller over mål.
        </Text>
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Per ansatt"
          subtitle="Klikk en rad for å åpne personen. Registrering av lønn og oppfølging ligger der."
        />
        <HrFilterBar
          colors={colors}
          query={dir.query}
          onQuery={dir.setQuery}
          status={dir.status}
          onStatus={dir.setStatus}
          kind={dir.kind}
          onKind={dir.setKind}
          counts={dir.counts}
        />
        <HrTable
          colors={colors}
          columns={COLUMNS}
          rows={rows}
          rowKey={(row) => row.employee.id}
          emptyText="Ingen ansatte i dette utvalget."
          onPressRow={(row) => onSelectEmployee?.(row.employee.id)}
        />
      </HrCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { fontSize: 13, lineHeight: 18 },
});
