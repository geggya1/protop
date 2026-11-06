import { lazyScreen } from '../../src/ui/lazyScreen';
/**
 * Prosjekt → Evaluering. Ansatte sender en prosjektevaluering til kunden eller en annen person,
 * fra en av selskapets maler. Mottakeren svarer uten innlogging og får en kopi av svaret.
 * Samme data og flyt som Kunder → Kundeundersøkelse → Evalueringer (callable customerSurvey).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import {
  evaluationAverage, evaluationsFor, normalizeCustomerSurvey, templateList,
} from '../../src/surveys/customerSurvey';
import { customerSurveyCall } from '../../src/surveys/customerClient';
import { space, type } from '../../src/ui/tokens';
import { EvaluationRow, NewEvaluationForm, unitOptions } from '../../screens/customers/EvaluationsPanel';
const EmptyHint = lazyScreen(() => import('../../screens/hr/HrShared'), { name: 'EmptyHint', pick: 'EmptyHint', silent: true });
const HrButton = lazyScreen(() => import('../../screens/hr/HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const SurveyDetail = lazyScreen(() => import('../../screens/customers/CustomerSurveyDetail'), { name: 'SurveyDetail', pick: 'SurveyDetail', silent: true });

export default function ProjectEvaluationTab({
  familyId, project, customers = [], colors, uid,
}) {
  const { family } = useApp();
  const access = useCompanyAccess();
  const canWrite = !!access?.ready && (!!access.canEdit?.('customers') || !!access.canEdit?.('projects'));
  const [surveys, setSurveys] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [creating, setCreating] = useState(false);
  const units = useMemo(() => unitOptions(family?.company?.subUnits), [family?.company?.subUnits]);
  const link = useMemo(() => ({
    type: 'project', id: project.id, name: project.name || '', number: project.number || '',
  }), [project.id, project.name, project.number]);

  const reload = useCallback(() => {
    customerSurveyCall('list', { familyId })
      .then((r) => { setSurveys((r.surveys || []).map(normalizeCustomerSurvey)); setError(''); })
      .catch((err) => { setSurveys([]); setError(err?.message || 'Kunne ikke hente evalueringene.'); });
  }, [familyId]);
  useEffect(() => { if (familyId) reload(); }, [familyId, reload]);
  useEffect(() => {
    if (!familyId) return;
    customerSurveyCall('templates', { familyId })
      .then((r) => setTemplates(r.templates || templateList()))
      .catch(() => setTemplates(templateList()));
  }, [familyId]);

  const mine = useMemo(() => evaluationsFor(surveys, { linkType: 'project', linkId: project.id }), [surveys, project.id]);
  const avg = evaluationAverage(mine);
  const current = mine.find((s) => s.id === selected) || null;

  if (current) {
    return (
      <SurveyDetail
        key={`${current.id}:${current.status}`}
        colors={colors}
        familyId={familyId}
        survey={current}
        surveys={surveys}
        customers={customers}
        companyName={family?.name || ''}
        canWrite={canWrite}
        backLabel="Evalueringer for prosjektet"
        onBack={() => setSelected('')}
        onChanged={reload}
      />
    );
  }

  return (
    <View style={styles.stack} nativeID="project-evaluations">
      <View style={styles.headRow}>
        <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
          <Text style={[styles.title, { color: colors.ink }]}>Evaluering</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            Be kunden eller en samarbeidspartner evaluere prosjektet. De får en lenke på e-post, svarer uten innlogging og får en kopi av svaret. Resultatet kan brukes som referanse i tilbud.
          </Text>
        </View>
        {canWrite && !creating ? (
          <HrButton colors={colors} primary icon="add" label="Send evaluering" onPress={() => setCreating(true)} nativeID="project-evaluation-new" />
        ) : null}
      </View>
      {creating ? (
        <NewEvaluationForm
          colors={colors}
          familyId={familyId}
          uid={uid}
          templates={templates}
          units={units}
          customers={customers}
          fixedLink={link}
          fixedCustomerId={project.customerId || ''}
          onCancel={() => setCreating(false)}
          onCreated={(s) => { setCreating(false); reload(); if (s?.id) setSelected(s.id); }}
        />
      ) : null}
      {error ? <EmptyHint colors={colors} text={error} /> : null}
      {surveys === null ? <EmptyHint colors={colors} text="Henter evalueringer …" /> : null}
      {avg.count ? (
        <Text style={[styles.caption, { color: colors.ink }]}>
          {[avg.index != null ? `Tilfredshet ${avg.index} av 100` : '', avg.nps != null ? `NPS ${avg.nps}` : '', `${avg.count} avsluttet`].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {mine.map((s) => <EvaluationRow key={s.id} colors={colors} survey={s} showLink={false} onOpen={() => setSelected(s.id)} />)}
      {surveys && !mine.length && !error ? (
        <EmptyHint colors={colors} text="Ingen evalueringer av prosjektet ennå. Send en når prosjektet er overlevert." />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  title: { ...type.title },
  caption: { ...type.caption },
});
