/**
 * Svarskjema for kundeundersøkelsen. Brukes på svarsiden (/svar/…, uten innlogging) og som
 * forhåndsvisning i Kunder → Kundeundersøkelse.
 *
 * survey: { questions: [{ id, type: 'nps' | 'scale' | 'text', text, area, required }] } med
 * teksten ferdig utfylt (bedriftens navn). values/texts styres utenfra.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CUSTOMER_SCALE, CUSTOMER_SCALE_LABELS, CUSTOMER_TEXT_MAX, NPS_SCALE,
} from '../../src/surveys/customerSurvey';
import { radius, space, type } from '../../src/ui/tokens';

function ScaleButton({ colors, label, active, onPress, nativeID, wide }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!active }}
      accessibilityLabel={label}
      nativeID={nativeID}
      style={[
        styles.scaleBtn,
        wide ? styles.scaleWide : styles.scaleNarrow,
        { borderColor: active ? (colors.brandInk || colors.brand) : colors.line, backgroundColor: active ? (colors.brandInk || colors.brand) : colors.bg },
      ]}
    >
      <Text style={[styles.scaleText, { color: active ? (colors.onBrand || colors.card) : colors.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function answeredCount(survey, values = {}, texts = {}) {
  return (survey?.questions || []).filter((q) => (q.type === 'text'
    ? String(texts[q.id] || '').trim()
    : values[q.id] != null && values[q.id] !== '')).length;
}

export default function SurveyAnswerForm({
  colors, survey, values = {}, texts = {}, onValue, onText, disabled, missing = '',
}) {
  const questions = survey?.questions || [];
  return (
    <View style={styles.stack}>
      {questions.map((q, i) => (
        <View
          key={q.id}
          style={[styles.question, { borderColor: colors.line }, missing === q.id && { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}
          nativeID={`survey-q-${q.id}`}
        >
          <View style={styles.qHead}>
            {(q.type === 'text' ? String(texts[q.id] || '').trim() : values[q.id] != null) ? (
              <Ionicons name="checkmark-circle" size={18} color={colors.success} accessibilityLabel="Besvart" />
            ) : (
              <View style={[styles.qNum, { borderColor: colors.line }]}><Text style={[styles.qNumText, { color: colors.muted }]}>{String(i + 1)}</Text></View>
            )}
            <Text style={[styles.qText, { color: colors.ink, flex: 1 }]}>
              {q.text}
              {q.required ? <Text style={{ color: colors.muted }}> (må besvares)</Text> : null}
            </Text>
          </View>
          {q.type === 'text' ? (
            <TextInput
              value={texts[q.id] || ''}
              editable={!disabled}
              onChangeText={(t) => onText?.(q.id, t.slice(0, CUSTOMER_TEXT_MAX))}
              multiline
              placeholder="Skriv her (valgfritt)"
              placeholderTextColor={colors.muted}
              accessibilityLabel={q.text}
              nativeID={`survey-text-${q.id}`}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
          ) : (
            <View>
              <View style={styles.scaleRow} accessibilityRole="radiogroup" accessibilityLabel={q.text}>
                {(q.type === 'nps' ? NPS_SCALE : CUSTOMER_SCALE).map((v) => (
                  <ScaleButton
                    key={v}
                    colors={colors}
                    label={String(v)}
                    wide={q.type !== 'nps'}
                    active={values[q.id] === v}
                    onPress={disabled ? undefined : () => onValue?.(q.id, values[q.id] === v ? null : v)}
                    nativeID={`survey-${q.id}-${v}`}
                  />
                ))}
              </View>
              <View style={styles.ends}>
                <Text style={[styles.caption, { color: colors.muted }]}>
                  {q.type === 'nps' ? '0 = svært lite sannsynlig' : `1 = ${CUSTOMER_SCALE_LABELS[0].toLowerCase()}`}
                </Text>
                <Text style={[styles.caption, styles.right, { color: colors.muted }]}>
                  {q.type === 'nps' ? '10 = svært sannsynlig' : `5 = ${CUSTOMER_SCALE_LABELS[4].toLowerCase()}`}
                </Text>
              </View>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  question: { borderTopWidth: 1, paddingTop: space.sm, paddingBottom: 2, gap: space.xs, borderRadius: radius.control },
  qText: { ...type.body },
  qHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  qNum: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  qNumText: { ...type.caption },
  caption: { ...type.caption },
  right: { textAlign: 'right' },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  scaleBtn: { minHeight: 44, borderWidth: 1, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  scaleNarrow: { minWidth: 40, flexGrow: 1, flexBasis: 40 },
  scaleWide: { minWidth: 52, flexGrow: 1, flexBasis: 52 },
  scaleText: { ...type.bodyStrong },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs, marginTop: 4 },
  input: { borderWidth: 1, borderRadius: radius.control, padding: space.xs, minHeight: 90, textAlignVertical: 'top', ...type.body },
});
