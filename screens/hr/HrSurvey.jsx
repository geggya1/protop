import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  SURVEY_MIN_ANSWERS, newSurvey, participation, surveyResults, surveyTransition,
} from '../../src/hr/survey';
import { countSurveyReceipts, loadSurveyAnswers, loadSurveys, saveSurvey } from '../../src/hr/surveyStore';
import { formatNbDate } from '../../src/hr/model';
import { toneColor } from '../../src/hr/uiHelpers';
import { showSaveToast } from '../../src/ui/saveToast';
import { EmptyHint, HrButton, HrCard, HrSectionTitle, HrStat } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';

const STATUS_LABEL = { draft: 'Utkast', open: 'Åpen for svar', closed: 'Avsluttet' };

function scoreTone(score) {
  if (score == null) return 'muted';
  if (score >= 70) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

/** Én undersøkelse: status, svarprosent og (når avsluttet) resultater. */
function SurveyItem({ colors, survey, familyId, invited, canWrite, onChanged }) {
  const [count, setCount] = useState(null);
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setCount(null);
    setResults(null);
    if (survey.status === 'draft') {
      setCount(0);
      return undefined;
    }
    (async () => {
      try {
        if (survey.status === 'closed') {
          const answers = await loadSurveyAnswers(familyId, survey.id);
          if (!live) return;
          const r = surveyResults(survey, answers);
          setCount(r.count);
          setResults(r);
        } else {
          const n = await countSurveyReceipts(familyId, survey.id);
          if (live) setCount(n);
        }
      } catch {
        if (live) setCount(0);
      }
    })();
    return () => { live = false; };
  }, [familyId, survey]);

  const move = async (to) => {
    if (busy) return;
    setBusy(true);
    try {
      await saveSurvey(familyId, surveyTransition(survey, to));
      showSaveToast?.(to === 'open' ? 'Undersøkelsen er åpnet. De ansatte svarer på Min side.' : 'Undersøkelsen er avsluttet.');
      onChanged?.();
    } catch {
      showSaveToast?.('Kunne ikke lagre undersøkelsen');
    } finally {
      setBusy(false);
    }
  };

  const part = participation(count || 0, invited);
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
      {survey.status !== 'draft' ? (
        <Text style={[styles.meta, { color: colors.ink }]}>
          {count == null ? 'Teller svar …' : `${part.count} har svart${part.pct != null ? ` av ${part.invited} med brukerkonto (${part.pct} %)` : ''}.`}
        </Text>
      ) : (
        <Text style={[styles.meta, { color: colors.muted }]}>Spørsmålene kan ikke endres etter at undersøkelsen er åpnet.</Text>
      )}
      {survey.status === 'open' ? (
        <Text style={[styles.meta, { color: colors.muted }]}>
          {`Resultatene vises når undersøkelsen er avsluttet og minst ${SURVEY_MIN_ANSWERS} har svart. En avsluttet undersøkelse kan ikke åpnes igjen.`}
        </Text>
      ) : null}
      {survey.status === 'closed' && results && !results.ready ? (
        <EmptyHint colors={colors} text={`Bare ${results.count} svarte. Med færre enn ${SURVEY_MIN_ANSWERS} vises ingen resultater, så ingen kan kjennes igjen.`} />
      ) : null}
      {results?.ready ? (
        <View style={styles.stack} nativeID={`hr-survey-results-${survey.id}`}>
          <View style={styles.stats}>
            {results.areas.map((a) => (
              <HrStat key={a.area} colors={colors} label={a.area} value={`${a.score}`} hint="av 100" />
            ))}
          </View>
          {results.questions.map((q) => (
            <View key={q.id} style={[styles.qRow, { borderColor: colors.line }]}>
              <Text style={[styles.qText, { color: colors.ink }]}>{q.text}</Text>
              <Text style={[styles.qScore, { color: toneColor(scoreTone(q.score), colors) }]}>
                {q.avg == null ? `For få svar (${q.n})` : `${String(q.avg).replace('.', ',')} av 5${q.reverse ? ' (lavt er bra)' : ''}`}
              </Text>
            </View>
          ))}
          {results.comments.length ? (
            <View style={styles.stack}>
              <Text style={[styles.itemTitle, { color: colors.ink }]}>Kommentarer</Text>
              {results.comments.map((c, i) => (
                <Text key={`${i}-${c.slice(0, 12)}`} style={[styles.comment, { color: colors.ink, borderColor: colors.line }]}>{c}</Text>
              ))}
            </View>
          ) : null}
          <Text style={[styles.meta, { color: colors.muted }]}>
            Lav score på et område er en fare i arbeidsmiljøet som skal vurderes og følges opp med tiltak (internkontrollforskriften § 5). Gå gjennom resultatene med verneombudet og de ansatte.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * HR → Oppfølging → Medarbeiderundersøkelse. invited: egne ansatte med brukerkonto.
 */
export default function HrSurvey({ colors, familyId, canWrite, invited, uid }) {
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
        {(surveys || []).map((s) => (
          <SurveyItem key={s.id} colors={colors} survey={s} familyId={familyId} invited={invited} canWrite={canWrite} onChanged={reload} />
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
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: space.xs },
  itemHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  itemTitle: { ...type.bodyStrong },
  meta: { ...type.label, fontWeight: '400' },
  qRow: { borderTopWidth: 1, paddingTop: 6, gap: 2 },
  qText: { ...type.body },
  qScore: { ...type.label, fontWeight: '600' },
  comment: { ...type.label, fontWeight: '400', borderLeftWidth: 3, paddingLeft: space.xs },
});
