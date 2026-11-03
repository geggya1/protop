/**
 * Kunder → Kundeundersøkelse. Tre deler:
 *  - Kundeundersøkelse: den årlige undersøkelsen med utvikling over tid.
 *  - Evalueringer: prosjekt- og tilbudsevalueringer (EvaluationsPanel.jsx).
 *  - Maler: selskapets maler for undersøkelser og evalueringer (SurveyTemplatesPanel.jsx).
 * Mottakeren svarer på protop.no/svar/… uten innlogging (screens/surveys/SurveyAnswerScreen.jsx)
 * og får en kopi av svaret på e-post.
 *
 * All data går gjennom callable `customerSurvey` (src/surveys/customerService.js).
 * Tilgang: Kunder med Lese ser resultatene, Begrenset redigering lager og sender. Med bare
 * Prosjekt ser og sender man evalueringene, ikke kundeundersøkelsen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadCustomerList } from '../../src/anbud/storage';
import {
  CUSTOMER_GOOD_SCORE, customerTrendPoints, newCustomerSurvey, normalizeCustomerSurvey, templateList,
} from '../../src/surveys/customerSurvey';
import { surveyDeadline } from '../../src/hr/survey';
import { formatNbDate } from '../../src/hr/model';
import { customerSurveyCall } from '../../src/surveys/customerClient';
import { surveyTrend, trendSentence, uniqueSurveyTitle } from '../../src/surveys/trend';
import { csvFileName, downloadCsv, trendCsvRows } from '../../src/surveys/csv';
import { showSaveToast } from '../../src/ui/saveToast';
import { chartColorsFor } from '../../src/ui/chartColors';
import { useLayout } from '../../src/theme';
import { radius, space, type } from '../../src/ui/tokens';
import SurveyTrend from '../../components/surveys/SurveyTrend';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrSectionTitle,
} from '../hr/HrShared';
import { STATUS_LABEL, SurveyDetail, defaultDeadline } from './CustomerSurveyDetail';
import EvaluationsPanel, { unitOptions } from './EvaluationsPanel';
import SurveyTemplatesPanel from './SurveyTemplatesPanel';

const SECTIONS = [
  { id: 'customer', label: 'Kundeundersøkelse' },
  { id: 'evaluations', label: 'Evalueringer' },
  { id: 'templates', label: 'Maler' },
];

function SurveyRow({ colors, survey, onOpen }) {
  const chart = chartColorsFor(colors);
  const pct = survey.stats.sent ? Math.min(100, Math.round((survey.stats.answered / survey.stats.sent) * 100)) : 0;
  const dl = surveyDeadline(survey);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" style={[styles.row, { borderColor: colors.line }]} nativeID={`customer-survey-row-${survey.id}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[styles.bodyStrong, { color: colors.ink }]}>{survey.title}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {[
            STATUS_LABEL[survey.status],
            survey.anonymous ? 'anonym' : '',
            survey.status === 'draft' ? `${survey.stats.recipients} mottakere` : `${survey.stats.answered} av ${survey.stats.sent} svarte`,
            survey.status === 'open' && dl.date ? (dl.passed ? 'fristen er ute' : `frist ${formatNbDate(dl.date)}`) : '',
            survey.summary?.ready && survey.summary.nps != null ? `NPS ${survey.summary.nps}` : '',
            survey.summary?.ready && survey.summary.index != null ? `tilfredshet ${survey.summary.index}` : '',
          ].filter(Boolean).join(' · ')}
        </Text>
        {survey.status === 'open' ? (
          <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
            <View style={[styles.meterFill, { width: `${pct}%`, backgroundColor: chart.bar }]} />
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/** familyIdOverride og companyNameOverride brukes av den lokale demoen (/kundeundersokelse-demo). */
export default function CustomerSurveyScreen({ familyIdOverride = '', companyNameOverride = '', initialSection = '' } = {}) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const app = useApp();
  const familyId = familyIdOverride || app.familyId;
  const { family, uid } = app;
  const access = useCompanyAccess();
  // Begrenset redigering på Kunder lager og sender (som serveren). Prosjekt gir det samme for evalueringer.
  const canWrite = !!access?.ready && !!access.canEdit?.('customers');
  const canEvaluate = canWrite || (!!access?.ready && !!access.canEdit?.('projects'));
  const seesCustomers = !access?.ready || !!access.canView?.('customers');
  const [section, setSection] = useState(initialSection || (seesCustomers ? 'customer' : 'evaluations'));
  const [surveys, setSurveys] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [tab, setTab] = useState('list');
  const [customers, setCustomers] = useState([]);
  const companyName = companyNameOverride || family?.name || '';
  const units = useMemo(() => unitOptions(family?.company?.subUnits), [family?.company?.subUnits]);

  const reload = useCallback(() => {
    customerSurveyCall('list', { familyId })
      .then((r) => { setSurveys((r.surveys || []).map(normalizeCustomerSurvey)); setError(''); })
      .catch((err) => { setSurveys([]); setError(err?.message || 'Kunne ikke hente kundeundersøkelsene.'); });
  }, [familyId]);
  const reloadTemplates = useCallback(() => {
    customerSurveyCall('templates', { familyId })
      .then((r) => setTemplates(r.templates || templateList()))
      .catch(() => setTemplates(templateList()));
  }, [familyId]);
  useEffect(() => { if (familyId) { reload(); reloadTemplates(); } }, [familyId, reload, reloadTemplates]);
  useEffect(() => {
    if (!familyId || !canEvaluate) return;
    loadCustomerList(familyId, { onCache: setCustomers }).then((r) => setCustomers(r?.customers || r || [])).catch(() => {});
  }, [familyId, canEvaluate]);

  const customerSurveys = useMemo(() => (surveys || []).filter((s) => s.kind === 'customer'), [surveys]);
  const trend = useMemo(() => surveyTrend(customerTrendPoints(customerSurveys)), [customerSurveys]);
  const hasActive = customerSurveys.some((s) => s.status !== 'closed');
  const latest = customerSurveys[0] || null;
  const current = (surveys || []).find((s) => s.id === selected) || null;

  const create = async () => {
    try {
      const template = customerSurveys.find((s) => s.status === 'closed') || latest;
      const fresh = newCustomerSurvey({ uid, template });
      const draft = { ...fresh, title: uniqueSurveyTitle(fresh.title, customerSurveys.map((s) => s.title)), closesOn: defaultDeadline() };
      const r = await customerSurveyCall('save', { familyId, survey: draft });
      showSaveToast?.(template ? 'Undersøkelsen er laget med de samme spørsmålene som sist.' : 'Undersøkelsen er laget. Se over spørsmålene og velg mottakere.');
      reload();
      setSelected(r.survey?.id || '');
    } catch (err) {
      showSaveToast?.(err?.message || 'Kunne ikke lage undersøkelsen');
    }
  };

  const sections = SECTIONS.filter((s) => s.id !== 'customer' || seesCustomers);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={[styles.page, isPhone && styles.pagePhone]}>
      <HrCard colors={colors}>
        <View style={styles.stack} nativeID="customer-survey">
          {current ? (
            <SurveyDetail
              key={`${current.id}:${current.status}`}
              colors={colors}
              familyId={familyId}
              survey={current}
              surveys={surveys}
              customers={customers}
              companyName={companyName}
              canWrite={current.kind === 'customer' ? canWrite : canEvaluate}
              onBack={() => setSelected('')}
              onChanged={reload}
            />
          ) : (
            <>
              <View style={styles.chips} accessibilityRole="tablist">
                {sections.map((s) => (
                  <HrChip key={s.id} colors={colors} label={s.label} active={section === s.id} onPress={() => setSection(s.id)} nativeID={`customer-survey-section-${s.id}`} />
                ))}
              </View>
              {error ? <EmptyHint colors={colors} text={error} /> : null}

              {section === 'evaluations' ? (
                <EvaluationsPanel
                  colors={colors}
                  familyId={familyId}
                  uid={uid}
                  surveys={surveys || []}
                  templates={templates}
                  units={units}
                  customers={customers}
                  companyName={companyName}
                  canWrite={canEvaluate}
                  onOpen={setSelected}
                  onChanged={reload}
                />
              ) : null}

              {section === 'templates' ? (
                <SurveyTemplatesPanel
                  colors={colors}
                  familyId={familyId}
                  templates={templates}
                  companyName={companyName}
                  canEdit={canWrite}
                  onChanged={reloadTemplates}
                />
              ) : null}

              {section === 'customer' ? (
                <>
                  <HrSectionTitle
                    colors={colors}
                    title="Kundeundersøkelse"
                    subtitle="Spør kundene hva de synes, og følg utviklingen år for år. Kundene får en personlig lenke på e-post, svarer uten innlogging og får en kopi av svaret. Resultatet viser NPS, tilfredshet per område, hva som må bedres og hvilke kunder som bør følges opp (ISO 9001 punkt 9.1.2)."
                    right={canWrite && !hasActive ? (
                      <HrButton colors={colors} primary icon="add" label="Ny kundeundersøkelse" onPress={create} nativeID="customer-survey-new" />
                    ) : null}
                  />
                  {trend ? (
                    <View style={styles.chips}>
                      <HrChip colors={colors} label="Undersøkelser" active={tab === 'list'} onPress={() => setTab('list')} nativeID="customer-survey-tab-list" />
                      <HrChip colors={colors} label="Utvikling over tid" active={tab === 'trend'} onPress={() => setTab('trend')} nativeID="customer-survey-tab-trend" />
                      {trendSentence(trend, { key: 'nps' }) ? <Text style={[styles.caption, { color: colors.muted }]}>{`NPS: ${trendSentence(trend, { key: 'nps' }).toLowerCase()}`}</Text> : null}
                    </View>
                  ) : null}
                  {surveys === null ? <EmptyHint colors={colors} text="Henter kundeundersøkelser …" /> : null}
                  {surveys && !customerSurveys.length && !error ? (
                    <EmptyHint colors={colors} text="Ingen kundeundersøkelser ennå. Mange sender én hvert år. Etter et prosjekt passer en prosjektevaluering bedre (under Evalueringer)." />
                  ) : null}
                  {tab === 'trend' && trend ? (
                    <SurveyTrend
                      colors={colors}
                      trend={trend}
                      metric="nps"
                      target={0}
                      indexLabel="Tilfredshet"
                      nativeID="customer-survey-trend"
                      onExport={() => downloadCsv(csvFileName('kundeundersokelse', 'utvikling'), trendCsvRows(trend, { indexLabel: 'Tilfredshet' }))}
                    />
                  ) : customerSurveys.map((s) => (
                    <SurveyRow key={s.id} colors={colors} survey={s} onOpen={() => setSelected(s.id)} />
                  ))}
                  {!canWrite && access?.ready ? (
                    <Text style={[styles.caption, { color: colors.muted }]}>Du kan se resultatene. For å lage og sende undersøkelser trengs Begrenset redigering på Kunder.</Text>
                  ) : null}
                  {trend && tab === 'list' && trend.points.length ? (
                    <Text style={[styles.caption, { color: colors.muted }]}>{`Mål for tilfredshet per område: ${CUSTOMER_GOOD_SCORE} av 100.`}</Text>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </View>
      </HrCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.sm, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  pagePhone: { padding: space.xs },
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  twoCol: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  col: { flexGrow: 1, flexBasis: 260, gap: 4 },
  title: { ...type.title },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.control, padding: space.xs },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  qRow: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start', borderTopWidth: 1, paddingTop: space.xs },
  num: { ...type.body, width: 24, paddingTop: 18 },
  qTools: { flexDirection: 'row', gap: 4, paddingTop: 16 },
  iconBtn: { width: 32, height: 32, borderWidth: 1, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 6, ...type.body },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, paddingVertical: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill },
  deadlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingVertical: space.xs },
});
