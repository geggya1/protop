import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  APPLICATION_STAGES,
  choiceLabel,
  formatNbDate,
  JOB_STATUSES,
  normalizeApplication,
  normalizeJob,
  recruitmentFunnel,
} from '../../src/hr/model';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink,
} from './HrShared';

export default function HrRecruitment({ colors, hr, canWrite, onPatch }) {
  const [jobId, setJobId] = useState(hr.jobs?.[0]?.id || '');
  const [jobDraft, setJobDraft] = useState({
    title: '', department: '', location: '', description: '', requirements: '', status: 'open', headcount: '1',
  });
  const [appDraft, setAppDraft] = useState({
    name: '', email: '', phone: '', source: '', notes: '', score: '5',
  });
  const [evalDraft, setEvalDraft] = useState({ evaluation: '', response: '' });

  const funnel = useMemo(() => recruitmentFunnel(hr.applications), [hr.applications]);
  const activeJobId = jobId || hr.jobs?.[0]?.id || '';
  const apps = useMemo(
    () => (hr.applications || []).filter((row) => !activeJobId || row.jobId === activeJobId),
    [hr.applications, activeJobId],
  );
  const selectedApp = apps[0] || null;

  function moveStage(app, stage) {
    if (!canWrite) return;
    onPatch?.({
      applications: (hr.applications || []).map((row) => (
        row.id === app.id ? { ...row, stage, updatedAt: new Date().toISOString() } : row
      )),
    });
  }

  function saveEvaluation(app) {
    if (!canWrite || !app) return;
    onPatch?.({
      applications: (hr.applications || []).map((row) => (
        row.id === app.id
          ? {
            ...row,
            evaluation: evalDraft.evaluation || row.evaluation,
            response: evalDraft.response || row.response,
            updatedAt: new Date().toISOString(),
          }
          : row
      )),
    });
    setEvalDraft({ evaluation: '', response: '' });
  }

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Rekruttering"
          subtitle="Stillingsannonser, søknader, evaluering og svar — inspirert av moderne ATS"
        />
        <View style={styles.funnel}>
          {funnel.filter((s) => s.id !== 'withdrawn').map((stage) => (
            <View key={stage.id} style={[styles.funnelCell, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={[styles.funnelCount, { color: colors.ink }]}>{stage.count}</Text>
              <Text style={[styles.funnelLabel, { color: colors.muted }]}>{stage.label}</Text>
            </View>
          ))}
        </View>
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Stillingsannonser" />
        <View style={styles.chips}>
          {(hr.jobs || []).map((job) => (
            <HrChip
              key={job.id}
              colors={colors}
              label={`${job.title} (${choiceLabel(JOB_STATUSES, job.status)})`}
              active={job.id === activeJobId}
              onPress={() => setJobId(job.id)}
            />
          ))}
        </View>
        {(hr.jobs || []).map((job) => (
          <RowLink
            key={job.id}
            colors={colors}
            title={job.title}
            subtitle={[job.department, job.location, job.description].filter(Boolean).join(' · ')}
            meta={`${job.headcount} stilling${job.headcount > 1 ? 'er' : ''}`}
            onPress={() => setJobId(job.id)}
          />
        ))}
        {(hr.jobs || []).length === 0 ? <EmptyHint colors={colors} text="Ingen annonser ennå." /> : null}
        {canWrite ? (
          <View style={styles.form}>
            <HrField colors={colors} label="Tittel" value={jobDraft.title} onChangeText={(title) => setJobDraft((p) => ({ ...p, title }))} />
            <HrField colors={colors} label="Avdeling" value={jobDraft.department} onChangeText={(department) => setJobDraft((p) => ({ ...p, department }))} />
            <HrField colors={colors} label="Sted" value={jobDraft.location} onChangeText={(location) => setJobDraft((p) => ({ ...p, location }))} />
            <HrField colors={colors} label="Beskrivelse" value={jobDraft.description} onChangeText={(description) => setJobDraft((p) => ({ ...p, description }))} multiline />
            <HrField colors={colors} label="Krav / ressurser" value={jobDraft.requirements} onChangeText={(requirements) => setJobDraft((p) => ({ ...p, requirements }))} multiline />
            <HrButton
              colors={colors}
              label="Publiser annonse"
              primary
              icon="megaphone-outline"
              onPress={() => {
                if (!jobDraft.title.trim()) return;
                const row = normalizeJob({
                  ...jobDraft,
                  headcount: Number(jobDraft.headcount) || 1,
                  publishedAt: new Date().toISOString().slice(0, 10),
                  status: 'open',
                });
                onPatch?.({ jobs: [row, ...(hr.jobs || [])] });
                setJobId(row.id);
                setJobDraft({ title: '', department: '', location: '', description: '', requirements: '', status: 'open', headcount: '1' });
              }}
            />
          </View>
        ) : null}
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Søknader"
          subtitle={activeJobId ? 'Filtrert på valgt stilling' : 'Alle søknader'}
        />
        {apps.map((app) => (
          <View key={app.id} style={[styles.appBlock, { borderColor: colors.line }]}>
            <RowLink
              colors={colors}
              title={app.name}
              subtitle={[app.email, app.phone, app.source].filter(Boolean).join(' · ') || 'Søker'}
              meta={`${choiceLabel(APPLICATION_STAGES, app.stage)} · ${app.score}/10`}
              onPress={() => {}}
            />
            <Text style={[styles.meta, { color: colors.muted }]}>
              {`Søkt ${formatNbDate(app.appliedAt)}${app.evaluation ? ` · ${app.evaluation}` : ''}`}
            </Text>
            {app.response ? (
              <Text style={[styles.meta, { color: colors.ink }]}>{`Svar: ${app.response}`}</Text>
            ) : null}
            {canWrite ? (
              <View style={styles.chips}>
                {APPLICATION_STAGES.filter((s) => !['withdrawn'].includes(s.id)).map((stage) => (
                  <HrChip
                    key={stage.id}
                    colors={colors}
                    label={stage.label}
                    active={app.stage === stage.id}
                    onPress={() => moveStage(app, stage.id)}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ))}
        {apps.length === 0 ? <EmptyHint colors={colors} text="Ingen søknader på denne stillingen." /> : null}

        {canWrite && activeJobId ? (
          <View style={styles.form}>
            <Text style={[styles.formTitle, { color: colors.ink }]}>Registrer søknad</Text>
            <HrField colors={colors} label="Navn" value={appDraft.name} onChangeText={(name) => setAppDraft((p) => ({ ...p, name }))} />
            <HrField colors={colors} label="E-post" value={appDraft.email} onChangeText={(email) => setAppDraft((p) => ({ ...p, email }))} />
            <HrField colors={colors} label="Telefon" value={appDraft.phone} onChangeText={(phone) => setAppDraft((p) => ({ ...p, phone }))} />
            <HrField colors={colors} label="Kilde" value={appDraft.source} onChangeText={(source) => setAppDraft((p) => ({ ...p, source }))} placeholder="FINN, LinkedIn, tips …" />
            <HrField colors={colors} label="Notat" value={appDraft.notes} onChangeText={(notes) => setAppDraft((p) => ({ ...p, notes }))} multiline />
            <HrField colors={colors} label="Score 0–10" value={appDraft.score} onChangeText={(score) => setAppDraft((p) => ({ ...p, score }))} keyboardType="numeric" />
            <HrButton
              colors={colors}
              label="Legg inn søknad"
              primary
              onPress={() => {
                if (!appDraft.name.trim()) return;
                const row = normalizeApplication({
                  ...appDraft,
                  jobId: activeJobId,
                  score: Number(appDraft.score) || 0,
                  stage: 'new',
                });
                onPatch?.({ applications: [row, ...(hr.applications || [])] });
                setAppDraft({ name: '', email: '', phone: '', source: '', notes: '', score: '5' });
              }}
            />
          </View>
        ) : null}

        {canWrite && selectedApp ? (
          <View style={styles.form}>
            <Text style={[styles.formTitle, { color: colors.ink }]}>
              {`Evaluer / svar · ${selectedApp.name}`}
            </Text>
            <HrField colors={colors} label="Evaluering" value={evalDraft.evaluation} onChangeText={(evaluation) => setEvalDraft((p) => ({ ...p, evaluation }))} multiline />
            <HrField colors={colors} label="Svar til søker" value={evalDraft.response} onChangeText={(response) => setEvalDraft((p) => ({ ...p, response }))} multiline />
            <HrButton colors={colors} label="Lagre vurdering" primary onPress={() => saveEvaluation(selectedApp)} />
          </View>
        ) : null}
      </HrCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  funnel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  funnelCell: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 72 },
  funnelCount: { fontSize: 18, fontWeight: '700' },
  funnelLabel: { fontSize: 11, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 10, marginTop: 10 },
  formTitle: { fontSize: 14, fontWeight: '600' },
  appBlock: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 8 },
  meta: { fontSize: 12, lineHeight: 17 },
});
