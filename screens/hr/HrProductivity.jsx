import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { companyProductivity, productivityByEmployee } from '../../src/hr/productivity';
import {
  EmptyHint, HrCard, HrChip, HrSectionTitle, HrStat, UtilizationBar,
} from './HrShared';

const PERIODS = [
  { months: 1, label: '1 mnd' },
  { months: 3, label: '3 mnd' },
  { months: 6, label: '6 mnd' },
  { months: 12, label: '12 mnd' },
];

export default function HrProductivity({
  colors, employees, entries, months = 3, onMonthsChange, onSelectEmployee,
}) {
  const company = useMemo(() => companyProductivity(entries), [entries]);
  const rows = useMemo(
    () => productivityByEmployee(entries, employees),
    [entries, employees],
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
        <HrSectionTitle colors={colors} title="Per medarbeider" />
        {rows.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen timer i perioden. Før timer i Arbeid for å se utnyttelse." />
        ) : rows.map((row) => (
          <View key={row.employeeId} style={[styles.person, { borderColor: colors.line }]}>
            <View style={styles.personHead}>
              <Text
                style={[styles.personName, { color: colors.ink }]}
                onPress={() => onSelectEmployee?.(row.employeeId)}
              >
                {row.employee ? displayName(row.employee) : row.employeeId}
              </Text>
              <Text style={[styles.personMeta, { color: colors.muted }]}>
                {`${row.billable}/${row.total} t · mål ${row.targetPct} %`}
              </Text>
            </View>
            <UtilizationBar
              colors={colors}
              billablePct={row.utilizationPct}
              targetPct={row.targetPct}
              band={row.band}
            />
          </View>
        ))}
      </HrCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  hint: { fontSize: 13, lineHeight: 18 },
  person: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  personHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  personName: { fontSize: 15, fontWeight: '600' },
  personMeta: { fontSize: 12 },
});
