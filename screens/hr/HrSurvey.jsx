import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  SURVEY_MIN_ANSWERS, newSurvey, participation, previousSurvey, surveyAnalysis, surveyResults,
} from '../../src/hr/survey';
import {
  closeSurvey, countSurveyAnswers, loadSurveyResult, loadSurveys, openSurvey, saveSurvey,
} from '../../src/hr/surveyStore';
import { formatNbDate } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { chartColorsFor } from '../../src/ui/chartColors';
import { EmptyHint, HrButton, HrCard, HrChip, HrSectionTitle } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';
import HrSurveyResults from './HrSurveyResults';

const STATUS_LABEL = { draft: 'Utkast', open: 'Åpen for svar', closed: 'Avsluttet' };

/**
 * Én undersøkelse: status, svarprosent og (når avsluttet) resultat og analyse.
 * previous: forrige avsluttede undersøkelse, til utvikling per område og spørsmål.
 */
function SurveyItem({
  colors, survey, previous, familyId, invited, canWrite, onChanged, onCreateTask, onOpenHandbook, open: startOpen,
}) {
  const [count, setCount] = useState(null);
  const [results, setResults] = useState(null);
  const [prevResults, setPrevResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!!startOpen);

  const [pending, setPending] = useState(false);
  // Lastes på nytt bare når undersøkelsen (eller den forrige) faktisk er en annen, ikke ved hver tegning.
  const key = `${survey.id}:${survey.status}`;
  const prevId = previous?.id || '';
  useEffect(() => {
    let live = true;
    setCount(null);
    setResults(null);
    setPending(false);
    if (survey.status === 'draft') {
      setCount(0);
      return undefined;
    }
    (async () => {
      try {
        if (survey.status === 'closed') {
          // Serverens resultat: svarene i tilfeldig rekkefølge, uten id og tidspunkt.
          const [result, prevResult] = await Promise.all([
            loadSurveyResult(familyId, survey.id),
            prevId ? loadSurveyResult(familyId, prevId).catch(() => null) : Promise.resolve(null),
          ]);
          if (!live) return;
          if (!result) {
            setPending(true);
            setCount(0);
            return;
          }
          const r = surveyResults(survey, result.answers);
          setCount(result.count);
          setResults({ ...r, count: result.count });
          setPrevResults(previous && prevResult ? surveyResults(previous, prevResult.answers) : null);
        } else {
          const n = await countSurveyAnswers(familyId, survey.id);
          if (live) setCount(n);
        }
      } catch {
        if (live) setCount(0);
      }
    })();
    return () => { live = false; };
    // previous og survey følger key og prevId.
  }, [familyId, key, prevId]);

  const move = async (to) => {
    if (busy) return;
    setBusy(true);
    try {
      if (to === 'open') {
        await openSurvey(familyId, survey);
        showSaveToast?.('Undersøkelsen er åpnet. De ansatte svarer på Min side.');
      } else {
        const res = await closeSurvey(familyId, survey.id);
        showSaveToast?.(res?.ready ? 'Undersøkelsen er avsluttet.' : `Undersøkelsen er avsluttet. ${res?.count ?? 0} svarte, for få til å vise resultat.`);
      }
      onChanged?.();
    } catch {
      showSaveToast?.(to === 'open' ? 'Kunne ikke åpne undersøkelsen' : 'Kunne ikke avslutte undersøkelsen');
    } finally {
      setBusy(false);
    }
  };

  const part = participation(count || 0, invited);
  const chart = chartColorsFor(colors);
  const analysis = results?.ready ? surveyAnalysis(results, prevResults) : null;
  return (
    <View style={[styles.item, { borderColor: colors.line }]} nativeID={`hr-survey-${survey.id}`}>
      <View style={styles.itemHead}>
        <View style={{ flex: 1, minWidth: 180 }}>
          <Text style={[styles.itemTitle, { color: colors.ink }]}>{survey.title}</Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {[
              STATUS_LABEL[survey.status],
              survey.openedAt ? `åpnet ${formatNbDate(survey.openedAt)}` : '',
              survey.closedAt ? `avsluttet ${formatNbDate(survey.closedAt)}` : '',
              `${survey.questions.length} spørsmål`,
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {canWrite && survey.status === 'draft' ? (
          <HrButton colors={colors} primary icon="send" label="Åpne for svar" onPress={() => move('open')} disabled={busy} nativeID="hr-survey-open" />
        ) : null}
        {canWrite && survey.status === 'open' ? (
          <HrButton colors={colors} icon="lock-closed" label="Avslutt og vis resultat" onPress={() => move('closed')} disabled={busy} nativeID="hr-survey-close" />
        ) : null}
      </View>
      {survey.status === 'open' ? (
        <View style={styles.stack}>
          <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
            <View style={[styles.meterFill, { width: `${part.pct || 0}%`, backgroundColor: chart.bar }]} />
          </View>
          <Text style={[styles.meta, { color: colors.ink }]}>
            {count == null ? 'Teller svar …' : `${part.count} har svart${part.pct != null ? ` av ${part.invited} med brukerkonto (${part.pct} %)` : ''}.`}
          </Text>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {`Resultatene vises når undersøkelsen er avsluttet og minst ${SURVEY_MIN_ANSWERS} har svart. En avsluttet undersøkelse kan ikke åpnes igjen.`}
          </Text>
        </View>
      ) : null}
      {survey.status === 'draft' ? (
        <Text style={[styles.meta, { color: colors.muted }]}>Spørsmålene kan ikke endres etter at undersøkelsen er åpnet.</Text>
      ) : null}
      {survey.status === 'closed' && pending ? (
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
            {`Totalindeks ${analysis.index} av 100 · ${results.count} svar${analysis.weakAreas.length ? ` · ${analysis.weakAreas.length} forbedringsområde${analysis.weakAreas.length === 1 ? '' : 'r'}` : ''}`}
          </Text>
          <HrChip colors={colors} label="Vis resultat" onPress={() => setOpen(true)} />
        </View>
      ) : null}
      {analysis && open ? (
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
      ) : null}
    </View>
  );
}

/**
 * HR → Oppfølging → Medarbeiderundersøkelse. invited: egne ansatte med brukerkonto.
 */
export default function HrSurvey({
  colors, familyId, canWrite, invited, uid, onCreateTask, onOpenHandbook,
}) {
  const [surveys, setSurveys] = useState(null);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    if (!familyId) return;
    loadSurveys(familyId)
      .then((rows) => { setSurveys(rows); setError(''); })
      .catch(() => { setSurveys([]); setError('Kunne ikke hente undersøkelsene.'); });
  }, [familyId]);

  useEffect(() => { reload(); }, [reload]);

  const create = async () => {
    try {
      await saveSurvey(familyId, newSurvey({ uid }));
      showSaveToast?.('Undersøkelsen er laget. Se over spørsmålene og åpne den.');
      reload();
    } catch {
      showSaveToast?.('Kunne ikke lage undersøkelsen');
    }
  };

  const hasActive = (surveys || []).some((s) => s.status !== 'closed');
  // Samme objekt mellom tegninger, så resultatene ikke lastes på nytt.
  const previousById = useMemo(
    () => new Map((surveys || []).map((s) => [s.id, s.status === 'closed' ? previousSurvey(surveys, s) : null])),
    [surveys],
  );
  return (
    <HrCard colors={colors}>
      <View nativeID="hr-survey" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Medarbeiderundersøkelse"
          subtitle="Anonym kartlegging av arbeidsmiljøet: trivsel, arbeidsmengde, ledelse, samarbeid, HMS og trakassering. De ansatte svarer på Min side. Ingen kan se hvem som svarte hva."
          right={canWrite && !hasActive ? (
            <HrButton colors={colors} primary icon="add" label="Ny undersøkelse" onPress={create} nativeID="hr-survey-new" />
          ) : null}
        />
        {surveys === null ? <EmptyHint colors={colors} text="Henter undersøkelser …" /> : null}
        {error ? <EmptyHint colors={colors} text={error} /> : null}
        {surveys && !surveys.length && !error ? (
          <EmptyHint colors={colors} text="Ingen undersøkelser ennå. Mange gjør dette hver høst." />
        ) : null}
        {(surveys || []).map((s, i) => (
          <SurveyItem
            key={s.id}
            colors={colors}
            survey={s}
            previous={previousById.get(s.id) || null}
            familyId={familyId}
            invited={invited}
            canWrite={canWrite}
            onChanged={reload}
            onCreateTask={onCreateTask}
            onOpenHandbook={onOpenHandbook}
            open={i === (surveys || []).findIndex((x) => x.status === 'closed')}
          />
        ))}
        {surveys?.find((s) => s.status === 'draft') ? (
          <View style={styles.stack}>
            <Text style={[styles.itemTitle, { color: colors.ink }]}>Spørsmål (1 = helt uenig, 5 = helt enig)</Text>
            {surveys.find((s) => s.status === 'draft').questions.map((q, i) => (
              <Text key={q.id} style={[styles.meta, { color: colors.ink }]}>{`${i + 1}. ${q.text}`}</Text>
            ))}
          </View>
        ) : null}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  item: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  itemHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  itemTitle: { ...type.bodyStrong },
  meta: { ...type.label, fontWeight: '400' },
});
