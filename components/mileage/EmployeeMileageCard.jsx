/**
 * HR → Lønn, på den ansatte: utlegg og kjøregodtgjørelse.
 * - Hvordan utlegg betales ut: med lønnen eller som egen utbetaling (standard fra bedriften).
 * - Kjøregodtgjørelse for egen bil: etter bedriftens sats (standard), dekket av lønn, eller egen sats.
 * - Hva den ansatte har til utbetaling nå (godkjent og betalt privat, ikke utbetalt).
 * Lagres i kjøreordningene (mileagePolicies), så registreringen kan bruke dem uten tilgang til lønn.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProjectStateEditor } from '../../src/project/useProjectStateEditor';
import { removeMileagePolicy, setMileagePolicy } from '../../src/equipment/state';
import {
  EMPLOYEE_COMPENSATIONS,
  PAYOUT_METHODS,
  companyPayout,
  employeeCompensation,
  employeePolicyId,
  employeePolicyRow,
  mileageCompensation,
  payoutLabel,
} from '../../src/mileage/compensation';
import { payoutSummary } from '../../src/economy/expensePayout';
import { formatMoney } from '../../src/economy/invoices';
import { useMileageRates } from '../../src/mileage/useMileageRates';
import { showSaveToast } from '../../src/ui/saveToast';

function kr(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

function Chips({ options, value, onPick, colors, idPrefix }) {
  return (
    <View style={styles.row}>
      {options.map((row) => {
        const on = value === row.id;
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => onPick(row.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            nativeID={`${idPrefix}-${row.id}`}
            style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft || colors.card : colors.card }]}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }}>{row.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function EmployeeMileageCard({ familyId, employeeId, employeeName = '', colors, canEdit = false }) {
  const [error, setError] = useState('');
  const { state, setState, ready } = useProjectStateEditor(familyId, {
    load: { hours: false },
    onError: () => setError('Kunne ikke lagre.'),
  });
  const fetched = useMileageRates();
  const policies = state.mileagePolicies || [];
  const ownRow = policies.find((row) => row?.id === employeePolicyId(employeeId)) || null;
  const own = employeeCompensation(policies, employeeId);
  const [mode, setMode] = useState(own.mode);
  const [rate, setRate] = useState(own.ratePerKm ? kr(own.ratePerKm) : '');
  const [payout, setPayout] = useState(ownRow?.payout || 'company');
  const effect = mileageCompensation(policies, employeeId, { fetched: fetched.rates });
  const pending = payoutSummary(state.expenses || [], { employeeId })[0] || null;
  const companyDefault = companyPayout(policies);

  useEffect(() => {
    if (!ready) return;
    setMode(own.mode);
    setRate(own.ratePerKm ? kr(own.ratePerKm) : '');
    setPayout(ownRow?.payout || 'company');
  }, [ready, employeeId, own.mode, own.ratePerKm, ownRow?.payout]);

  if (!employeeId) return null;

  function save() {
    setError('');
    if (mode === 'custom' && !(Number(String(rate).replace(',', '.')) > 0)) {
      setError('Skriv satsen i kr per km.');
      return;
    }
    const row = employeePolicyRow(employeeId, {
      compensation: mode,
      ratePerKm: rate,
      employeeName,
      payout: payout === 'company' ? '' : payout,
    });
    const result = row ? setMileagePolicy(state, row) : removeMileagePolicy(state, employeePolicyId(employeeId));
    if (result.ok && setState(result.state)) showSaveToast('Utlegg og kjøregodtgjørelse er lagret.');
  }

  const mileageSummary = effect.reimburse
    ? `Kjøring: ${kr(effect.rate)} kr/km (${effect.label.toLowerCase()}).`
    : 'Kjøring: dekket av lønnen. Bom, ferje og parkering refunderes.';
  const payoutNow = payout === 'company' ? companyDefault : payout;

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="employee-mileage">
      <Text style={[styles.title, { color: colors.ink }]}>Utlegg og kjøregodtgjørelse</Text>
      <Text style={[styles.hint, { color: colors.ink }]} nativeID="employee-payout-pending">
        {pending
          ? `Til utbetaling: ${formatMoney(pending.total)} (${pending.count} utlegg)${pending.taxable ? `, herav ${formatMoney(pending.taxable)} skattepliktig bilgodtgjørelse` : ''}.`
          : 'Ingenting til utbetaling.'}
      </Text>
      <Text style={[styles.hint, { color: colors.muted }]}>
        {`Utbetales ${payoutLabel(payoutNow).toLowerCase()}${payout === 'company' ? ' (som bedriften)' : ''}. ${mileageSummary}`}
      </Text>
      {canEdit ? (
        <>
          <Text style={[styles.label, { color: colors.muted }]}>Utlegg utbetales</Text>
          <Chips
            options={[{ id: 'company', label: `Som bedriften (${payoutLabel(companyDefault).toLowerCase()})` }, ...PAYOUT_METHODS]}
            value={payout}
            onPick={setPayout}
            colors={colors}
            idPrefix="employee-payout"
          />
          <Text style={[styles.label, { color: colors.muted }]}>Kjøregodtgjørelse for egen bil</Text>
          <Chips options={EMPLOYEE_COMPENSATIONS} value={mode} onPick={setMode} colors={colors} idPrefix="employee-mileage" />
          {mode === 'custom' ? (
            <TextInput
              value={rate}
              onChangeText={setRate}
              placeholder="kr per km"
              placeholderTextColor={colors.muted}
              keyboardType="decimal-pad"
              accessibilityLabel="Avtalt sats i kr per km"
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
          ) : null}
          {error ? <Text style={{ color: colors.dangerInk || colors.danger }} accessibilityRole="alert">{error}</Text> : null}
          <TouchableOpacity
            onPress={save}
            disabled={!ready}
            accessibilityRole="button"
            nativeID="employee-mileage-save"
            style={[styles.btn, { backgroundColor: colors.brand, opacity: ready ? 1 : 0.6 }]}
          >
            <Text style={{ color: colors.onBrand, fontWeight: '600' }}>Lagre</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  title: { fontWeight: '600', fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 200, minHeight: 40 },
  btn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
});
