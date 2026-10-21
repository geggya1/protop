import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { displayName } from '../../src/employees/model';
import { watchEmployees } from '../../src/employees/storage';
import { formatMoney } from '../../src/economy/invoices';
import { calculateRoster, pct } from '../../src/economy/earnings';
import { loadHrState } from '../../src/hr/storage';
import { useEarningsSettings } from '../../src/economy/useEarningsSettings';
import { useLayout } from '../../src/theme';
import EmployeeEarningsSheet from '../../components/economy/EmployeeEarningsSheet';
import EarningsSettings from '../../components/economy/EarningsSettings';

function money(value) {
  if (value == null) return '—';
  return formatMoney(value);
}

export default function EconomyEarnings() {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId } = useApp();
  const access = useCompanyAccess();
  const canSee = access.canView('economyEarnings') || access.canView('economy');
  const canEdit = access.canEdit('economyEarnings') || access.canEdit('economy');
  const canAdmin = access.canAdmin('economyEarnings') || access.canAdmin('economy');
  const { settings, ready, update } = useEarningsSettings(canSee ? familyId : '');
  const [employees, setEmployees] = useState([]);
  const [salaries, setSalaries] = useState([]);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState('table');
  const [employeeId, setEmployeeId] = useState('');

  useEffect(() => {
    if (!familyId || !canSee) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId, canSee]);

  useEffect(() => {
    if (!familyId || !canSee) return undefined;
    let live = true;
    loadHrState(familyId).then((state) => {
      if (live) setSalaries(state?.salaries || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId, canSee]);

  const rows = useMemo(() => {
    const byId = new Map((employees || []).map((row) => [row.id, row]));
    const needle = query.trim().toLocaleLowerCase('nb');
    return calculateRoster({ employees, salaries, settings })
      .map((calc) => ({ calc, employee: byId.get(calc.employeeId) }))
      .filter((row) => row.employee)
      .filter((row) => {
        if (!needle) return true;
        const name = displayName(row.employee).toLocaleLowerCase('nb');
        const title = String(row.employee.company?.title || '').toLocaleLowerCase('nb');
        return name.includes(needle) || title.includes(needle);
      })
      .sort((a, b) => displayName(a.employee).localeCompare(displayName(b.employee), 'nb'));
  }, [employees, salaries, settings, query]);

  const selected = employees.find((row) => row.id === employeeId) || null;
  const totals = rows.reduce((acc, row) => ({
    cost: acc.cost + row.calc.totalCost,
    revenue: acc.revenue + row.calc.revenue,
    profit: acc.profit + row.calc.profit,
  }), { cost: 0, revenue: 0, profit: 0 });

  if (!canSee) {
    return (
      <View style={styles.screen}>
        <Text style={{ color: colors.muted }}>Du har ikke tilgang til inntjening.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      nativeID="economy-earnings"
      style={[styles.screen, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.toolbar}>
        {mode !== 'table' ? (
          <TouchableOpacity onPress={() => setMode('table')} accessibilityRole="button" nativeID="earnings-back">
            <Text style={{ color: colors.brand }}>Alle ansatte</Text>
          </TouchableOpacity>
        ) : <View />}
        <TouchableOpacity
          onPress={() => setMode(mode === 'variables' ? 'table' : 'variables')}
          accessibilityRole="button"
          nativeID="earnings-open-variables"
        >
          <Text style={{ color: colors.brand }}>{mode === 'variables' ? 'Lukk variabler' : 'Variabler og standardfelt'}</Text>
        </TouchableOpacity>
      </View>

      {!ready ? <Text style={{ color: colors.muted }}>Henter satser…</Text> : null}

      {mode === 'variables' ? (
        <EarningsSettings settings={settings} canEdit={canAdmin} onChange={update} colors={colors} />
      ) : null}

      {mode === 'person' && selected ? (
        <EmployeeEarningsSheet
          employee={selected}
          salaries={salaries}
          settings={settings}
          onChange={update}
          canEdit={canEdit}
          colors={colors}
        />
      ) : null}

      {mode === 'table' ? (
        <View style={styles.gap}>
          <Text style={{ color: colors.muted, lineHeight: 18 }}>
            Lønn kommer fra lønnsregistreringen. Stillingsprosent kommer fra den ansatte. Satser som ikke finnes i systemet, setter bedriften under variabler.
          </Text>
          <TextInput
            nativeID="earnings-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk på navn eller stilling"
            placeholderTextColor={colors.placeholder}
            style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          {!rows.length ? <Text style={{ color: colors.muted }}>Ingen ansatte å vise.</Text> : null}
          <View nativeID="earnings-roster" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {isPhone ? null : (
              <View style={[styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                {['Ansatt', 'Prosent', 'Årslønn', 'Kostnad', 'Sats', 'Grad', 'Honorar', 'Fortjeneste'].map((label) => (
                  <Text key={label} style={[styles.cell, styles.headText, { color: colors.muted }]}>{label}</Text>
                ))}
              </View>
            )}
            {rows.map((row) => {
              const name = displayName(row.employee);
              const open = () => {
                setEmployeeId(row.employee.id);
                setMode('person');
              };
              if (isPhone) {
                return (
                  <TouchableOpacity
                    key={row.employee.id}
                    nativeID={`earnings-open-${row.employee.id}`}
                    onPress={open}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    style={[styles.phone, { borderBottomColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink, fontWeight: '700' }}>{name}</Text>
                    <Text style={{ color: colors.muted }}>
                      {money(row.calc.salary.amount)} · kostnad {money(row.calc.totalCost)} · fortjeneste {money(row.calc.profit)}
                    </Text>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={row.employee.id}
                  nativeID={`earnings-open-${row.employee.id}`}
                  onPress={open}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  style={[styles.head, { borderBottomColor: colors.line }]}
                >
                  <Text style={[styles.cell, { color: colors.ink, fontWeight: '600' }]}>{name}</Text>
                  <Text style={[styles.cell, { color: colors.muted }]}>{Math.round(row.calc.position * 100)} %</Text>
                  <Text style={[styles.cell, { color: row.calc.salary.missing ? (colors.danger || '#b42318') : colors.ink }]}>
                    {row.calc.salary.missing ? 'Mangler' : money(row.calc.salary.amount)}
                  </Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{money(row.calc.totalCost)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{money(row.calc.rate)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{pct(row.calc.billablePercent)}</Text>
                  <Text style={[styles.cell, { color: colors.ink }]}>{money(row.calc.revenue)}</Text>
                  <Text style={[styles.cell, { color: row.calc.profit < 0 ? (colors.danger || '#b42318') : colors.ink }]}>
                    {money(row.calc.profit)}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {rows.length && !isPhone ? (
              <View style={[styles.head, { backgroundColor: colors.sunken || colors.bg }]}>
                <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>Sum</Text>
                <Text style={styles.cell} />
                <Text style={styles.cell} />
                <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{money(totals.cost)}</Text>
                <Text style={styles.cell} />
                <Text style={styles.cell} />
                <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{money(totals.revenue)}</Text>
                <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{money(totals.profit)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  gap: { gap: 10 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  headText: { fontSize: 11, fontWeight: '700' },
  cell: { flex: 1, paddingHorizontal: 8, paddingVertical: 10, fontSize: 13 },
  phone: { paddingHorizontal: 12, paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
});
