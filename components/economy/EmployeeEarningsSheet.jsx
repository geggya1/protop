import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { displayName, personnelKind } from '../../src/employees/model';
import { formatDate, formatMoney } from '../../src/economy/invoices';
import { loadHrState } from '../../src/hr/storage';
import { loadVacationPlan } from '../../src/arbeid/vacationPlanStorage';
import {
  EARNINGS_GROUPS,
  addEmployeeExtra,
  calculateEmployee,
  calculateHired,
  clearEmployeeAmount,
  hideEmployeeLine,
  pct,
  removeEmployeeExtra,
  showEmployeeLine,
  setEmployeeAmount,
  setEmployeeIncome,
  updateEmployeeExtra,
  yearCapacity,
} from '../../src/economy/earnings';
import { useEarningsSettings } from '../../src/economy/useEarningsSettings';
import { BREAKPOINTS } from '../../src/ui/layout';

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
    return <Text nativeID={nativeID} style={[styles.amountText, { color: colors.ink }]}>{shown}</Text>;
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
        style={[styles.amountInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.starSoft }]}
      />
      {suffix ? <Text style={{ color: colors.muted }}>{suffix.trim()}</Text> : null}
    </View>
  );
}

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

/** Nøkkeltall som flis: tydelig tall, liten etikett, ingen fet brødtekst. */
function Kpi({ label, value, hint, tone, colors, nativeID }) {
  return (
    <View nativeID={nativeID} style={[styles.kpi, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.kpiLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: tone || colors.ink }]} numberOfLines={1}>{value}</Text>
      {hint ? <Text style={[styles.kpiHint, { color: colors.muted }]} numberOfLines={1}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Honorar mot kostnad som to liggende stolper: kostnaden delt i direkte, indirekte og
 * felleskostnader. Lengden er relativ til den største av de to.
 */
function CostBar({ result, colors }) {
  const revenue = Math.max(0, Number(result.revenue) || 0);
  const parts = [
    { id: 'direct', label: 'Direkte', value: Math.max(0, Number(result.direct) || 0), color: colors.brand },
    { id: 'indirect', label: 'Indirekte', value: Math.max(0, Number(result.indirect) || 0), color: '#7c9cbf' },
    { id: 'overhead', label: 'Felles', value: Math.max(0, Number(result.overhead) || 0), color: '#c4cfdb' },
  ];
  const cost = parts.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(revenue, cost);
  if (!max) return null;
  const width = (value) => `${Math.max(0, Math.min(100, (value / max) * 100))}%`;
  return (
    <View nativeID="earnings-chart" style={styles.chart} accessibilityLabel={`Honorar ${formatMoney(revenue)}, kostnad ${formatMoney(cost)}`}>
      <View style={styles.chartRow}>
        <Text style={[styles.chartLabel, { color: colors.muted }]}>Honorar</Text>
        <View style={[styles.track, { backgroundColor: colors.bg }]}>
          <View style={{ width: width(revenue), backgroundColor: '#3fa66b', height: '100%', borderRadius: 4 }} />
        </View>
      </View>
      <View style={styles.chartRow}>
        <Text style={[styles.chartLabel, { color: colors.muted }]}>Kostnad</Text>
        <View style={[styles.track, styles.trackRow, { backgroundColor: colors.bg }]}>
          {parts.map((row) => (row.value ? (
            <View key={row.id} style={{ width: width(row.value), backgroundColor: row.color, height: '100%' }} />
          ) : null))}
        </View>
      </View>
      <View style={styles.legend}>
        {parts.map((row) => (
          <View key={row.id} style={styles.legendItem}>
            <View style={[styles.dot, { backgroundColor: row.color }]} />
            <Text style={[styles.legendText, { color: colors.muted }]}>{`${row.label} ${formatMoney(row.value)}`}</Text>
          </View>
        ))}
      </View>
    </View>
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
  capacity: capacityProp,
  // Inne på personen står navnet allerede i toppfeltet. Bare oversikten i Økonomi viser det her.
  showTitle = true,
}) {
  const { width: screenWidth } = useWindowDimensions();
  // Bred skjerm: fakta om personen i en marg til høyre, tallene får hovedplassen.
  const wide = screenWidth >= BREAKPOINTS.desktop;
  const owned = useEarningsSettings(settingsProp ? '' : companyId);
  const settings = settingsProp || owned.settings;
  const change = onChange || owned.update;
  const [salaries, setSalaries] = useState(salariesProp || []);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraGroup, setExtraGroup] = useState('overhead');
  const [openGroups, setOpenGroups] = useState({});
  const [vacationPlan, setVacationPlan] = useState(null);
  const hired = personnelKind(employee) === 'innleid' || personnelKind(employee) === 'external';

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

  useEffect(() => {
    if (capacityProp || !companyId) return undefined;
    let live = true;
    loadVacationPlan(companyId).then((plan) => {
      if (live) setVacationPlan(plan);
    }).catch(() => {});
    return () => { live = false; };
  }, [capacityProp, companyId]);

  const capacity = useMemo(
    () => capacityProp || yearCapacity(employee, vacationPlan),
    [capacityProp, employee, vacationPlan],
  );
  const result = useMemo(
    () => (hired
      ? calculateHired({ employee, settings, yearHours: capacity?.hours })
      : calculateEmployee({ employee, salaries, settings, yearHours: capacity?.hours })),
    [hired, employee, salaries, settings, capacity],
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
    <View nativeID="employee-earnings-sheet" style={[styles.wrap, wide && styles.wrapWide]}>
      <View style={[styles.main, wide && styles.mainWide]}>
        {showTitle ? <Text style={[styles.title, { color: colors.ink }]}>{displayName(employee)}</Text> : null}
        <View style={styles.kpis} nativeID="earnings-kpis">
          <Kpi colors={colors} nativeID="earnings-kpi-revenue" label="Forventet honorar" value={formatMoney(result.revenue)} hint={`${formatPlain(result.billableHours)} fakturerbare timer`} />
          <Kpi colors={colors} nativeID="earnings-kpi-cost" label="Kostnad" value={formatMoney(result.totalCost)} />
          <Kpi
            colors={colors}
            nativeID="earnings-kpi-profit"
            label="Fortjeneste"
            value={formatMoney(result.profit)}
            hint={result.margin != null ? `Margin ${pct(result.margin)}` : ''}
            tone={result.profit < 0 ? (colors.danger || '#b42318') : undefined}
          />
          {hired ? null : (
            <Kpi colors={colors} nativeID="earnings-kpi-breakeven" label="Nullpunkt, timepris" value={result.breakEvenRate == null ? '—' : formatMoney(result.breakEvenRate)} />
          )}
        </View>
        {hired ? null : <CostBar result={result} colors={colors} />}
      </View>
      <View style={[styles.side, wide && styles.sideWide, { borderColor: colors.line }]} nativeID="earnings-facts">
      <Text style={[styles.sideTitle, { color: colors.muted }]}>Om personen</Text>
      <View style={styles.facts}>
        <Fact label="Stilling" value={company.title} colors={colors} />
        <Fact label="Stillingsprosent" value={position} colors={colors} />
        <Fact label="Ansettelse" value={company.employmentType} colors={colors} />
        {hired ? null : <Fact label="Lønnsform" value={company.compensationType} colors={colors} />}
        <Fact label="Fra" value={company.periodFrom ? formatDate(company.periodFrom) : ''} colors={colors} />
        {hired ? null : (
          <Fact
            label="Årslønn"
            value={result.salary.missing
              ? 'Ingen lønn er registrert'
              : `${formatMoney(result.salary.amount, result.salary.currency)}${result.salary.from ? ` fra ${formatDate(result.salary.from)}` : ''}`}
            colors={colors}
          />
        )}
      </View>
      <Text style={[styles.sideNote, { color: colors.muted }]}>
        {hired
          ? 'Innleid personell kjøpes til avtalt timehonorar. Lønn, arbeidsgiveravgift og pensjon brukes ikke.'
          : 'Lønn og stilling hentes fra personen. Feriepenger, avgift og pensjon regnes ut fra lønnen.'}
      </Text>
      <Text style={[styles.sideNote, { color: colors.muted }]}>
        {capacity
          ? `Disponible timer ${capacity.year}: ${formatPlain(capacity.gross)} t, minus ${formatPlain(capacity.vacationDays)} feriedager (${formatPlain(capacity.vacationHours)} t) = ${formatPlain(capacity.hours)} t.`
          : `Timer ${formatPlain(result.hours)}.`}
        {result.hoursSource === 'override' ? ` Avtalt timetall ${formatPlain(result.hours)} t brukes.` : ''}
      </Text>
      </View>

      <View style={[styles.main, wide && styles.mainWide]}>
      <View nativeID="earnings-income" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.groupTitle, { color: colors.ink }]}>{hired ? 'Avtalt honorar' : 'Grunnlag'}</Text>
        {hired ? (
          <View style={styles.line}>
            <View style={styles.lineLabel}>
              <Text style={{ color: colors.ink }}>Innkjøpspris per time</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {result.purchaseSource === 'override' ? 'Avtalt for personen' : 'Standard for innleide'}
              </Text>
            </View>
            <AmountInput
              value={result.purchaseRate}
              editable={canEdit}
              colors={colors}
              nativeID="earnings-purchase-rate"
              onCommit={(value) => change(setEmployeeIncome(settings, employee.id, { purchaseRate: value }))}
            />
            {canEdit && result.purchaseSource === 'override' ? (
              <TouchableOpacity
                onPress={() => change(setEmployeeIncome(settings, employee.id, { purchaseRate: null }))}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.brand, fontSize: 12 }}>Standard</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
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
      </View>

      {hired ? null : EARNINGS_GROUPS.map((group) => {
        const rows = result.lines.filter((row) => row.group === group.id);
        const sum = group.id === 'direct' ? result.direct : group.id === 'indirect' ? result.indirect : result.overhead;
        const ratio = group.id === 'indirect' ? result.indirectRatio : group.id === 'overhead' ? result.overheadRatio : null;
        const expanded = !!openGroups[group.id];
        return (
          <View key={group.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <TouchableOpacity
              nativeID={`earnings-group-${group.id}`}
              onPress={() => setOpenGroups((current) => ({ ...current, [group.id]: !current[group.id] }))}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={styles.sumRow}
            >
              <Text style={[styles.groupTitle, { color: colors.ink }]}>{expanded ? '▾' : '▸'} {group.label}</Text>
              <Text style={[styles.amountText, { color: colors.ink }]}>
                {formatMoney(sum)}{ratio != null ? ` · ${pct(ratio)}` : ''}
              </Text>
            </TouchableOpacity>
            {expanded ? rows.map((row) => (
              <View key={row.id} nativeID={`earnings-line-${row.id}`} style={[styles.line, { borderBottomColor: colors.line }]}>
                <View style={styles.lineLabel}>
                  <Text style={{ color: colors.ink }}>{row.label}</Text>
                  {row.rateLabel ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.rateLabel}</Text> : null}
                  {row.source === 'salary' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Fra lønn</Text> : null}
                  {row.source === 'formula' || row.source === 'percent' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Beregnet</Text> : null}
                  {row.source === 'override' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Individuell</Text> : null}
                </View>
                <AmountInput
                  value={row.amount}
                  editable={canEdit && row.editable}
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
            )) : null}
            {expanded && !rows.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen linjer.</Text> : null}
          </View>
        );
      })}

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

      {canEdit && !hired ? (
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12, width: '100%' },
  // Bred: tall og felt til venstre, margen med fakta om personen til høyre.
  wrapWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 24, rowGap: 12 },
  main: { gap: 12, width: '100%' },
  mainWide: { width: 'auto', flexBasis: 560, flexGrow: 1, maxWidth: 900 },
  side: { gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  sideWide: { width: 260, borderWidth: 0, borderLeftWidth: 1, borderRadius: 0, paddingVertical: 4, paddingLeft: 16 },
  sideTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  sideNote: { fontSize: 12, lineHeight: 17 },
  title: { fontSize: 18, fontWeight: '600' },
  facts: { gap: 6 },
  fact: { gap: 0 },
  factLabel: { fontSize: 12, lineHeight: 16 },
  factValue: { fontSize: 14, lineHeight: 19 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpi: { flexGrow: 1, flexBasis: 150, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  kpiLabel: { fontSize: 12, lineHeight: 16 },
  kpiValue: { fontSize: 20, lineHeight: 26, fontWeight: '500', fontVariant: ['tabular-nums'] },
  kpiHint: { fontSize: 12, lineHeight: 16 },
  chart: { gap: 6 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartLabel: { width: 64, fontSize: 12 },
  track: { flex: 1, height: 12, borderRadius: 4, overflow: 'hidden' },
  trackRow: { flexDirection: 'row' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingLeft: 74 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  groupTitle: { fontSize: 15, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, flexWrap: 'wrap' },
  lineLabel: { flexGrow: 1, flexShrink: 1, minWidth: 160, gap: 2 },
  amountWrap: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  amountText: { minWidth: 120, textAlign: 'right', fontVariant: ['tabular-nums'] },
  amountInput: { minWidth: 120, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, textAlign: 'right' },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 4 },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  primary: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  primaryText: { color: '#fff', fontWeight: '600' },
});
