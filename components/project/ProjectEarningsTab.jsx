import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatHours } from '../../src/arbeid/hours';
import { formatMoney } from '../../src/economy/invoices';
import { pct, projectEarnings, yearCapacity } from '../../src/economy/earnings';
import { useEarningsSettings } from '../../src/economy/useEarningsSettings';
import { loadHrState } from '../../src/hr/storage';

function money(value) {
  if (value == null) return '—';
  return formatMoney(value);
}

export default function ProjectEarningsTab({
  project,
  entries = [],
  employees = [],
  contracts = [],
  familyId = '',
  colors,
  hoursLoading = false,
}) {
  const { settings, ready } = useEarningsSettings(familyId);
  const [salaries, setSalaries] = useState([]);

  useEffect(() => {
    if (!familyId) return undefined;
    let live = true;
    loadHrState(familyId).then((state) => {
      if (live) setSalaries(state?.salaries || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  const yearHoursById = useMemo(() => {
    const map = {};
    for (const employee of employees || []) {
      if (employee?.id) map[employee.id] = yearCapacity(employee);
    }
    return map;
  }, [employees]);
  const result = useMemo(() => projectEarnings({
    project,
    entries,
    employees,
    salaries,
    settings,
    contracts,
    yearHoursById,
  }), [project, entries, employees, salaries, settings, contracts, yearHoursById]);

  return (
    <View nativeID="project-earnings" style={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink }]}>Inntjening</Text>
      <Text style={{ color: colors.muted, lineHeight: 18 }}>
        Honoraret bruker timeprisen som gjelder på prosjektet den dagen timen ble ført.
        Kostnaden er personens årskostnad fordelt etter disponible timer, fratrukket ferie.
      </Text>
      {!ready || hoursLoading ? <Text style={{ color: colors.muted }}>Henter timer og satser…</Text> : null}
      {!result.rows.length && !hoursLoading ? (
        <Text style={{ color: colors.muted }}>Ingen timer er ført på prosjektet.</Text>
      ) : null}
      {result.rows.map((row) => (
        <View key={row.employeeId} nativeID={`project-earnings-${row.employeeId}`} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Timer {formatHours(row.hours)} · fakturerbare {formatHours(row.billableHours)} · grad {pct(row.billablePercent)}
          </Text>
          <Text style={{ color: colors.ink }}>
            Timepris {row.rate == null ? '—' : formatMoney(row.rate)}
            {row.rateExact ? '' : ' · standardsats, prosjektpris mangler'}
          </Text>
          <Text style={{ color: colors.ink }}>Honorar {money(row.revenue)}</Text>
          <Text style={{ color: colors.ink }}>
            Kostnad {row.cost == null ? 'Ingen disponible timer for personen' : money(row.cost)}
          </Text>
          <Text style={{ color: row.profit != null && row.profit < 0 ? (colors.danger || '#b42318') : colors.ink, fontWeight: '700' }}>
            Fortjeneste {money(row.profit)}{row.margin != null ? ` · ${pct(row.margin)}` : ''}
          </Text>
        </View>
      ))}
      {result.rows.length ? (
        <View nativeID="project-earnings-total" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Prosjektet</Text>
          <Text style={{ color: colors.ink }}>
            Timer {formatHours(result.totals.hours)} · honorar {money(result.totals.revenue)} · kostnad {money(result.totals.cost)} · fortjeneste {money(result.totals.profit)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
});
