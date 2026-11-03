/**
 * Maler for undersøkelser og evalueringer, definert på selskapsnivå (Kunder → Kundeundersøkelse →
 * Maler). De innebygde malene kan ikke endres, men kopieres til en egen mal. Evalueringer som er
 * laget fra en mal, har sin egen kopi av spørsmålene, så endringer i malen gjelder bare nye.
 * Lagres via callable customerSurvey (templates, saveTemplate, deleteTemplate).
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SURVEY_KINDS, kindLabel, normalizeSurveyTemplate } from '../../src/surveys/customerSurvey';
import { customerSurveyCall } from '../../src/surveys/customerClient';
import { showSaveToast } from '../../src/ui/saveToast';
import { useConfirm } from '../../src/ui/useConfirm';
import { radius, space, type } from '../../src/ui/tokens';
import { EmptyHint, HrButton, HrChip } from '../hr/HrShared';
import { SurveyEditor } from './CustomerSurveyDetail';

/** Malen som et utkast editoren forstår (navn → tittel). */
function asDraft(t) {
  return { id: t.id, kind: t.kind, title: t.name, intro: t.intro, anonymous: t.anonymous, questions: t.questions };
}

function TemplateEditor({
  colors, familyId, template, companyName, onDone,
}) {
  const [kind, setKind] = useState(template.kind);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const isNew = template.builtin || !template.id;
  const save = async (draft) => {
    setBusy(true);
    try {
      const next = normalizeSurveyTemplate({
        id: isNew ? '' : template.id, kind, name: draft.title, intro: draft.intro, anonymous: draft.anonymous, questions: draft.questions,
      });
      await customerSurveyCall('saveTemplate', { familyId, template: next });
      showSaveToast?.('Malen er lagret.');
      onDone?.(true);
      return true;
    } catch (err) {
      showSaveToast?.(err?.message || 'Kunne ikke lagre malen');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    const ok = await confirm({ title: 'Slette malen?', message: `«${template.name}» slettes. Evalueringer som er laget fra den, beholder spørsmålene sine.`, confirmText: 'Slett', tone: 'danger' });
    if (!ok) return;
    try {
      await customerSurveyCall('deleteTemplate', { familyId, templateId: template.id });
      showSaveToast?.('Malen er slettet.');
      onDone?.(true);
    } catch (err) {
      showSaveToast?.(err?.message || 'Kunne ikke slette malen');
    }
  };
  return (
    <View style={styles.stack} nativeID="survey-template-editor">
      <Pressable onPress={() => onDone?.(false)} accessibilityRole="link" style={styles.back}>
        <Ionicons name="chevron-back" size={16} color={colors.brandInk || colors.brand} />
        <Text style={[styles.body, { color: colors.brandInk || colors.brand }]}>Alle maler</Text>
      </Pressable>
      <Text style={[styles.title, { color: colors.ink }]}>{isNew ? 'Ny mal' : template.name}</Text>
      {template.builtin ? (
        <Text style={[styles.caption, { color: colors.muted }]}>{`Den innebygde malen «${template.name}» kan ikke endres. Lagre for å få en egen kopi du kan tilpasse.`}</Text>
      ) : null}
      <Text style={[styles.caption, { color: colors.muted }]}>Brukes til</Text>
      <View style={styles.chips}>
        {SURVEY_KINDS.map((k) => (
          <HrChip key={k.id} colors={colors} label={k.label} active={kind === k.id} onPress={() => setKind(k.id)} nativeID={`survey-template-kind-${k.id}`} />
        ))}
      </View>
      <SurveyEditor
        key={kind}
        colors={colors}
        survey={{ ...asDraft(template), kind }}
        companyName={companyName}
        busy={busy}
        template
        onSave={save}
        onDelete={isNew ? null : remove}
      />
    </View>
  );
}

export default function SurveyTemplatesPanel({
  colors, familyId, templates, companyName, canEdit, onChanged,
}) {
  const [open, setOpen] = useState(null);
  if (open) {
    return (
      <TemplateEditor
        colors={colors}
        familyId={familyId}
        template={open}
        companyName={companyName}
        onDone={(changed) => { setOpen(null); if (changed) onChanged?.(); }}
      />
    );
  }
  const list = templates || [];
  return (
    <View style={styles.stack} nativeID="survey-templates">
      <View style={styles.headRow}>
        <Text style={[styles.caption, { color: colors.muted, flex: 1, minWidth: 220 }]}>
          Malene gjelder for hele selskapet. Velg en mal når du lager en evaluering fra et prosjekt, et tilbud eller her.
        </Text>
        {canEdit ? (
          <HrButton
            colors={colors}
            primary
            icon="add"
            label="Ny mal"
            onPress={() => setOpen(normalizeSurveyTemplate({ ...(list.find((t) => t.id === 'std_prosjekt') || {}), id: '', builtin: false, name: 'Ny mal' }))}
            nativeID="survey-template-new"
          />
        ) : null}
      </View>
      {templates === null ? <EmptyHint colors={colors} text="Henter maler …" /> : null}
      {list.map((t) => (
        <Pressable
          key={t.id}
          onPress={canEdit ? () => setOpen(t) : undefined}
          disabled={!canEdit}
          accessibilityRole="button"
          style={[styles.row, { borderColor: colors.line }]}
          nativeID={`survey-template-${t.id}`}
        >
          <Ionicons name={t.builtin ? 'document-text-outline' : 'create-outline'} size={18} color={colors.muted} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>{t.name}</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {[kindLabel(t.kind), `${t.questions.length} spørsmål`, t.anonymous ? 'anonym' : '', t.builtin ? 'innebygd' : 'egen mal'].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {canEdit ? <Ionicons name="chevron-forward" size={18} color={colors.muted} /> : null}
        </Pressable>
      ))}
      {!canEdit ? (
        <Text style={[styles.caption, { color: colors.muted }]}>For å lage og endre maler trengs Begrenset redigering på Kunder.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { ...type.title },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingVertical: space.xs,
  },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
});
