import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { displayName } from '../../src/employees/model';
import { formatDate, formatMoney } from '../../src/economy/invoices';
import { loadHrState } from '../../src/hr/storage';
import {
  EARNINGS_GROUPS,
  addEmployeeExtra,
  calculateEmployee,
  clearEmployeeAmount,
  hideEmployeeLine,
  pct,
  removeEmployeeExtra,
  showEmployeeLine,
  setEmployeeAmount,
  setEmployeeIncome,
  updateEmployeeExtra,
} from '../../src/economy/earnings';
import { useEarningsSettings } from '../../src/economy/useEarningsSettings';

function parsePlain(text) {
  const n = Number(String(text ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatPlain(value) {
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function AmountInput({ value, onCommit, colors, editable, nativeID, suffix = '' }) {
  const [text, setText] = useState(formatPlain(value));
  useEffect(() => { setText(formatPlain(value)); }, [value]);
  if (!editable) {
    const shown = suffix ? `${formatPlain(value)}${suffix}` : formatMoney(value);
    return <Text style={[styles.amountText, { color: colors.ink }]}>{shown}</Text>;
  }
  return (
    <View style={styles.amountWrap}>
      <TextInput
        nativeID={nativeID}
        value={text}
        onChangeText={setText}
        onBlur={() => onCommit(parsePlain(text))}
        keyboardType="decimal-pad"
        accessibilityLabel={nativeID || 'Beløp'}
        style={[styles.amountInput, { color: colors.ink, borderColor: colors.line }]}
      />
      {suffix ? <Text style={{ color: colors.muted }}>{suffix.trim()}</Text> : null}
    </View>
  );
}

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <Text style={{ color: colors.muted, fontSize: 13 }}>
      {label}: <Text style={{ color: colors.ink }}>{value}</Text>
    </Text>
  );
}

export default function EmployeeEarningsSheet({
  companyId = '',
  employee,
  salaries: salariesProp,
  settings: settingsProp,
  onChange,
  canEdit = false,
  colors,
}) {
  const owned = useEarningsSettings(settingsProp ? '' : companyId);
  const settings = settingsProp || owned.settings;
  const change = onChange || owned.update;
  const [salaries, setSalaries] = useState(salariesProp || []);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraGroup, setExtraGroup] = useState('overhead');

  useEffect(() => {
    if (salariesProp) {
      setSalaries(salariesProp);
      return undefined;
    }
    if (!companyId || !employee?.id) return undefined;
    let live = true;
    loadHrState(companyId).then((state) => {
      if (live) setSalaries(state?.salaries || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [companyId, employee?.id, salariesProp]);

  const result = useMemo(
    () => calculateEmployee({ employee, salaries, settings }),
    [employee, salaries, settings],
  );
  const company = employee?.company || {};
  const hiddenIds = settings.employees?.[employee?.id]?.hidden || [];
  const position = `${new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(result.position * 100)} %`;

  function commitAmount(row, textValue) {
    if (row.extra) {
      change(updateEmployeeExtra(settings, employee.id, row.id, { amount: textValue }));
      return;
    }
    change(setEmployeeAmount(settings, employee.id, row.id, textValue));
  }

  function addExtra() {
    const label = extraLabel.trim();
    if (!label) return;
    change(addEmployeeExtra(settings, employee.id, {
      group: extraGroup,
      label,
      amount: parsePlain(extraAmount),
    }));
    setExtraLabel('');
    setExtraAmount('');
  }

  return (
    <View nativeID="employee-earnings-sheet" style={styles.wrap}>
      <Text style={[styles.title, { color: colors.ink }]}>{displayName(employee)}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
        Lønn og stilling hentes fra personen. Andre beløp er satser bedriften har lagret.
      </Text>
      <View style={styles.facts}>
        <Fact label="Stilling" value={company.title} colors={colors} />
        <Fact label="Stillingsprosent" value={position} colors={colors} />
        <Fact label="Ansettelse" value={company.employmentType} colors={colors} />
        <Fact label="Lønnsform" value={company.compensationType} colors={colors} />
        <Fact label="Fra" value={company.periodFrom ? formatDate(company.periodFrom) : ''} colors={colors} />
        <Fact
          label="Årslønn"
          value={result.salary.missing
            ? 'Ingen lønn er registrert'
            : `${formatMoney(result.salary.amount, result.salary.currency)}${result.salary.from ? ` fra ${formatDate(result.salary.from)}` : ''}`}
          colors={colors}
        />
      </View>

      {EARNINGS_GROUPS.map((group) => {
        const rows = result.lines.filter((row) => row.group === group.id);
        const sum = group.id === 'direct' ? result.direct : group.id === 'indirect' ? result.indirect : result.overhead;
        const ratio = group.id === 'indirect' ? result.indirectRatio : group.id === 'overhead' ? result.overheadRatio : null;
        return (
          <View key={group.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.groupTitle, { color: colors.ink }]}>{group.label}</Text>
            {rows.map((row) => (
              <View key={row.id} nativeID={`earnings-line-${row.id}`} style={[styles.line, { borderBottomColor: colors.line }]}>
                <View style={styles.lineLabel}>
                  <Text style={{ color: colors.ink }}>{row.label}</Text>
                  {row.rateLabel ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.rateLabel}</Text> : null}
                  {row.source === 'salary' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Fra lønn</Text> : null}
                  {row.source === 'override' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Individuell</Text> : null}
                </View>
                <AmountInput
                  value={row.amount}
                  editable={canEdit && row.kind !== 'salary'}
                  colors={colors}
                  nativeID={`earnings-amount-${row.id}`}
                  onCommit={(amount) => commitAmount(row, amount)}
                />
                {canEdit && row.source === 'override' ? (
                  <TouchableOpacity
                    onPress={() => change(clearEmployeeAmount(settings, employee.id, row.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Bruk standard for ${row.label}`}
                  >
                    <Text style={{ color: colors.brand, fontSize: 12 }}>Standard</Text>
                  </TouchableOpacity>
                ) : null}
                {canEdit && row.extra ? (
                  <TouchableOpacity
                    onPress={() => change(removeEmployeeExtra(settings, employee.id, row.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Fjern ${row.label}`}
                  >
                    <Text style={{ color: colors.danger || '#b42318', fontSize: 12 }}>Fjern</Text>
                  </TouchableOpacity>
                ) : null}
                {canEdit && !row.extra && row.kind !== 'salary' ? (
                  <TouchableOpacity
                    onPress={() => change(hideEmployeeLine(settings, employee.id, row.id))}
                    accessibilityRole="button"
                    accessibilityLabel={`Skjul ${row.label}`}
                  >
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Skjul</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {!rows.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen linjer.</Text> : null}
            <View style={styles.sumRow}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Sum</Text>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>
                {formatMoney(sum)}{ratio != null ? ` · ${pct(ratio)}` : ''}
              </Text>
            </View>
          </View>
        );
      })}

      <View nativeID="earnings-income" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.groupTitle, { color: colors.ink }]}>Forventet inntjening</Text>
        <View style={styles.line}>
          <View style={styles.lineLabel}>
            <Text style={{ color: colors.ink }}>Faktureringsgrad</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {result.percentSource === 'override' ? 'Individuell' : 'Standard for bedriften'}
            </Text>
          </View>
          <AmountInput
            value={result.billablePercent * 100}
            editable={canEdit}
            colors={colors}
            nativeID="earnings-billable-percent"
            suffix=" %"
            onCommit={(value) => change(setEmployeeIncome(settings, employee.id, { billablePercent: value / 100 }))}
          />
          {canEdit && result.percentSource === 'override' ? (
            <TouchableOpacity
              onPress={() => change(setEmployeeIncome(settings, employee.id, { billablePercent: null }))}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand, fontSize: 12 }}>Standard</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.line}>
          <View style={styles.lineLabel}>
            <Text style={{ color: colors.ink }}>Fakturerbar sats</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {result.rateSource === 'override' ? 'Individuell' : 'Standard for bedriften'}
            </Text>
          </View>
          <AmountInput
            value={result.rate}
            editable={canEdit}
            colors={colors}
            nativeID="earnings-billable-rate"
            onCommit={(value) => change(setEmployeeIncome(settings, employee.id, { billableRate: value }))}
          />
          {canEdit && result.rateSource === 'override' ? (
            <TouchableOpacity
              onPress={() => change(setEmployeeIncome(settings, employee.id, { billableRate: null }))}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.brand, fontSize: 12 }}>Standard</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Normtimer {formatPlain(result.hours)} · fakturerbare {formatPlain(result.billableHours)}
        </Text>
        <View style={styles.sumRow}>
          <Text style={{ color: colors.ink }}>Forventet honorar</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatMoney(result.revenue)}</Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={{ color: colors.ink }}>Kostnad</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{formatMoney(result.totalCost)}</Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={{ color: colors.ink }}>Fortjeneste</Text>
          <Text style={{ color: result.profit < 0 ? (colors.danger || '#b42318') : colors.ink, fontWeight: '700' }}>
            {formatMoney(result.profit)}{result.margin != null ? ` · ${pct(result.margin)}` : ''}
          </Text>
        </View>
        <View style={styles.sumRow}>
          <Text style={{ color: colors.ink }}>Nullpunkt, timepris</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>
            {result.breakEvenRate == null ? '—' : formatMoney(result.breakEvenRate)}
          </Text>
        </View>
      </View>

      {canEdit && hiddenIds.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.groupTitle, { color: colors.ink }]}>Skjulte linjer</Text>
          {hiddenIds.map((id) => {
            const hiddenLine = settings.standardLines.find((row) => row.id === id);
            return (
              <TouchableOpacity
                key={id}
                onPress={() => change(showEmployeeLine(settings, employee.id, id))}
                accessibilityRole="button"
                accessibilityLabel={`Vis ${hiddenLine?.label || id}`}
              >
                <Text style={{ color: colors.brand }}>Vis {hiddenLine?.label || id}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {canEdit ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.groupTitle, { color: colors.ink }]}>Egen linje for denne personen</Text>
          <TextInput
            nativeID="earnings-extra-label"
            value={extraLabel}
            onChangeText={setExtraLabel}
            placeholder="Navn på linjen"
            placeholderTextColor={colors.placeholder}
            style={[styles.field, { color: colors.ink, borderColor: colors.line }]}
          />
          <View style={styles.row}>
            {EARNINGS_GROUPS.map((group) => {
              const on = extraGroup === group.id;
              return (
                <TouchableOpacity
                  key={group.id}
                  onPress={() => setExtraGroup(group.id)}
                  accessibilityRole="button"
                  style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? (colors.brandSoft || '#E5F6FE') : colors.card }]}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 12 }}>{group.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <AmountInput
            value={parsePlain(extraAmount)}
            editable
            colors={colors}
            nativeID="earnings-extra-amount"
            onCommit={(amount) => setExtraAmount(String(amount))}
          />
          <TouchableOpacity
            nativeID="earnings-extra-add"
            onPress={addExtra}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand }]}
          >
            <Text style={styles.primaryText}>Legg til linje</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, width: '100%' },
  title: { fontSize: 22, fontWeight: '700' },
  facts: { gap: 2 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  groupTitle: { fontSize: 16, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  lineLabel: { flexGrow: 1, flexShrink: 1, minWidth: 160, gap: 2 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amountText: { minWidth: 120, textAlign: 'right', fontVariant: ['tabular-nums'] },
  amountInput: { minWidth: 120, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#fff4cc', textAlign: 'right' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 4 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  primary: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  primaryText: { color: '#fff', fontWeight: '700' },
});
