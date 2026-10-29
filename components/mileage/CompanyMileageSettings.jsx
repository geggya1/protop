/**
 * Økonomi → Innstillinger → Reise og kjøring: sats for kjøregodtgjørelse med egen bil.
 * Statens sats og den trekkfrie satsen hentes automatisk (useMileageRates), så bedriften bare
 * velger ordning. Om en ansatt får godtgjørelse, settes på den ansatte under HR → Lønn.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useProjectStateEditor } from '../../src/project/useProjectStateEditor';
import { setMileagePolicy } from '../../src/equipment/state';
import {
  COMPANY_COMPENSATIONS,
  companyCompensation,
  companyCompensationHint,
  companyPolicyRow,
} from '../../src/mileage/compensation';
import { mileageRatesFor } from '../../src/mileage/mileageRates';
import { useMileageRates } from '../../src/mileage/useMileageRates';
import { showSaveToast } from '../../src/ui/saveToast';
import { formatDate } from '../../src/format/nb';

function kr(value) {
  return Number(value).toFixed(2).replace('.', ',');
}

export default function CompanyMileageSettings({ familyId, colors, canEdit = false }) {
  const [error, setError] = useState('');
  const { state, setState, ready } = useProjectStateEditor(familyId, {
    load: { hours: false },
    onError: () => setError('Kunne ikke lagre.'),
  });
  const fetched = useMileageRates();
  const rates = mileageRatesFor(new Date().toISOString().slice(0, 10), fetched.rates);
  const company = companyCompensation(state.mileagePolicies);
  const [mode, setMode] = useState(company.mode);
  const [rate, setRate] = useState(company.ratePerKm ? kr(company.ratePerKm) : '');

  useEffect(() => {
    if (!ready) return;
    setMode(company.mode);
    setRate(company.ratePerKm ? kr(company.ratePerKm) : '');
  }, [ready, company.mode, company.ratePerKm]);

  function save() {
    setError('');
    if (mode === 'custom' && !(Number(String(rate).replace(',', '.')) > 0)) {
      setError('Skriv bedriftens sats i kr per km.');
      return;
    }
    const current = (state.mileagePolicies || []).find((row) => row?.id === 'company') || {};
    const result = setMileagePolicy(state, companyPolicyRow(current, { compensation: mode, ratePerKm: rate }));
    if (result.ok && setState(result.state)) showSaveToast('Satsen er lagret.');
  }

  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="company-mileage-settings">
      <Text style={[styles.title, { color: colors.ink }]}>Kjøregodtgjørelse for egen bil</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>
        {`Statens sats ${rates.year}: ${kr(rates.state)} kr/km. Trekkfri sats: ${kr(rates.taxFree)} kr/km. `}
        {fetched.checkedAt
          ? `Hentet automatisk fra statens regulativ og Skatteetaten ${formatDate(fetched.checkedAt.slice(0, 10))}.`
          : 'Oppdateres automatisk fra statens regulativ og Skatteetaten.'}
      </Text>
      <View style={styles.row}>
        {COMPANY_COMPENSATIONS.map((row) => {
          const on = mode === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => setMode(row.id)}
              disabled={!canEdit}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled: !canEdit }}
              nativeID={`company-mileage-${row.id}`}
              style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft || colors.card : colors.card }]}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }}>{row.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.muted }]}>{companyCompensationHint(mode, rates)}</Text>
      {mode === 'custom' ? (
        <TextInput
          value={rate}
          onChangeText={setRate}
          editable={canEdit}
          placeholder="kr per km"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          accessibilityLabel="Bedriftens sats i kr per km"
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
      ) : null}
      <Text style={[styles.hint, { color: colors.muted }]}>
        Om en ansatt får kjøregodtgjørelse, eller har den dekket i lønnen, settes på den ansatte under HR → Lønn.
      </Text>
      {error ? <Text style={{ color: colors.dangerInk || colors.danger }} accessibilityRole="alert">{error}</Text> : null}
      {canEdit ? (
        <TouchableOpacity
          onPress={save}
          disabled={!ready}
          accessibilityRole="button"
          nativeID="company-mileage-save"
          style={[styles.btn, { backgroundColor: colors.brand, opacity: ready ? 1 : 0.6 }]}
        >
          <Text style={{ color: colors.onBrand, fontWeight: '600' }}>Lagre</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10, maxWidth: 720 },
  title: { fontWeight: '600', fontSize: 16 },
  hint: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, maxWidth: 200, minHeight: 40 },
  btn: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 16, minHeight: 40, justifyContent: 'center' },
});
