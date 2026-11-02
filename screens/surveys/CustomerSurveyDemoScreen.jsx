/**
 * Lokal demo av kundeundersøkelsen (/kundeundersokelse-demo). Bare i utviklingsbygg.
 * Kjører den ekte logikken (src/surveys/customerService.js) mot en database i minnet, med tre
 * års eksempeldata, så skjermene kan prøves uten innlogging og uten ekte data.
 * «Svar som kunde» åpner svarsiden med den siste lenken som ble «sendt».
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { createCustomerSurveyDemo, DEMO_FAMILY } from '../../src/surveys/demoBackend';
import { setCustomerSurveyBackend } from '../../src/surveys/customerClient';
import { space, type } from '../../src/ui/tokens';
import { HrChip } from '../hr/HrShared';
import CustomerSurveyScreen from '../customers/CustomerSurveyScreen';
import SurveyAnswerScreen from './SurveyAnswerScreen';
import ConfirmHost from '../../components/ConfirmHost';

export function customerSurveyDemoAllowed() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export default function CustomerSurveyDemoScreen() {
  const colors = useColors();
  const backend = useMemo(() => (customerSurveyDemoAllowed() ? createCustomerSurveyDemo() : null), []);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState('staff');
  const [token, setToken] = useState('');

  useEffect(() => {
    if (!backend) return undefined;
    setCustomerSurveyBackend(backend);
    backend.ready.then(() => setReady(true));
    return () => setCustomerSurveyBackend(null);
  }, [backend]);

  if (!backend) return <View style={styles.center}><Text>Siden finnes bare lokalt.</Text></View>;
  if (!ready) return <View style={styles.center}><Text style={{ color: colors.muted }}>Lager eksempeldata …</Text></View>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.bar, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.muted }]}>Demo:</Text>
        <HrChip colors={colors} label="Bedriften" active={mode === 'staff'} onPress={() => setMode('staff')} nativeID="demo-staff" />
        <HrChip
          colors={colors}
          label="Svar som kunde (siste lenke)"
          active={mode === 'customer'}
          onPress={() => { setToken(backend.lastLink()); setMode('customer'); }}
          nativeID="demo-customer"
        />
        <Text style={[styles.label, { color: colors.muted }]}>{`${backend.outbox.length} e-poster i utboksen`}</Text>
      </View>
      {mode === 'staff'
        ? <CustomerSurveyScreen familyIdOverride={DEMO_FAMILY} companyNameOverride="Byggmester Hansen AS" />
        : <SurveyAnswerScreen key={token} route={{ params: { token } }} />}
      {/* Bekreftelser (Send, Avslutt, Slett) tegnes av skallet i appen. Demoen har ikke skallet. */}
      <ConfirmHost />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, padding: space.xs, borderBottomWidth: 1 },
  label: { ...type.caption },
});
