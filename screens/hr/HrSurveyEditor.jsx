import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  DEFAULT_SURVEY_QUESTIONS, SURVEY_AREAS, SURVEY_MAX_QUESTIONS, addSurveyQuestion, availableBankQuestions,
  moveSurveyQuestion, normalizeSurvey, removeSurveyQuestion, updateSurveyQuestion,
} from '../../src/hr/survey';
import { EmptyHint, HrButton, HrChip, HrField } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';

function IconButton({ colors, icon, label, onPress, disabled, nativeID }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      nativeID={nativeID}
      style={[styles.iconBtn, { borderColor: colors.line, opacity: disabled ? 0.35 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={colors.ink} />
    </Pressable>
  );
}

/**
 * Redigering av et utkast til medarbeiderundersøkelse: tittel, innledning, svarfrist og spørsmål
 * (fra spørsmålsbanken eller egne). previous: forrige avsluttede undersøkelse, så HR ser hvilke
 * spørsmål som ikke kan sammenlignes med forrige gang.
 */
export default function HrSurveyEditor({
  colors, survey, previous, onSave, onDelete, busy,
}) {
  const [draft, setDraft] = useState(() => normalizeSurvey(survey));
  const [dirty, setDirty] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [newArea, setNewArea] = useState(SURVEY_AREAS[0]);
  const [newText, setNewText] = useState('');
  const change = (next) => {
    setDraft(normalizeSurvey(next));
    setDirty(true);
  };

  const prev = useMemo(() => new Map((previous?.questions || []).map((q) => [q.id, q.text])), [previous]);
  const notComparable = previous
    ? draft.questions.filter((q) => !prev.has(q.id) || prev.get(q.id) !== q.text).length
    : 0;
  const bank = availableBankQuestions(draft);
  const bankByArea = SURVEY_AREAS.map((area) => ({ area, items: bank.filter((q) => q.area === area) })).filter((g) => g.items.length);
  const full = draft.questions.length >= SURVEY_MAX_QUESTIONS;

  const addOwn = () => {
    const t = newText.trim();
    if (!t || full) return;
    change(addSurveyQuestion(draft, { area: newArea, text: t }));
    setNewText('');
  };

  return (
    <View style={styles.stack} nativeID="hr-survey-editor">
      <HrField colors={colors} label="Tittel" value={draft.title} onChangeText={(v) => change({ ...draft, title: v })} />
      <HrField colors={colors} label="Innledning (vises over spørsmålene)" value={draft.intro} multiline onChangeText={(v) => change({ ...draft, intro: v })} />
      <View style={styles.deadline}>
        <HrField colors={colors} label="Svarfrist" value={draft.closesOn} date="iso" clearable onChangeText={(v) => change({ ...draft, closesOn: v || '' })} />
        <Text style={[styles.caption, { color: colors.muted }]}>Vises for de ansatte og i varselet. Når fristen er ute, minner ProTop deg om å avslutte.</Text>
      </View>

      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.ink }]}>{`Spørsmål (${draft.questions.length})`}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Skala 1–5, fra helt uenig til helt enig</Text>
      </View>
      {previous && notComparable ? (
        <View style={[styles.note, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
          <Ionicons name="information-circle" size={16} color={colors.muted} />
          <Text style={[styles.caption, { color: colors.ink, flex: 1 }]}>
            {`${notComparable} spørsmål er nye eller endret siden «${previous.title}», og kan ikke sammenlignes med forrige gang. Områdene sammenlignes fortsatt.`}
          </Text>
        </View>
      ) : null}
      {!draft.questions.length ? <EmptyHint colors={colors} text="Ingen spørsmål. Legg til fra spørsmålsbanken eller skriv egne." /> : null}
      {draft.questions.map((q, i) => (
        <View key={q.id} style={[styles.qRow, { borderColor: colors.line }]} nativeID={`hr-survey-q-${q.id}`}>
          <Text style={[styles.num, { color: colors.muted }]}>{`${i + 1}.`}</Text>
          <View style={styles.qBody}>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {[q.area, q.reverse ? 'snudd: høy verdi er dårlig' : '', previous && !prev.has(q.id) ? 'nytt' : ''].filter(Boolean).join(' · ')}
            </Text>
            <TextInput
              value={q.text}
              onChangeText={(v) => change(updateSurveyQuestion(draft, q.id, { text: v }))}
              multiline
              accessibilityLabel={`Spørsmål ${i + 1}`}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
          </View>
          <View style={styles.qTools}>
            <IconButton colors={colors} icon="arrow-up" label="Flytt opp" disabled={i === 0} onPress={() => change(moveSurveyQuestion(draft, q.id, -1))} />
            <IconButton colors={colors} icon="arrow-down" label="Flytt ned" disabled={i === draft.questions.length - 1} onPress={() => change(moveSurveyQuestion(draft, q.id, 1))} />
            <IconButton colors={colors} icon="trash-outline" label="Fjern spørsmålet" onPress={() => change(removeSurveyQuestion(draft, q.id))} nativeID={`hr-survey-remove-${q.id}`} />
          </View>
        </View>
      ))}

      <View style={[styles.box, { borderColor: colors.line }]}>
        <Text style={[styles.bodyStrong, { color: colors.ink }]}>Eget spørsmål</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Skriv et utsagn de ansatte kan si seg enig eller uenig i, for eksempel «Jeg får hjelp når jeg står fast».</Text>
        <View style={styles.chips}>
          {SURVEY_AREAS.map((a) => (
            <HrChip key={a} colors={colors} label={a} active={newArea === a} onPress={() => setNewArea(a)} />
          ))}
        </View>
        <TextInput
          value={newText}
          onChangeText={setNewText}
          placeholder="Utsagn"
          placeholderTextColor={colors.muted}
          onSubmitEditing={addOwn}
          nativeID="hr-survey-new-text"
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        <View style={styles.actions}>
          <HrButton colors={colors} icon="add" label="Legg til" onPress={addOwn} disabled={!newText.trim() || full} nativeID="hr-survey-add-own" />
        </View>
      </View>

      <View style={[styles.box, { borderColor: colors.line }]}>
        <Pressable onPress={() => setBankOpen((v) => !v)} accessibilityRole="button" style={styles.bankHead} nativeID="hr-survey-bank-toggle">
          <Text style={[styles.bodyStrong, { color: colors.ink, flex: 1 }]}>{`Spørsmålsbank (${bank.length})`}</Text>
          <Ionicons name={bankOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
        </Pressable>
        {bankOpen ? bankByArea.map((g) => (
          <View key={g.area} style={styles.bankGroup}>
            <Text style={[styles.caption, { color: colors.muted }]}>{g.area}</Text>
            {g.items.map((q) => (
              <Pressable
                key={q.id}
                onPress={() => !full && change(addSurveyQuestion(draft, q))}
                accessibilityRole="button"
                accessibilityLabel={`Legg til: ${q.text}`}
                nativeID={`hr-survey-bank-${q.id}`}
                style={[styles.bankRow, { borderColor: colors.line }]}
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.brand} />
                <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{q.text}</Text>
              </Pressable>
            ))}
          </View>
        )) : null}
        {full ? <Text style={[styles.caption, { color: colors.muted }]}>{`Høyst ${SURVEY_MAX_QUESTIONS} spørsmål.`}</Text> : null}
      </View>

      <View style={styles.actions}>
        <HrButton colors={colors} primary icon="save" label={dirty ? 'Lagre utkast' : 'Lagret'} disabled={!dirty || busy || !draft.questions.length} onPress={async () => { if (await onSave(draft)) setDirty(false); }} nativeID="hr-survey-save" />
        <HrButton colors={colors} icon="refresh" label="Standardspørsmål" disabled={busy} onPress={() => change({ ...draft, questions: DEFAULT_SURVEY_QUESTIONS })} />
        {onDelete ? <HrButton colors={colors} icon="trash-outline" label="Slett utkast" disabled={busy} onPress={onDelete} nativeID="hr-survey-delete" /> : null}
      </View>
      {dirty ? <Text style={[styles.caption, { color: colors.muted }]}>Endringene er ikke lagret. Lagre før du åpner undersøkelsen.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: space.xs },
  deadline: { gap: 2, maxWidth: 420 },
  title: { ...type.bodyStrong },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  note: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.control, padding: space.xs },
  qRow: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start', borderTopWidth: 1, paddingTop: space.xs },
  num: { ...type.body, width: 24, paddingTop: 18 },
  qBody: { flex: 1, minWidth: 0, gap: 2 },
  qTools: { flexDirection: 'row', gap: 4, paddingTop: 16 },
  iconBtn: { width: 32, height: 32, borderWidth: 1, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 6, ...type.body },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bankHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bankGroup: { gap: 4 },
  bankRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, paddingVertical: 6 },
});
