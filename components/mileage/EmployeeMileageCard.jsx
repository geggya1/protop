/**
 * HR → Lønn, på den ansatte: avtalen om kjøregodtgjørelse for egen bil.
 * Etter bedriftens sats (standard), dekket av lønn, eller egen sats i arbeidsavtalen.
 * Lagres i kjøreordningene (mileagePolicies), så kjøreturen kan bruke den uten tilgang til lønn.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProjectStateEditor } from '../../src/project/useProjectStateEditor';
import { removeMileagePolicy, setMileagePolicy } from '../../src/equipment/state';
import {
  EMPLOYEE_COMPENSATIONS,
  employeeCompensation,
  employeePolicyId,
  employeePolicyRow,
  mileageCompensation,
} from '../../src/mileage/compensation';
import { useMileageRates } from '../../src/mileage/useMileageRates';
import { showSaveToast } from '../../src/ui/saveToast';

function kr(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

export default function EmployeeMileageCard({ familyId, employeeId, employeeName = '', colors, canEdit = false }) {
  const [error, setError] = useState('');
  const { state, setState, ready } = useProjectStateEditor(familyId, {
    load: { hours: false },
    onError: () => setError('Kunne ikke lagre.'),
  });
  const fetched = useMileageRates();
  const own = employeeCompensation(state.mileagePolicies, employeeId);
  const [mode, setMode] = useState(own.mode);
  const [rate, setRate] = useState(own.ratePerKm ? kr(own.ratePerKm) : '');
  const effect = mileageCompensation(
    state.mileagePolicies,
    employeeId,
    { fetched: fetched.rates },
  );

  useEffect(() => {
    if (!ready) return;
    setMode(own.mode);
    setRate(own.ratePerKm ? kr(own.ratePerKm) : '');
  }, [ready, employeeId, own.mode, own.ratePerKm]);

  if (!employeeId) return null;

  function save() {
    setError('');
    if (mode === 'custom' && !(Number(String(rate).replace(',', '.')) > 0)) {
      setError('Skriv satsen i kr per km.');
      return;
    }
    const row = employeePolicyRow(employeeId, { compensation: mode, ratePerKm: rate, employeeName });
    const result = row ? setMileagePolicy(state, row) : removeMileagePolicy(state, employeePolicyId(employeeId));
    if (result.ok && setState(result.state)) showSaveToast('Kjøregodtgjørelsen er lagret.');
  }

  const summary = effect.reimburse
    ? `Får ${kr(effect.rate)} kr/km (${effect.label.toLowerCase()}).`
    : 'Kjøringen er dekket av lønnen. Bom, ferje og parkering refunderes.';

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="employee-mileage">
      <Text style={[styles.title, { color: colors.ink }]}>Kjøregodtgjørelse for egen bil</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>{summary}</Text>
      {canEdit ? (
        <>
          <View style={styles.row}>
            {EMPLOYEE_COMPENSATIONS.map((row) => {
              const on = mode === row.id;
              return (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => setMode(row.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  nativeID={`employee-mileage-${row.id}`}
                  style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft || colors.card : colors.card }]}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }}>{row.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 200, minHeight: 40 },
  btn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
});
