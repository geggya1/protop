import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ACTION_STATUSES, addAction, planProgress, removeAction, suggestedActions, toggleStep, updateAction,
} from '../../src/hr/surveyPlan';
import { formatNbDate } from '../../src/hr/model';
import { useBreakpoints } from '../../src/theme';
import { radius, space, type } from '../../src/ui/tokens';
import { lazyScreen } from '../../src/ui/lazyScreen';
const HrButton = lazyScreen(() => import('./HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrChip = lazyScreen(() => import('./HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const HrField = lazyScreen(() => import('./HrShared'), { name: 'HrField', pick: 'HrField', silent: true });

/**
 * Trinnviser for de fem trinnene. Et gjort trinn har hake og dato, trinnet du står på er markert,
 * og linjen mellom trinnene fylles etter hvert. På telefon står trinnene under hverandre.
 */
function Stepper({ colors, progress, canWrite, onToggle }) {
  const { isPhone } = useBreakpoints();
  return (
    <View style={[styles.stepper, isPhone && styles.stepperPhone]} nativeID="hr-survey-plan-steps" accessibilityRole="list">
      {progress.steps.map((s, i) => {
        const current = s.id === progress.current;
        const fill = s.done ? (colors.brandInk || colors.brand) : current ? colors.card : colors.bg;
        const ring = s.done ? (colors.brandInk || colors.brand) : current ? (colors.brandInk || colors.brand) : colors.line;
        return (
          // Tidligere trinn ligger over streken fra neste trinn, så prikken kan alltid trykkes.
          <View key={s.id} style={[styles.step, isPhone && styles.stepPhone, { zIndex: progress.steps.length - i }]}>
            {!isPhone && i > 0 ? (
              <View pointerEvents="none" style={[styles.connector, { backgroundColor: progress.steps[i - 1].done ? (colors.brandInk || colors.brand) : colors.line }]} />
            ) : null}
            <Pressable
              onPress={canWrite && !s.auto ? () => onToggle(s.id) : undefined}
              disabled={!canWrite || s.auto}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: s.done }}
              accessibilityLabel={`Trinn ${i + 1}: ${s.label}${s.done ? ', gjort' : ''}`}
              nativeID={`hr-survey-plan-step-${s.id}`}
              style={[styles.dot, { backgroundColor: fill, borderColor: ring }]}
            >
              {s.done
                ? <Ionicons name="checkmark" size={16} color={colors.onBrand || colors.card} />
                : <Text style={[styles.dotNum, { color: current ? (colors.brandInk || colors.brand) : colors.muted }]}>{String(i + 1)}</Text>}
            </Pressable>
            <View style={[styles.stepText, isPhone && styles.stepTextPhone]}>
              <Text style={[styles.stepLabel, { color: colors.ink }]}>{isPhone ? s.label : s.short}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {s.date ? formatNbDate(s.date) : s.auto ? 'Gjort ut fra tiltakene' : current ? 'Neste' : ''}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function ActionCard({
  colors, action, canWrite, onChange, onRemove, onTask, overdue,
}) {
  const [busy, setBusy] = useState(false);
  // Fritekst lagres etter en kort pause, ikke ved hvert tastetrykk (HR lagres som ett dokument).
  const [local, setLocal] = useState({ text: action.text, owner: action.owner, result: action.result });
  const timer = useRef(null);
  const pending = useRef(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) onChange(pending.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const typed = (key, value) => {
    setLocal((l) => ({ ...l, [key]: value }));
    pending.current = { ...(pending.current || {}), [key]: value };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const patch = pending.current;
      pending.current = null;
      if (patch) onChange(patch);
    }, 700);
  };
  const makeTask = async () => {
    setBusy(true);
    try {
      await onTask(action);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[styles.card, { borderColor: overdue ? colors.warn : colors.line }]} nativeID={`hr-survey-plan-action-${action.id}`}>
      <View style={styles.cardHead}>
        {action.area ? (
          <View style={[styles.areaTag, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
            <Text style={[styles.caption, { color: colors.ink }]}>{action.area}</Text>
          </View>
        ) : null}
        {overdue ? (
          <View style={styles.badge}>
            <Ionicons name="time-outline" size={13} color={colors.warnInk || colors.ink} />
            <Text style={[styles.caption, { color: colors.warnInk || colors.ink }]}>Fristen er passert</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {canWrite ? (
          <Pressable onPress={onRemove} accessibilityRole="button" accessibilityLabel="Fjern tiltaket" style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={16} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {canWrite ? (
        <TextInput
          value={local.text}
          onChangeText={(v) => typed('text', v)}
          multiline
          placeholder="Hva skal gjøres?"
          placeholderTextColor={colors.muted}
          accessibilityLabel="Tiltak"
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
      ) : <Text style={[styles.body, { color: colors.ink }]}>{action.text}</Text>}
      <View style={styles.row}>
        <View style={styles.field}>
          {canWrite
            ? <HrField colors={colors} label="Ansvarlig" value={local.owner} onChangeText={(v) => typed('owner', v)} />
            : <Text style={[styles.caption, { color: colors.muted }]}>{`Ansvarlig: ${action.owner || '–'}`}</Text>}
        </View>
        <View style={styles.field}>
          {canWrite
            ? <HrField colors={colors} label="Frist" value={action.due} date="iso" clearable onChangeText={(v) => onChange({ due: v || '' })} />
            : <Text style={[styles.caption, { color: colors.muted }]}>{`Frist: ${action.due ? formatNbDate(action.due) : '–'}`}</Text>}
        </View>
      </View>
      <View style={styles.chips}>
        {ACTION_STATUSES.map((st) => (
          <HrChip
            key={st.id}
            colors={colors}
            label={st.label}
            active={action.status === st.id}
            onPress={canWrite ? () => onChange({ status: st.id }) : undefined}
          />
        ))}
        {canWrite && onTask ? (
          action.taskId
            ? <Text style={[styles.caption, { color: colors.muted }]}>Oppgave laget</Text>
            : <HrButton colors={colors} icon="add" label="Lag oppgave" disabled={busy || !action.text} onPress={makeTask} />
        ) : null}
      </View>
      {action.status === 'done' ? (
        canWrite ? (
          <HrField colors={colors} label="Resultat: virket det?" value={local.result} multiline onChangeText={(v) => typed('result', v)} />
        ) : (action.result ? <Text style={[styles.caption, { color: colors.ink }]}>{`Resultat: ${action.result}`}</Text> : null)
      ) : null}
    </View>
  );
}

/**
 * Tiltaksplan for én avsluttet undersøkelse. plan fra surveyPlan.js (hr.surveyPlans), analysis fra
 * surveyAnalysis(). onUpdate(fn) lagrer i HR: fn får den siste lagrede planen og gir den nye, så
 * endringer som kommer tett ikke overskriver hverandre. onCreateTask(draft) lager en oppgave og gir id-en.
 */
export default function HrSurveyPlan({
  colors, survey, plan, analysis, canWrite, onUpdate, onCreateTask,
}) {
  const progress = planProgress(plan);
  const suggestions = suggestedActions(analysis, plan);
  const today = new Date().toISOString().slice(0, 10);
  const update = (fn) => onUpdate?.(fn);
  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <View style={styles.stack} nativeID={`hr-survey-plan-${survey.id}`}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.ink }]}>Tiltaksplan</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {`${progress.done} av ${progress.total} trinn${progress.actions ? ` · ${progress.finished} av ${progress.actions} tiltak gjennomført` : ''}${progress.overdue ? ` · ${progress.overdue} forsinket` : ''}`}
        </Text>
      </View>
      <Text style={[styles.caption, { color: colors.muted }]}>
        Undersøkelsen har verdi først når den følges opp. Gå gjennom trinnene, og velg få tiltak som betyr mest.
      </Text>
      <Stepper colors={colors} progress={progress} canWrite={canWrite} onToggle={(id) => update((p) => toggleStep(p, id))} />
      <View style={[styles.track, { backgroundColor: colors.line }]} accessibilityLabel={`${pct} prosent av trinnene er gjort`}>
        <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: colors.brandInk || colors.brand }]} />
      </View>
      {progress.current ? (
        <Text style={[styles.caption, { color: colors.ink }]}>
          {`Neste: ${progress.steps.find((s) => s.id === progress.current).hint}`}
        </Text>
      ) : (
        <Text style={[styles.caption, { color: colors.ink }]}>Alle trinnene er gjort. Neste undersøkelse viser om tiltakene virket.</Text>
      )}

      {plan.actions.map((a) => (
        <ActionCard
          key={a.id}
          colors={colors}
          action={a}
          canWrite={canWrite}
          overdue={a.status !== 'done' && !!a.due && a.due < today}
          onChange={(patch) => update((p) => updateAction(p, a.id, patch))}
          onRemove={() => update((p) => removeAction(p, a.id))}
          onTask={onCreateTask ? async (action) => {
            const id = await onCreateTask({
              title: `Tiltak: ${action.text.split('\n')[0].slice(0, 80)}`,
              description: [`Fra tiltaksplanen etter ${survey.title}.`, action.area ? `Område: ${action.area}.` : '', action.text].filter(Boolean).join('\n'),
              deadline: action.due || '',
              source: 'hr-survey',
            });
            if (id) update((p) => updateAction(p, a.id, { taskId: String(id) }));
          } : null}
        />
      ))}

      {canWrite ? (
        <View style={styles.stack}>
          {suggestions.length ? (
            <>
              <Text style={[styles.caption, { color: colors.muted }]}>Forslag fra resultatet (trykk for å legge til):</Text>
              <View style={styles.chips}>
                {suggestions.map((sg) => (
                  <Pressable
                    key={sg.area}
                    onPress={() => update((p) => addAction(p, { area: sg.area, text: sg.text }))}
                    accessibilityRole="button"
                    accessibilityLabel={`Legg til tiltak for ${sg.area}`}
                    nativeID={`hr-survey-plan-suggest-${sg.area}`}
                    style={[styles.suggest, { borderColor: colors.line, backgroundColor: colors.bg }]}
                  >
                    <Ionicons name="add" size={14} color={colors.brandInk || colors.brand} />
                    <Text style={[styles.caption, { color: colors.ink }]}>{`${sg.area} (${sg.score})`}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
          <View style={styles.actions}>
            <HrButton colors={colors} icon="add" label="Nytt tiltak" onPress={() => update((p) => addAction(p, { text: 'Nytt tiltak' }))} nativeID="hr-survey-plan-add" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** «Virket tiltakene?»: områdets score før og nå for hvert tiltak fra forrige undersøkelse. */
export function ActionEffects({ colors, effects, previousTitle }) {
  if (!effects?.length) return null;
  const icon = { bedre: 'trending-up', verre: 'trending-down', uendret: 'remove', ukjent: 'help' };
  const word = { bedre: 'Bedre', verre: 'Verre', uendret: 'Omtrent likt', ukjent: 'Ikke målt' };
  return (
    <View style={[styles.box, { borderColor: colors.line }]} nativeID="hr-survey-effects">
      <Text style={[styles.title, { color: colors.ink }]}>Virket tiltakene?</Text>
      <Text style={[styles.caption, { color: colors.muted }]}>{`Tiltakene fra ${previousTitle}, og hvordan området har endret seg siden.`}</Text>
      {effects.map((e) => (
        <View key={e.id} style={[styles.effectRow, { borderColor: colors.line }]}>
          <Ionicons name={icon[e.verdict]} size={18} color={e.verdict === 'bedre' ? colors.success : e.verdict === 'verre' ? colors.danger : colors.muted} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.body, { color: colors.ink }]} numberOfLines={2}>{e.text}</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {[e.area, ACTION_STATUSES.find((s) => s.id === e.status)?.label].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={styles.effectNums}>
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>{e.before == null || e.after == null ? '–' : `${e.before} → ${e.after}`}</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>{word[e.verdict]}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const DOT = 32;

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: space.xs },
  title: { ...type.title },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  stepper: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.xs },
  stepperPhone: { flexDirection: 'column', gap: space.xs },
  step: { flex: 1, alignItems: 'center', position: 'relative', minWidth: 0 },
  stepPhone: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  connector: { position: 'absolute', top: DOT / 2 - 1, right: '50%', left: '-50%', height: 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  dotNum: { ...type.bodyStrong },
  stepText: { alignItems: 'center', marginTop: 6, paddingHorizontal: 4 },
  stepTextPhone: { alignItems: 'flex-start', marginTop: 0, flex: 1 },
  stepLabel: { ...type.label, textAlign: 'center' },
  track: { height: 4, borderRadius: radius.pill, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: radius.pill },
  card: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  areaTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  iconBtn: { padding: 4 },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 6, ...type.body },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  field: { flexGrow: 1, flexBasis: 200 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  effectRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingTop: 6 },
  effectNums: { alignItems: 'flex-end', minWidth: 80 },
});
