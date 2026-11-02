import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SURVEY_GOOD_SCORE, SURVEY_MIN_ANSWERS, SURVEY_TEMPLATES, defaultDeadline, surveyKind, hrTrendPoints, newSurvey, participation, previousSurvey,
  surveyAnalysis, surveyCsvRows, surveyDeadline, surveyResults,
} from '../../src/hr/survey';
import {
  closeSurvey, countSurveyAnswers, deleteDraftSurvey, loadSurveyResult, loadSurveys, notifySurveyEmployees, openSurvey,
  saveSurvey, setSurveyDeadline,
} from '../../src/hr/surveyStore';
import { formatNbDate } from '../../src/hr/model';
import { actionEffects, planFor, upsertPlan } from '../../src/hr/surveyPlan';
import ResponseMeter from '../../components/surveys/ResponseMeter';
import HrSurveyPlan, { ActionEffects } from './HrSurveyPlan';
import { surveyTrend, trendSentence, uniqueSurveyTitle } from '../../src/surveys/trend';
import { csvFileName, downloadCsv, trendCsvRows } from '../../src/surveys/csv';
import { showSaveToast } from '../../src/ui/saveToast';
import { useConfirm } from '../../src/ui/useConfirm';
import { chartColorsFor } from '../../src/ui/chartColors';
import SurveyTrend from '../../components/surveys/SurveyTrend';
import { EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';
import HrSurveyResults from './HrSurveyResults';
import HrSurveyEditor from './HrSurveyEditor';

const STATUS_LABEL = { draft: 'Utkast', open: 'Åpen for svar', closed: 'Avsluttet' };

function deadlineText(dl) {
  if (!dl.date) return '';
  if (dl.passed) return `fristen gikk ut ${formatNbDate(dl.date)}`;
  if (dl.daysLeft === 0) return 'frist i dag';
  return `frist ${formatNbDate(dl.date)} (${dl.daysLeft} ${dl.daysLeft === 1 ? 'dag' : 'dager'} igjen)`;
}

/**
 * Én undersøkelse: utkast (redigering), åpen (svarprosent, frist, purring) eller avsluttet
 * (resultat og analyse). result: serverens resultat for en avsluttet undersøkelse, lastet av siden.
 */
function SurveyItem({
  colors, survey, previous, result, prevResult, familyId, invited, canWrite, onChanged, onCreateTask, onOpenHandbook,
  plans, onPatch,
  open: startOpen,
}) {
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!!startOpen);
  const [editDeadline, setEditDeadline] = useState(false);
  const [deadline, setDeadline] = useState(survey.closesOn || '');
  const confirm = useConfirm();

  const key = `${survey.id}:${survey.status}`;
  useEffect(() => {
    let live = true;
    if (survey.status !== 'open') return undefined;
    setCount(null);
    countSurveyAnswers(familyId, survey.id)
      .then((n) => { if (live) setCount(n); })
      .catch(() => { if (live) setCount(0); });
    return () => { live = false; };
  }, [familyId, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn, okText, failText) => {
    if (busy) return false;
    setBusy(true);
    try {
      const res = await fn();
      const text = typeof okText === 'function' ? okText(res) : okText;
      if (text) showSaveToast?.(text);
      onChanged?.();
      return true;
    } catch (err) {
      showSaveToast?.(err?.message && /purret|åpen/.test(err.message) ? err.message : failText);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openForAnswers = () => run(async () => {
    const s = survey.closesOn ? survey : { ...survey, closesOn: defaultDeadline() };
    await openSurvey(familyId, s);
    // Varselet er en ekstra tjeneste: undersøkelsen er åpen selv om varslingen feiler.
    try {
      return await notifySurveyEmployees(familyId, survey.id, 'open');
    } catch {
      return null;
    }
  }, (res) => (res?.notified != null
    ? `Undersøkelsen er åpnet. ${res.notified} ${res.notified === 1 ? 'ansatt er' : 'ansatte er'} varslet, og svarer på Min side.`
    : 'Undersøkelsen er åpnet. De ansatte svarer på Min side.'), 'Kunne ikke åpne undersøkelsen');

  const close = () => run(
    () => closeSurvey(familyId, survey.id),
    (res) => (res?.ready ? 'Undersøkelsen er avsluttet.' : `Undersøkelsen er avsluttet. ${res?.count ?? 0} svarte, for få til å vise resultat.`),
    'Kunne ikke avslutte undersøkelsen',
  );

  const remind = () => run(
    () => notifySurveyEmployees(familyId, survey.id, 'remind'),
    (res) => (res?.notified ? `Påminnelse sendt til ${res.notified} som ikke har svart.` : 'Alle har svart. Ingen påminnelse sendt.'),
    'Kunne ikke sende påminnelse',
  );

  const saveDeadline = () => run(async () => {
    await setSurveyDeadline(familyId, survey.id, deadline);
    setEditDeadline(false);
  }, 'Svarfristen er endret.', 'Kunne ikke endre fristen');

  const saveDraft = (draft) => run(() => saveSurvey(familyId, draft), 'Utkastet er lagret.', 'Kunne ikke lagre utkastet');

  const remove = async () => {
    const ok = await confirm({ title: 'Slette utkastet?', message: `«${survey.title}» slettes.`, confirmText: 'Slett', tone: 'danger' });
    if (ok) run(() => deleteDraftSurvey(familyId, survey.id), 'Utkastet er slettet.', 'Kunne ikke slette utkastet');
  };

  const results = useMemo(() => (result ? { ...surveyResults(survey, result.answers), count: result.count } : null), [result, survey]);
  const prevResults = useMemo(() => (previous && prevResult ? surveyResults(previous, prevResult.answers) : null), [previous, prevResult]);
  const answered = survey.status === 'closed' ? (results?.count ?? 0) : (count || 0);
  const part = participation(answered, invited);
  const chart = chartColorsFor(colors);
  const analysis = results?.ready ? surveyAnalysis(results, prevResults) : null;
  const dl = surveyDeadline(survey);
  const plan = planFor(plans, survey.id);
  const effects = useMemo(() => (previous && results?.ready && prevResults?.ready
    ? actionEffects(planFor(plans, previous.id), prevResults.areas, results.areas) : []), [plans, previous, results, prevResults]);

  const exportCsv = () => {
    if (!downloadCsv(csvFileName(survey.title, 'resultat'), surveyCsvRows(survey, results, analysis))) {
      showSaveToast?.('Nedlasting virker bare i nettleseren.');
    }
  };

  return (
    <View style={[styles.item, { borderColor: colors.line }]} nativeID={`hr-survey-${survey.id}`}>
      <View style={styles.itemHead}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={[styles.itemTitle, { color: colors.ink }]}>{survey.title}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {[
              STATUS_LABEL[survey.status],
              survey.openedAt ? `åpnet ${formatNbDate(survey.openedAt)}` : '',
              survey.status === 'open' ? deadlineText(dl) : '',
              survey.closedAt ? `avsluttet ${formatNbDate(survey.closedAt)}` : '',
              `${survey.questions.length} spørsmål`,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {canWrite && survey.status === 'draft' ? (
          <HrButton colors={colors} primary icon="send" label="Åpne og varsle de ansatte" onPress={openForAnswers} disabled={busy} nativeID="hr-survey-open" />
        ) : null}
        {canWrite && survey.status === 'open' ? (
          <>
            <HrButton colors={colors} icon="notifications-outline" label="Purre" onPress={remind} disabled={busy} nativeID="hr-survey-remind" />
            <HrButton colors={colors} primary={dl.passed} icon="lock-closed" label="Avslutt og vis resultat" onPress={close} disabled={busy} nativeID="hr-survey-close" />
          </>
        ) : null}
      </View>

      {survey.status === 'draft' && canWrite ? (
        <HrSurveyEditor colors={colors} survey={survey} previous={previous} busy={busy} onSave={saveDraft} onDelete={remove} />
      ) : null}
      {survey.status === 'draft' && !canWrite ? (
        <Text style={[styles.meta, { color: colors.muted }]}>Utkast. Bare HR kan endre og åpne undersøkelsen.</Text>
      ) : null}

      {survey.status === 'open' ? (
        <View style={styles.stack}>
          {dl.passed && canWrite ? (
            <View style={[styles.banner, { borderColor: colors.warn, backgroundColor: colors.sunken }]} nativeID="hr-survey-deadline-passed">
              <Text style={[styles.meta, { color: colors.ink }]}>{`Svarfristen gikk ut ${formatNbDate(dl.date)}. Avslutt undersøkelsen for å se resultatet, eller sett en ny frist.`}</Text>
            </View>
          ) : null}
          {count == null ? <Text style={[styles.meta, { color: colors.muted }]}>Teller svar …</Text> : (
            <ResponseMeter
              colors={colors}
              pct={part.pct}
              count={part.count}
              of={part.invited}
              label={part.pct != null ? `${part.count} av ${part.invited} med brukerkonto har svart` : `${part.count} har svart`}
              nativeID="hr-survey-response"
            />
          )}
          <Text style={[styles.meta, { color: colors.muted }]}>
            {[
              survey.notifiedAt ? `Varslet ${formatNbDate(survey.notifiedAt)}` : '',
              survey.remindedAt ? `purret ${formatNbDate(survey.remindedAt)}${survey.reminders > 1 ? ` (${survey.reminders} ganger)` : ''}` : '',
              'Påminnelsen går bare til dem som ikke har svart, uten at du får vite hvem.',
            ].filter(Boolean).join(' · ')}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {`Resultatene vises når undersøkelsen er avsluttet og minst ${SURVEY_MIN_ANSWERS} har svart. En avsluttet undersøkelse kan ikke åpnes igjen.`}
          </Text>
          {canWrite ? (editDeadline ? (
            <View style={styles.deadlineRow}>
              <View style={{ minWidth: 200 }}>
                <HrField colors={colors} label="Ny svarfrist" value={deadline} date="iso" onChangeText={(v) => setDeadline(v || '')} />
              </View>
              <HrButton colors={colors} primary icon="checkmark" label="Lagre frist" onPress={saveDeadline} disabled={busy} />
              <HrButton colors={colors} label="Avbryt" onPress={() => setEditDeadline(false)} />
            </View>
          ) : (
            <View style={styles.actions}>
              <HrChip colors={colors} label={dl.date ? 'Endre svarfrist' : 'Sett svarfrist'} onPress={() => setEditDeadline(true)} nativeID="hr-survey-deadline" />
            </View>
          )) : null}
        </View>
      ) : null}

      {survey.status === 'closed' && result === null ? (
        <EmptyHint colors={colors} text="Resultatet behandles. Last siden på nytt om litt." />
      ) : null}
      {survey.status === 'closed' && results && !results.ready ? (
        <EmptyHint colors={colors} text={results.count < SURVEY_MIN_ANSWERS
          ? `Bare ${results.count} svarte. Med færre enn ${SURVEY_MIN_ANSWERS} vises ingen resultater, så ingen kan kjennes igjen.`
          : `For få svar per spørsmål (under ${SURVEY_MIN_ANSWERS}) til å vise resultater.`}
        />
      ) : null}
      {analysis && !open ? (
        <View style={styles.summaryRow}>
          <Text style={[styles.meta, { color: colors.ink }]}>
            {`Totalindeks ${analysis.index} av 100 · ${results.count} svar${analysis.weakAreas.length ? ` · ${analysis.weakAreas.length} forbedringsområde${analysis.weakAreas.length === 1 ? '' : 'r'}` : ''}${plan.actions.length ? ` · ${plan.actions.filter((a) => a.status === 'done').length} av ${plan.actions.length} tiltak gjennomført` : ''}`}
          </Text>
          <HrChip colors={colors} label="Vis resultat" onPress={() => setOpen(true)} />
        </View>
      ) : null}
      {analysis && open ? (
        <>
          <HrSurveyResults
            colors={colors}
            survey={survey}
            results={results}
            analysis={analysis}
            participation={part}
            canWrite={canWrite}
            onCreateTask={onCreateTask}
            onOpenHandbook={onOpenHandbook}
          />
          {effects.length ? <ActionEffects colors={colors} effects={effects} previousTitle={previous?.title || 'forrige undersøkelse'} /> : null}
          <View style={[styles.planBox, { borderColor: colors.line }]}>
            <HrSurveyPlan
              colors={colors}
              survey={survey}
              plan={plan}
              analysis={analysis}
              canWrite={canWrite && !!onPatch}
              onCreateTask={onCreateTask}
              onUpdate={(fn) => onPatch?.((state) => ({
                surveyPlans: upsertPlan(state.surveyPlans, fn(planFor(state.surveyPlans, survey.id))),
              }))}
            />
          </View>
          {Platform.OS === 'web' ? (
            <View style={styles.actions}>
              <HrButton colors={colors} icon="download-outline" label="Last ned resultat (Excel)" onPress={exportCsv} nativeID="hr-survey-export" />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const TEMPLATE_ICON = { arbeidsmiljo: 'shield-checkmark-outline', motivasjon: 'rocket-outline', puls: 'pulse-outline' };

/** Et valg i malvelgeren. */
function TemplateCard({
  colors, icon, title, hint, recommended, onPress, nativeID,
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      nativeID={nativeID}
      style={({ hovered }) => [styles.tcard, { borderColor: recommended ? (colors.brandInk || colors.brand) : colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}
    >
      <View style={styles.tcardHead}>
        <View style={[styles.ticon, { backgroundColor: colors.sunken }]}>
          <Ionicons name={icon || 'document-text-outline'} size={18} color={colors.brandInk || colors.brand} />
        </View>
        {recommended ? <Text style={[styles.badgeText, { color: colors.brandInk || colors.brand }]}>Anbefalt</Text> : null}
      </View>
      <Text style={[styles.itemTitle, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.meta, { color: colors.muted }]}>{hint}</Text>
    </Pressable>
  );
}

/**
 * HR → Oppfølging → Medarbeiderundersøkelse. invited: egne ansatte med brukerkonto.
 */
export default function HrSurvey({
  colors, familyId, canWrite, invited, uid, onCreateTask, onOpenHandbook, plans = [], onPatch,
}) {
  const [surveys, setSurveys] = useState(null);
  const [error, setError] = useState('');
  // Serverens resultat per avsluttet undersøkelse: objekt, null (behandles) eller undefined (lastes).
  const [resultsById, setResultsById] = useState({});
  const [tab, setTab] = useState('surveys');

  const reload = useCallback(() => {
    if (!familyId) return;
    loadSurveys(familyId)
      .then((rows) => { setSurveys(rows); setError(''); })
      .catch(() => { setSurveys([]); setError('Kunne ikke hente undersøkelsene.'); });
  }, [familyId]);

  useEffect(() => { reload(); }, [reload]);

  const closedIds = (surveys || []).filter((s) => s.status === 'closed').map((s) => s.id).join(',');
  useEffect(() => {
    let live = true;
    const ids = closedIds ? closedIds.split(',') : [];
    Promise.all(ids.map((id) => loadSurveyResult(familyId, id).catch(() => null)))
      .then((rows) => {
        if (!live) return;
        setResultsById(Object.fromEntries(ids.map((id, i) => [id, rows[i]])));
      });
    return () => { live = false; };
  }, [familyId, closedIds]);

  const latestClosed = (surveys || []).find((s) => s.status === 'closed') || null;
  const [choosing, setChoosing] = useState(false);
  const create = async (templateId = '') => {
    setChoosing(false);
    try {
      // «Som sist»: samme spørsmål som forrige av samme slag, så tallene kan sammenlignes fra år til år.
      const fresh = newSurvey({ uid, template: templateId ? null : latestClosed, templateId });
      await saveSurvey(familyId, {
        ...fresh,
        title: uniqueSurveyTitle(fresh.title, (surveys || []).map((s) => s.title)),
        closesOn: defaultDeadline(),
      });
      showSaveToast?.(latestClosed && !templateId
        ? 'Undersøkelsen er laget med de samme spørsmålene som sist. Se over og åpne den.'
        : 'Undersøkelsen er laget. Se over spørsmålene og åpne den.');
      reload();
    } catch {
      showSaveToast?.('Kunne ikke lage undersøkelsen');
    }
  };

  const hasActive = (surveys || []).some((s) => s.status !== 'closed');
  const previousById = useMemo(
    () => new Map((surveys || []).map((s) => [s.id, previousSurvey(surveys, s.status === 'closed' ? s : { ...s, closedAt: '9999' })])),
    [surveys],
  );
  const resultsReady = useMemo(() => Object.fromEntries((surveys || [])
    .filter((s) => s.status === 'closed' && resultsById[s.id])
    .map((s) => [s.id, surveyResults(s, resultsById[s.id].answers)])), [surveys, resultsById]);
  // Utviklingen vises per slag undersøkelse (arbeidsmiljø, motivasjon, puls), ellers sammenlignes ulike spørsmål.
  const kinds = useMemo(() => SURVEY_TEMPLATES.filter((t) => (surveys || []).some((x) => x.status === 'closed' && surveyKind(x) === t.id)), [surveys]);
  const [kind, setKind] = useState('');
  const activeKind = kinds.some((k) => k.id === kind) ? kind : (kinds[0]?.id || 'arbeidsmiljo');
  const trend = useMemo(() => surveyTrend(hrTrendPoints(surveys, resultsReady, invited, activeKind)), [surveys, resultsReady, invited, activeKind]);
  const sentence = trendSentence(trend);
  const firstClosed = (surveys || []).findIndex((x) => x.status === 'closed');

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-survey" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Medarbeiderundersøkelse"
          subtitle="Anonym kartlegging av arbeidsmiljø, motivasjon og mestring. De ansatte varsles og svarer på Min side. Ingen kan se hvem som svarte hva. Gjør den hvert år med de samme spørsmålene, lag en tiltaksplan, og se om tiltakene virket."
          right={canWrite && !hasActive ? (
            <HrButton colors={colors} primary icon="add" label="Ny undersøkelse" onPress={() => setChoosing((v) => !v)} nativeID="hr-survey-new" />
          ) : null}
        />
        {choosing && canWrite ? (
          <View style={styles.choose} nativeID="hr-survey-templates">
            <Text style={[styles.itemTitle, { color: colors.ink }]}>Hva vil dere måle?</Text>
            <View style={styles.cards}>
              {latestClosed ? (
                <TemplateCard
                  colors={colors}
                  icon="repeat"
                  title={`Som sist: ${latestClosed.title.replace(/\s*\d{4}.*$/, '')}`}
                  hint={`Samme ${latestClosed.questions.length} spørsmål som «${latestClosed.title}», så dere ser utviklingen. Anbefalt hvert år.`}
                  recommended
                  onPress={() => create('')}
                  nativeID="hr-survey-template-same"
                />
              ) : null}
              {SURVEY_TEMPLATES.map((t) => (
                <TemplateCard
                  key={t.id}
                  colors={colors}
                  icon={TEMPLATE_ICON[t.id]}
                  title={t.label}
                  hint={t.hint}
                  recommended={!latestClosed && t.id === 'arbeidsmiljo'}
                  onPress={() => create(t.id)}
                  nativeID={`hr-survey-template-${t.id}`}
                />
              ))}
            </View>
            <Text style={[styles.meta, { color: colors.muted }]}>Spørsmålene kan endres før undersøkelsen åpnes. Alle svarer på en skala fra 1 (helt uenig) til 5 (helt enig).</Text>
          </View>
        ) : null}
        {trend ? (
          <View style={styles.tabs}>
            <HrChip colors={colors} label="Undersøkelser" active={tab === 'surveys'} onPress={() => setTab('surveys')} nativeID="hr-survey-tab-list" />
            <HrChip colors={colors} label={`Utvikling over tid${trend.points.length > 1 ? ` (${trend.points.length})` : ''}`} active={tab === 'trend'} onPress={() => setTab('trend')} nativeID="hr-survey-tab-trend" />
            {sentence ? <Text style={[styles.meta, { color: colors.muted }]}>{`Totalindeks: ${sentence.toLowerCase()}`}</Text> : null}
          </View>
        ) : null}
        {surveys === null ? <EmptyHint colors={colors} text="Henter undersøkelser …" /> : null}
        {error ? <EmptyHint colors={colors} text={error} /> : null}
        {surveys && !surveys.length && !error ? (
          <EmptyHint colors={colors} text="Ingen undersøkelser ennå. Mange gjør dette hver høst, og ser utviklingen år for år." />
        ) : null}
        {tab === 'trend' && kinds.length > 1 ? (
          <View style={styles.tabs}>
            {kinds.map((k) => (
              <HrChip key={k.id} colors={colors} label={k.label} active={activeKind === k.id} onPress={() => setKind(k.id)} nativeID={`hr-survey-kind-${k.id}`} />
            ))}
          </View>
        ) : null}
        {tab === 'trend' && trend ? (
          <SurveyTrend
            colors={colors}
            trend={trend}
            metric="index"
            target={SURVEY_GOOD_SCORE}
            indexLabel="Totalindeks"
            nativeID="hr-survey-trend"
            onExport={() => downloadCsv(csvFileName('medarbeiderundersokelse', 'utvikling'), trendCsvRows(trend))}
          />
        ) : (surveys || []).map((s, i) => (
          <SurveyItem
            key={s.id}
            colors={colors}
            survey={s}
            previous={previousById.get(s.id) || null}
            result={s.status === 'closed' ? resultsById[s.id] : undefined}
            prevResult={previousById.get(s.id) ? resultsById[previousById.get(s.id).id] : null}
            familyId={familyId}
            invited={invited}
            canWrite={canWrite}
            onChanged={reload}
            onCreateTask={onCreateTask}
            onOpenHandbook={onOpenHandbook}
            plans={plans}
            onPatch={onPatch}
            open={i === firstClosed}
          />
        ))}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  choose: { gap: space.xs },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tcard: { flexGrow: 1, flexBasis: 220, borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  tcardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ticon: { width: 32, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  badgeText: { ...type.caption, fontWeight: '600' },
  planBox: { borderTopWidth: 1, paddingTop: space.xs },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  item: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  itemHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  itemTitle: { ...type.bodyStrong },
  meta: { ...type.label, fontWeight: '400' },
  banner: { borderWidth: 1, borderRadius: radius.control, padding: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  deadlineRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 6 },
});
