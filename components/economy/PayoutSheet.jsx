/**
 * Utlegg → «Til utbetaling»: godkjente utlegg og kjøregodtgjørelse de ansatte har betalt selv,
 * summert per ansatt (src/economy/expensePayout.js). Økonomi eksporterer linjene til lønn og
 * markerer dem som utbetalt i en lønnsperiode, for én ansatt eller alle.
 */
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Button, Sheet } from '../../src/ui';
import { formatMoney } from '../../src/economy/invoices';
import { payableExpenses, payoutPeriodOf, payoutSummary, payrollCsv } from '../../src/economy/expensePayout';
import { employeePayout, payoutLabel } from '../../src/mileage/compensation';
import { radius, space, type } from '../../src/ui/tokens';

const MONTHS = ['januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'desember'];

function periodLabel(period) {
  const [y, m] = String(period).split('-').map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
}

function shift(period, delta) {
  const [y, m] = String(period).split('-').map(Number);
  return payoutPeriodOf(new Date(y, (m || 1) - 1 + delta, 15));
}

function download(name, csv) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * rows: utleggene (med navn), policies: kjøreordningene (utbetaling per ansatt).
 * onMark(rows, { period, method }) → Promise<{ ok, error }>.
 */
export default function PayoutSheet({ colors, rows = [], policies = [], onMark, onClose }) {
  const [period, setPeriod] = useState(() => payoutPeriodOf(new Date()));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const groups = useMemo(() => payoutSummary(rows), [rows]);
  const total = groups.reduce((sum, row) => sum + row.total, 0);

  async function mark(employeeId) {
    const list = payableExpenses(rows, { employeeId });
    if (!list.length) return;
    setBusy(employeeId || 'all');
    setError('');
    // Hver ansatt får måten som gjelder for dem (med lønnen eller egen utbetaling).
    const byMethod = new Map();
    for (const row of list) {
      const method = employeePayout(policies, row.employeeId);
      byMethod.set(method, [...(byMethod.get(method) || []), row]);
    }
    for (const [method, part] of byMethod) {
      const result = await onMark(part, { period, method });
      if (!result?.ok) {
        setError(result?.error || 'Kunne ikke markere som utbetalt.');
        break;
      }
    }
    setBusy('');
  }

  const footer = [
    ...(error ? [<Text key="error" style={[styles.error, { color: colors.dangerInk || colors.danger }]} accessibilityRole="alert">{error}</Text>] : []),
    <Button key="close" label="Lukk" onPress={onClose} />,
    <Button
      key="csv"
      icon="download-outline"
      label="Eksporter til lønn"
      nativeID="payout-export"
      disabled={!groups.length}
      // Bare de som får utlegg med lønnen. Egen utbetaling går til konto.
      onPress={() => download(`utlegg-til-lonn-${period}.csv`, payrollCsv(
        payableExpenses(rows).filter((row) => employeePayout(policies, row.employeeId) === 'payroll'),
        { period },
      ))}
    />,
    <Button
      key="all"
      variant="primary"
      label="Marker alle som utbetalt"
      nativeID="payout-mark-all"
      disabled={!groups.length}
      busy={busy === 'all'}
      onPress={() => mark('')}
    />,
  ];

  return (
    <Sheet visible title="Til utbetaling" onClose={onClose} footer={footer} wide>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Godkjente utlegg og kjøregodtgjørelse som de ansatte har betalt selv. Eksporter linjene til lønn, og marker dem som utbetalt når lønnen er kjørt.
      </Text>
      <View style={styles.periodRow} nativeID="payout-period">
        <Text style={[styles.label, { color: colors.muted }]}>Lønnsperiode</Text>
        {[-1, 0, 1].map((delta) => {
          const value = shift(payoutPeriodOf(new Date()), delta);
          const on = value === period;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => setPeriod(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft || colors.card : colors.card }]}
            >
              <Text style={[styles.chipText, { color: on ? colors.brand : colors.ink }]}>{periodLabel(value)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {groups.length ? groups.map((group) => {
        const method = employeePayout(policies, group.employeeId);
        return (
          <View key={group.employeeId || group.employeeName} style={[styles.person, { borderColor: colors.line }]} nativeID={`payout-${group.employeeId}`}>
            <View style={styles.personMain}>
              <Text style={[styles.name, { color: colors.ink }]}>{group.employeeName || 'Uten navn'}</Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {[
                  `${group.count} utlegg fra ${group.oldest.split('-').reverse().join('.')}`,
                  payoutLabel(method),
                  group.taxable ? `${formatMoney(group.taxable)} skattepliktig bilgodtgjørelse` : '',
                ].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Text style={[styles.amount, { color: colors.ink }]}>{formatMoney(group.total)}</Text>
            <Button
              size="sm"
              label="Utbetalt"
              accessibilityLabel={`Marker utleggene til ${group.employeeName || 'den ansatte'} som utbetalt`}
              busy={busy === group.employeeId}
              onPress={() => mark(group.employeeId)}
            />
          </View>
        );
      }) : (
        <Text style={[styles.lead, { color: colors.muted }]}>Ingenting til utbetaling.</Text>
      )}
      {groups.length ? (
        <Text style={[styles.total, { color: colors.ink }]}>{`Til sammen ${formatMoney(total)}`}</Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  lead: { ...type.caption },
  label: { ...type.label },
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 6 },
  chipText: { ...type.caption },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: space.xs },
  personMain: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.bodyStrong },
  meta: { ...type.caption },
  amount: { ...type.bodyStrong },
  total: { ...type.bodyStrong, textAlign: 'right' },
  error: { ...type.caption, flexBasis: '100%', textAlign: 'right' },
});
