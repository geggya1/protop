/**
 * Svarsiden for kundeundersøkelsen: protop.no/svar/{lenke}. Kunden er ikke innlogget.
 * Lenken er personlig (én per mottaker), og serveren godtar ett svar per lenke.
 * Se src/surveys/customerService.js (handlingene open og submit).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { customerSurveyCall } from '../../src/surveys/customerClient';
import { cleanCustomerAnswer } from '../../src/surveys/customerSurvey';
import { formatNbDate } from '../../src/hr/model';
import { radius, space, type } from '../../src/ui/tokens';
import SurveyAnswerForm, { answeredCount } from '../../components/surveys/SurveyAnswerForm';
import { HrButton } from '../hr/HrShared';

/** Lenken fra adressen (/svar/abc) eller fra navigasjonen. */
export function tokenFromPath(path) {
  const m = String(path || '').match(/\/svar\/([A-Za-z0-9_-]{20,100})/);
  return m ? m[1] : '';
}

function currentToken(route) {
  const fromRoute = String(route?.params?.token || '');
  if (fromRoute) return fromRoute;
  if (Platform.OS === 'web' && typeof window !== 'undefined') return tokenFromPath(window.location.pathname);
  return '';
}

export default function SurveyAnswerScreen({ route }) {
  const colors = useColors();
  const token = useMemo(() => currentToken(route), [route]);
  const [state, setState] = useState({ phase: 'loading' });
  const [values, setValues] = useState({});
  const [texts, setTexts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    if (!token) {
      setState({ phase: 'invalid', message: 'Lenken er ikke gyldig. Bruk lenken i e-posten du fikk.' });
      return undefined;
    }
    customerSurveyCall('open', { token })
      .then((r) => {
        if (!live) return;
        const s = r.survey || {};
        if (r.answered) setState({ phase: 'answered', survey: s });
        else if (s.status === 'closed') setState({ phase: 'closed', survey: s });
        else setState({ phase: 'form', survey: s, name: r.recipientName || '' });
      })
      .catch((err) => { if (live) setState({ phase: 'invalid', message: err?.message || 'Lenken er ikke gyldig.' }); });
    return () => { live = false; };
  }, [token]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const s = state.survey;
    document.title = s ? `${s.title} – ${s.companyName}` : 'Kundeundersøkelse';
  }, [state.survey]);

  const survey = state.survey;
  const submit = async () => {
    if (busy || !survey) return;
    setError('');
    const clean = cleanCustomerAnswer(survey, values, texts);
    if (!clean) {
      const missing = survey.questions.find((q) => q.required && (q.type === 'text' ? !String(texts[q.id] || '').trim() : values[q.id] == null));
      setError(missing ? `Svar på spørsmål ${survey.questions.indexOf(missing) + 1} før du sender.` : 'Svar på minst ett spørsmål før du sender.');
      return;
    }
    setBusy(true);
    try {
      await customerSurveyCall('submit', { token, values, texts });
      setState({ phase: 'thanks', survey });
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.scrollTo?.(0, 0);
    } catch (err) {
      if (err?.code === 'already-exists') setState({ phase: 'answered', survey });
      else setError(err?.message || 'Kunne ikke sende svaret. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  const total = survey?.questions?.length || 0;
  const done = survey ? answeredCount(survey, values, texts) : 0;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="survey-answer">
        {survey?.companyName ? <Text style={[styles.company, { color: colors.muted }]}>{survey.companyName}</Text> : null}

        {state.phase === 'loading' ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
            <Text style={[styles.body, { color: colors.muted }]}>Henter undersøkelsen …</Text>
          </View>
        ) : null}

        {state.phase === 'invalid' ? (
          <View style={styles.center} nativeID="survey-answer-invalid">
            <Ionicons name="link-outline" size={32} color={colors.muted} />
            <Text style={[styles.h1, { color: colors.ink }]}>Lenken virker ikke</Text>
            <Text style={[styles.body, styles.centerText, { color: colors.ink }]}>{state.message}</Text>
          </View>
        ) : null}

        {['answered', 'thanks', 'closed'].includes(state.phase) ? (
          <View style={styles.center} nativeID={`survey-answer-${state.phase}`}>
            <Ionicons name={state.phase === 'closed' ? 'lock-closed-outline' : 'checkmark-circle'} size={40} color={state.phase === 'closed' ? colors.muted : colors.success} />
            <Text style={[styles.h1, { color: colors.ink }]}>
              {state.phase === 'thanks' ? 'Takk for svaret!' : state.phase === 'answered' ? 'Du har allerede svart' : 'Undersøkelsen er avsluttet'}
            </Text>
            <Text style={[styles.body, styles.centerText, { color: colors.ink }]}>
              {state.phase === 'closed'
                ? 'Det er ikke lenger mulig å svare. Takk for interessen!'
                : `Svaret ditt er sendt til ${survey?.companyName || 'bedriften'}. Det hjelper oss å bli bedre.`}
            </Text>
            {state.phase !== 'closed' && survey?.anonymous ? (
              <Text style={[styles.caption, styles.centerText, { color: colors.muted }]}>Svaret er lagret anonymt.</Text>
            ) : null}
          </View>
        ) : null}

        {state.phase === 'form' && survey ? (
          <View style={styles.stack}>
            <Text style={[styles.h1, { color: colors.ink }]}>{survey.title}</Text>
            {state.name ? <Text style={[styles.body, { color: colors.ink }]}>{`Hei ${state.name}!`}</Text> : null}
            {survey.intro ? <Text style={[styles.body, { color: colors.ink }]}>{survey.intro}</Text> : null}
            <Text style={[styles.caption, { color: colors.muted }]}>
              {[
                `${total} spørsmål`,
                survey.closesOn ? `svar innen ${formatNbDate(survey.closesOn)}` : '',
                survey.anonymous
                  ? `anonymt: ${survey.companyName} ser bare samlede resultater`
                  : `${survey.companyName} ser svaret ditt og kan ta kontakt`,
              ].filter(Boolean).join(' · ')}
            </Text>
            <SurveyAnswerForm
              colors={colors}
              survey={survey}
              values={values}
              texts={texts}
              onValue={(id, v) => setValues((p) => {
                const next = { ...p };
                if (v == null) delete next[id];
                else next[id] = v;
                return next;
              })}
              onText={(id, t) => setTexts((p) => ({ ...p, [id]: t }))}
              disabled={busy}
            />
            {error ? <Text style={[styles.body, { color: colors.dangerInk || colors.danger }]} nativeID="survey-answer-error">{error}</Text> : null}
            <View style={styles.footer}>
              <Text style={[styles.caption, { color: colors.muted }]}>{`${done} av ${total} besvart. Du kan hoppe over spørsmål.`}</Text>
              <HrButton colors={colors} primary icon="send" label={busy ? 'Sender …' : 'Send svar'} onPress={submit} disabled={busy || !done} nativeID="survey-answer-submit" />
            </View>
          </View>
        ) : null}
      </View>
      <Text style={[styles.caption, styles.centerText, { color: colors.muted }]}>Sendt med ProTop. Lenken er personlig.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.md, gap: space.sm, maxWidth: 720, width: '100%', alignSelf: 'center' },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: space.sm },
  company: { ...type.label },
  stack: { gap: space.sm },
  center: { alignItems: 'center', gap: space.xs, paddingVertical: space.lg },
  centerText: { textAlign: 'center' },
  h1: { ...type.h1 },
  body: { ...type.body },
  caption: { ...type.caption },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, borderTopWidth: 0, paddingTop: space.xs },
});
