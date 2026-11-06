import { lazyScreen } from '../../src/ui/lazyScreen';
/**
 * Lokal demo av kundeundersøkelsen (/kundeundersokelse-demo). Bare i utviklingsbygg.
 * Kjører den ekte logikken (src/surveys/customerService.js) mot en database i minnet, med tre
 * års eksempeldata, så skjermene kan prøves uten innlogging og uten ekte data.
 * «Svar som kunde» åpner svarsiden med den siste lenken som ble «sendt».
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { createCustomerSurveyDemo, DEMO_FAMILY } from '../../src/surveys/demoBackend';
import { setCustomerSurveyBackend } from '../../src/surveys/customerClient';
import { space, type } from '../../src/ui/tokens';
import ConfirmHost from '../../components/ConfirmHost';
import ResponseMeter from '../../components/surveys/ResponseMeter';
import HrSurveyPlan, { ActionEffects } from '../hr/HrSurveyPlan';
import { HrCard } from '../hr/HrShared';
import {
  SURVEY_GOOD_SCORE, hrTrendPoints, newSurvey, surveyAnalysis, surveyResults,
} from '../../src/hr/survey';
import { actionEffects, addAction, emptyPlan, toggleStep } from '../../src/hr/surveyPlan';
import { surveyTrend } from '../../src/surveys/trend';
const HrChip = lazyScreen(() => import('../hr/HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const SurveyAnswerScreen = lazyScreen(() => import('./SurveyAnswerScreen'), { name: 'SurveyAnswerScreen' });
const CustomerSurveyScreen = lazyScreen(() => import('../customers/CustomerSurveyScreen'), { name: 'CustomerSurveyScreen' });
const SurveyTrend = lazyScreen(() => import('../../components/surveys/SurveyTrend'), { name: 'SurveyTrend', silent: true });

export function customerSurveyDemoAllowed() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Eksempeldata for HR-delen: tre år med medarbeiderundersøkelse og en tiltaksplan. */
function useHrDemo() {
  return useMemo(() => {
    let seed = 3;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const years = [[2024, 3.4], [2025, 3.6], [2026, 3.8]];
    const surveys = [];
    const results = {};
    for (const [year, base] of years) {
      const s = { ...newSurvey({ year, templateId: 'arbeidsmiljo' }), id: `mu${year}`, status: 'closed', closedAt: `${year}-11-01` };
      const answers = Array.from({ length: 14 }, () => ({
        surveyId: s.id,
        answers: Object.fromEntries(s.questions.map((q, j) => {
          const shift = q.area === 'Arbeidsmengde' ? -0.9 + (year - 2024) * 0.4 : q.area === 'HMS' ? 0.5 : (j % 3) * 0.2;
          const v = Math.round(base + shift + (rnd() - 0.5) * 2);
          return [q.id, q.reverse ? (rnd() < 0.85 ? 1 : 3) : Math.max(1, Math.min(5, v))];
        })),
      }));
      surveys.push(s);
      results[s.id] = surveyResults(s, answers);
    }
    return { surveys, results };
  }, []);
}

function HrDemo({ colors }) {
  const { surveys, results } = useHrDemo();
  const latest = surveys[2];
  const prev = surveys[1];
  const analysis = surveyAnalysis(results[latest.id], results[prev.id]);
  const [plan, setPlan] = useState(() => {
    let p = toggleStep(emptyPlan(latest.id), 'ledelse');
    p = addAction(p, { area: 'Arbeidsmengde', text: 'Gå gjennom bemanning og frister i prosjektene før vinteren', owner: 'Kari Leder', due: '2026-12-15' });
    return p;
  });
  const prevPlan = addAction(emptyPlan(prev.id), { area: 'Arbeidsmengde', text: 'Fast prioriteringsmøte mandag morgen', owner: 'Ola' });
  const prevWithDone = { ...prevPlan, actions: prevPlan.actions.map((a) => ({ ...a, status: 'done', result: 'Bedre oversikt' })) };
  const trend = surveyTrend(hrTrendPoints(surveys, results, 16));
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <HrCard colors={colors}>
        <Text style={[styles.h, { color: colors.ink }]}>Medarbeiderundersøkelse 2026 (eksempel)</Text>
        <ResponseMeter colors={colors} pct={88} count={14} of={16} open={false} nativeID="demo-hr-response" />
        <ActionEffects colors={colors} previousTitle={prev.title} effects={actionEffects(prevWithDone, results[prev.id].areas, results[latest.id].areas)} />
        <HrSurveyPlan colors={colors} survey={latest} plan={plan} analysis={analysis} canWrite onUpdate={(fn) => setPlan((p) => fn(p))} onCreateTask={async () => 'demo'} />
      </HrCard>
      <HrCard colors={colors}>
        <Text style={[styles.h, { color: colors.ink }]}>Utvikling over tid</Text>
        <SurveyTrend colors={colors} trend={trend} metric="index" target={SURVEY_GOOD_SCORE} nativeID="demo-hr-trend" />
      </HrCard>
    </ScrollView>
  );
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
        <HrChip colors={colors} label="HR (eksempel)" active={mode === 'hr'} onPress={() => setMode('hr')} nativeID="demo-hr" />
        <Text style={[styles.label, { color: colors.muted }]}>{`${backend.outbox.length} e-poster i utboksen`}</Text>
      </View>
      {mode === 'staff' ? <CustomerSurveyScreen familyIdOverride={DEMO_FAMILY} companyNameOverride="Byggmester Hansen AS" /> : null}
      {mode === 'customer' ? <SurveyAnswerScreen key={token} route={{ params: { token } }} /> : null}
      {mode === 'hr' ? <HrDemo colors={colors} /> : null}
      {/* Bekreftelser (Send, Avslutt, Slett) tegnes av skallet i appen. Demoen har ikke skallet. */}
      <ConfirmHost />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs, padding: space.xs, borderBottomWidth: 1 },
  label: { ...type.caption },
  page: { padding: space.md, gap: space.sm, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  h: { ...type.title, marginBottom: space.xs },
});
