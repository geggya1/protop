import { lazyScreen } from '../../src/ui/lazyScreen';
/**
 * Evalueringer av prosjekter og tilbud (Kunder → Kundeundersøkelse → Evalueringer, og prosjektets
 * Evaluering-fane). En evaluering lages fra en mal, knyttes til et prosjekt, et tilbud eller
 * selskapet og gjerne en avdeling (nivå), og sendes på e-post til kunden eller en annen person.
 * Mottakeren svarer uten innlogging og får en kopi av svaret. Resultatet kan brukes som
 * referanse i tilbud (evaluationReferenceText).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  LINK_TYPES, evaluationAverage, evaluationReferenceText, evaluationsFor, kindLabel, linkLabel, newEvaluation,
} from '../../src/surveys/customerSurvey';
import { customerSurveyCall } from '../../src/surveys/customerClient';
import { normalizeSubUnits } from '../../src/project/companyUnits';
import { loadProjectState } from '../../src/project/storage';
import { loadAnbudState } from '../../src/anbud/storage';
import { surveyDeadline } from '../../src/hr/survey';
import { formatNbDate } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { chartColorsFor } from '../../src/ui/chartColors';
import { radius, space, type } from '../../src/ui/tokens';
import { STATUS_LABEL, defaultDeadline } from './CustomerSurveyDetail';
import { recipientFromCustomer } from './CustomerSurveyRecipients';
const EmptyHint = lazyScreen(() => import('../hr/HrShared'), { name: 'EmptyHint', pick: 'EmptyHint', silent: true });
const HrButton = lazyScreen(() => import('../hr/HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrChip = lazyScreen(() => import('../hr/HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Avdelinger og underenheter fra bedriftsprofilen (family.company.subUnits). */
export function unitOptions(subUnits) {
  return normalizeSubUnits(subUnits).map((u) => ({ id: u.id, name: u.name }));
}

/**
 * Lager evalueringen som utkast. Er den knyttet til et prosjekt med kunde som har e-post,
 * legges kunden til som mottaker med en gang. Gir den lagrede evalueringen.
 */
export async function createEvaluation({
  familyId, uid, template, link, unit, customer = null,
}) {
  const draft = { ...newEvaluation({ template, link, unit, uid }), closesOn: defaultDeadline() };
  const { survey } = await customerSurveyCall('save', { familyId, survey: draft });
  const r = customer ? recipientFromCustomer(customer) : null;
  if (survey?.id && r && EMAIL.test(r.email)) {
    await customerSurveyCall('addRecipients', {
      familyId,
      surveyId: survey.id,
      recipients: [{ ...r, projectName: link?.name || '' }],
    }).catch(() => {});
  }
  return survey;
}

function Picker({
  colors, items, value, onPick, placeholder, nativeID,
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const hits = items.filter((it) => !q || it.label.toLowerCase().includes(q)).slice(0, 8);
  const chosen = items.find((it) => it.id === value);
  if (chosen) {
    return (
      <View style={[styles.chosen, { borderColor: colors.line }]} nativeID={nativeID}>
        <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{chosen.label}</Text>
        <HrChip colors={colors} label="Bytt" onPress={() => onPick('')} />
      </View>
    );
  }
  return (
    <View style={styles.stack} nativeID={nativeID}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      {hits.map((it) => (
        <Pressable
          key={it.id}
          onPress={() => onPick(it.id)}
          accessibilityRole="button"
          style={[styles.pickRow, { borderColor: colors.line }]}
          nativeID={`${nativeID}-${it.id}`}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.brandInk || colors.brand} />
          <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{it.label}</Text>
        </Pressable>
      ))}
      {!hits.length ? <Text style={[styles.caption, { color: colors.muted }]}>Ingen treff.</Text> : null}
    </View>
  );
}

/**
 * Ny evaluering: mal, hva den gjelder (prosjekt, tilbud eller selskapet) og avdeling.
 * fixedLink: låst kobling (fra prosjektets fane).
 */
export function NewEvaluationForm({
  colors, familyId, uid, templates, units = [], customers = [], fixedLink = null, fixedCustomerId = '', onCreated, onCancel,
}) {
  const choices = useMemo(() => {
    const own = (templates || []).filter((t) => !t.builtin);
    const builtin = (templates || []).filter((t) => t.builtin && t.kind !== 'customer');
    return [...own, ...builtin];
  }, [templates]);
  const [templateId, setTemplateId] = useState('');
  const [linkType, setLinkType] = useState(fixedLink?.type || 'project');
  const [linkId, setLinkId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [projects, setProjects] = useState(null);
  const [bids, setBids] = useState(null);
  const [busy, setBusy] = useState(false);

  // Malen som passer koblingen, til brukeren velger selv.
  const template = choices.find((t) => t.id === templateId)
    || choices.find((t) => t.kind === (linkType === 'bid' ? 'bid' : 'project'))
    || choices[0];

  useEffect(() => {
    if (fixedLink || linkType !== 'project' || projects) return;
    loadProjectState(familyId).then((s) => setProjects(s?.projects || [])).catch(() => setProjects([]));
  }, [familyId, fixedLink, linkType, projects]);
  useEffect(() => {
    if (fixedLink || linkType !== 'bid' || bids) return;
    loadAnbudState(familyId).then((s) => setBids(s?.bids || [])).catch(() => setBids([]));
  }, [familyId, fixedLink, linkType, bids]);

  const projectItems = (projects || [])
    .filter((p) => p && p.id && !p.deletedAt)
    .map((p) => ({ id: p.id, label: [p.number, p.name].filter(Boolean).join(' ') || 'Prosjekt', raw: p }));
  const bidItems = (bids || [])
    .filter((b) => b && b.id)
    .map((b) => ({ id: b.id, label: [b.title, b.buyer].filter(Boolean).join(' · ') || 'Tilbud', raw: b }));

  const link = (() => {
    if (fixedLink) return fixedLink;
    if (linkType === 'company') return { type: 'company' };
    if (linkType === 'project') {
      const p = projectItems.find((x) => x.id === linkId)?.raw;
      return p ? { type: 'project', id: p.id, name: p.name || '', number: p.number || '' } : null;
    }
    const b = bidItems.find((x) => x.id === linkId)?.raw;
    return b ? { type: 'bid', id: b.id, name: b.title || '' } : null;
  })();
  const customerId = fixedCustomerId
    || (linkType === 'project' ? projectItems.find((x) => x.id === linkId)?.raw?.customerId || '' : '');
  const customer = (customers || []).find((c) => c.id === customerId) || null;
  const unit = units.find((u) => u.id === unitId) || null;

  const create = async () => {
    if (!link || !template || busy) return;
    setBusy(true);
    try {
      const survey = await createEvaluation({
        familyId, uid, template, link, unit, customer,
      });
      showSaveToast?.(customer && EMAIL.test(recipientFromCustomer(customer).email)
        ? `Evalueringen er laget, og ${recipientFromCustomer(customer).name || customer.name} er lagt til som mottaker.`
        : 'Evalueringen er laget. Legg til mottaker og send.');
      onCreated?.(survey);
    } catch (err) {
      showSaveToast?.(err?.message || 'Kunne ikke lage evalueringen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.box, { borderColor: colors.line }]} nativeID="evaluation-new">
      <Text style={[styles.bodyStrong, { color: colors.ink }]}>Ny evaluering</Text>
      <Text style={[styles.caption, { color: colors.muted }]}>Mal</Text>
      <View style={styles.chips}>
        {choices.map((t) => (
          <HrChip key={t.id} colors={colors} label={t.name} active={template?.id === t.id} onPress={() => setTemplateId(t.id)} nativeID={`evaluation-template-${t.id}`} />
        ))}
      </View>
      {template ? <Text style={[styles.caption, { color: colors.muted }]}>{`${template.questions.length} spørsmål. Malene lages under Maler.`}</Text> : null}

      {fixedLink ? null : (
        <>
          <Text style={[styles.caption, { color: colors.muted }]}>Gjelder</Text>
          <View style={styles.chips}>
            {LINK_TYPES.map((t) => (
              <HrChip key={t.id} colors={colors} label={t.label} active={linkType === t.id} onPress={() => { setLinkType(t.id); setLinkId(''); }} nativeID={`evaluation-link-${t.id}`} />
            ))}
          </View>
          {linkType === 'project' ? (
            projects === null ? <EmptyHint colors={colors} text="Henter prosjekter …" /> : (
              <Picker colors={colors} items={projectItems} value={linkId} onPick={setLinkId} placeholder="Søk etter prosjektnummer eller navn" nativeID="evaluation-project" />
            )
          ) : null}
          {linkType === 'bid' ? (
            bids === null ? <EmptyHint colors={colors} text="Henter tilbud …" /> : (
              <Picker colors={colors} items={bidItems} value={linkId} onPick={setLinkId} placeholder="Søk etter tilbud eller oppdragsgiver" nativeID="evaluation-bid" />
            )
          ) : null}
        </>
      )}

      {units.length ? (
        <>
          <Text style={[styles.caption, { color: colors.muted }]}>Avdeling eller enhet (valgfritt)</Text>
          <View style={styles.chips}>
            <HrChip colors={colors} label="Hele selskapet" active={!unitId} onPress={() => setUnitId('')} />
            {units.map((u) => (
              <HrChip key={u.id} colors={colors} label={u.name} active={unitId === u.id} onPress={() => setUnitId(u.id)} nativeID={`evaluation-unit-${u.id}`} />
            ))}
          </View>
        </>
      ) : null}

      {customer ? (
        <Text style={[styles.caption, { color: colors.muted }]}>
          {EMAIL.test(recipientFromCustomer(customer).email)
            ? `Mottaker: ${[recipientFromCustomer(customer).name, customer.name].filter(Boolean).join(', ')} (${recipientFromCustomer(customer).email}). Du kan legge til flere etterpå.`
            : `Kunden ${customer.name} har ingen e-post. Legg til mottaker etterpå.`}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <HrButton colors={colors} primary icon="add" label={busy ? 'Lager …' : 'Lag evaluering'} disabled={!link || !template || busy} onPress={create} nativeID="evaluation-create" />
        {onCancel ? <HrButton colors={colors} label="Avbryt" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

export function EvaluationRow({ colors, survey, onOpen, showLink = true }) {
  const chart = chartColorsFor(colors);
  const pct = survey.stats.sent ? Math.min(100, Math.round((survey.stats.answered / survey.stats.sent) * 100)) : 0;
  const dl = surveyDeadline(survey);
  return (
    <Pressable onPress={onOpen} accessibilityRole="button" style={[styles.row, { borderColor: colors.line }]} nativeID={`evaluation-row-${survey.id}`}>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={[styles.bodyStrong, { color: colors.ink }]}>{survey.title}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {[
            showLink ? linkLabel(survey) : survey.unit.name,
            STATUS_LABEL[survey.status],
            survey.status === 'draft' ? `${survey.stats.recipients} mottakere` : `${survey.stats.answered} av ${survey.stats.sent} svarte`,
            survey.status === 'open' && dl.date ? (dl.passed ? 'fristen er ute' : `frist ${formatNbDate(dl.date)}`) : '',
            survey.summary?.ready && survey.summary.index != null ? `tilfredshet ${survey.summary.index}` : '',
            survey.summary?.ready && survey.summary.nps != null ? `NPS ${survey.summary.nps}` : '',
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

async function copyText(value) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return true;
  }
  return false;
}

/** Oversikten over alle evalueringer, med filter, snitt og referansetekst til tilbud. */
export default function EvaluationsPanel({
  colors, familyId, uid, surveys, templates, units = [], customers = [], companyName, canWrite, onOpen, onChanged,
}) {
  const [kind, setKind] = useState('');
  const [unitId, setUnitId] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => evaluationsFor(surveys, { kind, unitId }), [surveys, kind, unitId]);
  const avg = evaluationAverage(list);
  const reference = evaluationReferenceText(list, companyName);
  const usedUnits = units.filter((u) => evaluationsFor(surveys).some((s) => s.unit.id === u.id));

  return (
    <View style={styles.stack} nativeID="evaluations">
      <View style={styles.headRow}>
        <Text style={[styles.caption, { color: colors.muted, flex: 1, minWidth: 220 }]}>
          Evaluer prosjekter og tilbud sammen med kunden. Mottakeren får en lenke på e-post, svarer uten innlogging og får en kopi av svaret.
        </Text>
        {canWrite && !creating ? <HrButton colors={colors} primary icon="add" label="Ny evaluering" onPress={() => setCreating(true)} nativeID="evaluation-new-open" /> : null}
      </View>
      {creating ? (
        <NewEvaluationForm
          colors={colors}
          familyId={familyId}
          uid={uid}
          templates={templates}
          units={units}
          customers={customers}
          onCancel={() => setCreating(false)}
          onCreated={(s) => { setCreating(false); onChanged?.(); if (s?.id) onOpen?.(s.id); }}
        />
      ) : null}

      <View style={styles.chips}>
        {[{ id: '', label: 'Alle' }, { id: 'project', label: kindLabel('project', { plural: true }) }, { id: 'bid', label: kindLabel('bid', { plural: true }) }].map((k) => (
          <HrChip key={k.id || 'alle'} colors={colors} label={k.label} active={kind === k.id} onPress={() => setKind(k.id)} nativeID={`evaluation-kind-${k.id || 'alle'}`} />
        ))}
        {usedUnits.length ? <Text style={[styles.caption, { color: colors.muted }]}>·</Text> : null}
        {usedUnits.length ? <HrChip colors={colors} label="Alle avdelinger" active={!unitId} onPress={() => setUnitId('')} /> : null}
        {usedUnits.map((u) => (
          <HrChip key={u.id} colors={colors} label={u.name} active={unitId === u.id} onPress={() => setUnitId(u.id)} />
        ))}
      </View>

      {avg.count ? (
        <View style={[styles.box, { borderColor: colors.line }]} nativeID="evaluation-average">
          <View style={styles.stats}>
            {avg.index != null ? <Stat colors={colors} value={avg.index} label="Tilfredshet (0–100)" /> : null}
            {avg.nps != null ? <Stat colors={colors} value={avg.nps} label="NPS" /> : null}
            <Stat colors={colors} value={avg.count} label={avg.count === 1 ? 'avsluttet evaluering' : 'avsluttede evalueringer'} />
          </View>
          {reference ? (
            <View style={styles.stack}>
              <Text style={[styles.caption, { color: colors.muted }]}>Til tilbud og kvalifikasjon</Text>
              <Text style={[styles.body, { color: colors.ink }]} selectable nativeID="evaluation-reference">{reference}</Text>
              <View style={styles.actions}>
                <HrChip
                  colors={colors}
                  label="Kopier teksten"
                  onPress={async () => showSaveToast?.(await copyText(reference).catch(() => false) ? 'Teksten er kopiert.' : 'Merk teksten og kopier den.')}
                  nativeID="evaluation-reference-copy"
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      {list.map((s) => <EvaluationRow key={s.id} colors={colors} survey={s} onOpen={() => onOpen?.(s.id)} />)}
      {!list.length ? (
        <EmptyHint colors={colors} text={kind || unitId ? 'Ingen evalueringer med dette filteret.' : 'Ingen evalueringer ennå. Send en prosjektevaluering når et prosjekt er overlevert, eller en tilbudsevaluering etter tildeling.'} />
      ) : null}
    </View>
  );
}

function Stat({ colors, value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: colors.ink }]}>{String(value)}</Text>
      <Text style={[styles.caption, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 6, ...type.body },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, paddingVertical: 6 },
  chosen: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.control, padding: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingVertical: space.xs },
  meter: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { minWidth: 110, gap: 2 },
  statValue: { ...type.h1 },
});
