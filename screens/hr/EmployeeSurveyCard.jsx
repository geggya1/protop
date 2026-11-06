import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { SURVEY_COMMENT_MAX, SURVEY_SCALE, SURVEY_SCALE_LABELS, surveyDeadline } from '../../src/hr/survey';
import { formatNbDate } from '../../src/hr/model';
import { hasAnswered, loadOpenSurveys, submitSurveyAnswer } from '../../src/hr/surveyStore';
import { toneColor } from '../../src/hr/uiHelpers';
import { chartColorsFor } from '../../src/ui/chartColors';
import { radius, space, type } from '../../src/ui/tokens';
import { lazyScreen } from '../../src/ui/lazyScreen';
const HrButton = lazyScreen(() => import('./HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrCard = lazyScreen(() => import('./HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrChip = lazyScreen(() => import('./HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const HrSectionTitle = lazyScreen(() => import('./HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });

/**
 * Åpen medarbeiderundersøkelse på Min side. Svaret lagres uten navn og bruker-id.
 * Vises ikke når det ikke er noen åpen undersøkelse, eller personen allerede har svart.
 */
export default function EmployeeSurveyCard({ colors, companyId, uid }) {
  const [survey, setSurvey] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [values, setValues] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let live = true;
    setSurvey(null);
    setAnswered(false);
    if (!companyId || !uid) return undefined;
    (async () => {
      try {
        const open = await loadOpenSurveys(companyId);
        for (const s of open) {
          if (!(await hasAnswered(companyId, s.id, uid))) {
            if (live) setSurvey(s);
            return;
          }
        }
      } catch {
        // Ingen undersøkelse å vise.
      }
    })();
    return () => { live = false; };
  }, [companyId, uid]);

  if (!survey) return null;
  if (answered) {
    return (
      <HrCard colors={colors}>
        <Text style={{ color: colors.ink }} nativeID="employee-survey-thanks">Takk for svaret! Det er lagret anonymt.</Text>
      </HrCard>
    );
  }

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await submitSurveyAnswer(companyId, survey, uid, values, comment);
      setAnswered(true);
    } catch (err) {
      setMessage(err?.message && /minst ett/.test(err.message) ? err.message : 'Kunne ikke sende svaret. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  const answeredCount = Object.keys(values).length;
  const total = survey.questions.length;
  const chart = chartColorsFor(colors);
  // Spørsmålene gruppert på område, i rekkefølgen de står.
  const groups = [];
  survey.questions.forEach((q, idx) => {
    const area = q.area || 'Annet';
    const last = groups[groups.length - 1];
    if (last && last.area === area) last.items.push({ q, idx });
    else groups.push({ area, items: [{ q, idx }] });
  });
  return (
    <HrCard colors={colors}>
      <View nativeID="employee-survey" style={styles.stack}>
        <HrSectionTitle colors={colors} title={survey.title} subtitle={survey.intro} />
        {surveyDeadline(survey).date && !surveyDeadline(survey).passed ? (
          <Text style={[styles.scale, { color: colors.ink }]} nativeID="employee-survey-deadline">{`Svarfrist ${formatNbDate(surveyDeadline(survey).date)}.`}</Text>
        ) : null}
        <View style={styles.progress} nativeID="employee-survey-progress">
          <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
            <View style={[styles.meterFill, { width: `${Math.round((answeredCount / Math.max(1, total)) * 100)}%`, backgroundColor: chart.bar }]} />
          </View>
          <Text style={[styles.scale, { color: colors.muted }]}>{`${answeredCount} av ${total} besvart. Du kan hoppe over spørsmål.`}</Text>
        </View>
        {groups.map((g) => (
          <View key={`${g.area}-${g.items[0].idx}`} style={styles.group}>
            <Text style={[styles.area, { color: colors.ink }]}>{g.area}</Text>
            {g.items.map(({ q, idx }) => (
              <View key={q.id} style={[styles.question, { borderColor: colors.line }]}>
                <Text style={[styles.qText, { color: colors.ink }]}>{`${idx + 1}. ${q.text}`}</Text>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={q.text}>
                  {SURVEY_SCALE.map((v, i) => (
                    <HrChip
                      key={v}
                      colors={colors}
                      label={i === 0 || i === SURVEY_SCALE.length - 1 ? `${v} ${SURVEY_SCALE_LABELS[i].toLowerCase()}` : String(v)}
                      active={values[q.id] === v}
                      onPress={() => setValues((prev) => ({ ...prev, [q.id]: v }))}
                      nativeID={`employee-survey-${q.id}-${v}`}
                    />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ))}
        <Text style={[styles.qText, { color: colors.ink }]}>Kommentar (valgfritt). Ikke skriv noe som avslører hvem du er.</Text>
        <TextInput
          value={comment}
          onChangeText={(t) => setComment(t.slice(0, SURVEY_COMMENT_MAX))}
          multiline
          placeholder="Hva fungerer bra, og hva bør bli bedre?"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        {message ? <Text style={{ color: toneColor('bad', colors) }}>{message}</Text> : null}
        <HrButton
          colors={colors}
          primary
          icon="send"
          label={`Send anonymt (${answeredCount} av ${total} besvart)`}
          onPress={submit}
          disabled={busy || !answeredCount}
          nativeID="employee-survey-submit"
        />
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  scale: { ...type.caption },
  question: { borderTopWidth: 1, paddingTop: 8, gap: 6 },
  group: { gap: 6 },
  area: { ...type.bodyStrong, marginTop: space.xs },
  progress: { gap: 4 },
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill },
  qText: { ...type.body },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  input: { borderWidth: 1, borderRadius: radius.control, padding: space.xs, minHeight: 80, textAlignVertical: 'top', ...type.body },
});
