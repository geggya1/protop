import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  APPLICATION_BOARD,
  APPLICATION_OUTCOMES,
  applicationsByBoard,
  choiceLabel,
  employeeDraftFromApplication,
  formatNbDate,
  JOB_STATUSES,
  moveApplicationBoard,
  normalizeApplication,
  normalizeJob,
  onboardingTasksFor,
  recruitmentFunnel,
} from '../../src/hr/model';
import { emptyEmployee, normalizeEmployee } from '../../src/employees/model';
import { saveEmployee } from '../../src/employees/storage';
import { DEFAULT_DOCUMENT_ACCEPT, pickDocument, uploadFile } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink,
} from './HrShared';

const isWeb = Platform.OS === 'web';

export default function HrRecruitment({ colors, hr, canWrite, onPatch, familyId }) {
  const [jobId, setJobId] = useState(hr.jobs?.[0]?.id || '');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [jobDraft, setJobDraft] = useState({
    title: '', department: '', location: '', description: '', requirements: '', status: 'open', headcount: '1',
  });
  const [appDraft, setAppDraft] = useState({
    name: '', email: '', phone: '', source: '', notes: '', score: '5', documentName: '', documentUrl: '',
  });
  const [evalDraft, setEvalDraft] = useState({ evaluation: '', response: '', rejectReason: '' });
  const [query, setQuery] = useState('');
  const [hiring, setHiring] = useState(false);
  const [dragId, setDragId] = useState('');
  const [uploading, setUploading] = useState(false);

  const funnel = useMemo(() => recruitmentFunnel(hr.applications), [hr.applications]);
  const activeJobId = jobId || hr.jobs?.[0]?.id || '';
  const activeJob = (hr.jobs || []).find((row) => row.id === activeJobId) || null;

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (hr.applications || [])
      .filter((row) => !activeJobId || row.jobId === activeJobId)
      .filter((row) => {
        if (!q) return true;
        return [row.name, row.email, row.phone, row.source, row.evaluation]
          .join(' ')
          .toLowerCase()
          .includes(q);
      });
  }, [hr.applications, activeJobId, query]);

  const buckets = useMemo(() => applicationsByBoard(filteredApps), [filteredApps]);
  const selectedApp = filteredApps.find((row) => row.id === selectedAppId) || filteredApps[0] || null;

  useEffect(() => {
    if (!selectedApp) {
      setEvalDraft({ evaluation: '', response: '', rejectReason: '' });
      return;
    }
    setEvalDraft({
      evaluation: selectedApp.evaluation || '',
      response: selectedApp.response || '',
      rejectReason: selectedApp.rejectReason || '',
    });
  }, [selectedApp?.id, selectedApp?.evaluation, selectedApp?.response, selectedApp?.rejectReason]);

  function patchApps(mapper) {
    onPatch?.((state) => ({
      applications: mapper(state.applications || []),
    }));
  }

  function moveApp(app, board, outcome) {
    if (!canWrite || !app) return;
    if (board === 'completed' && outcome === 'rejected' && !String(app.rejectReason || '').trim()) {
      setSelectedAppId(app.id);
      showSaveToast?.('Fyll inn begrunnelse for avslag før ferdigbehandling');
      return;
    }
    const next = moveApplicationBoard(app, board, outcome);
    patchApps((apps) => apps.map((row) => (row.id === app.id ? next : row)));
  }

  async function hireApplicant(app) {
    if (!canWrite || !familyId || !app || hiring) return;
    setHiring(true);
    try {
      const draft = employeeDraftFromApplication(app, activeJob);
      const employee = normalizeEmployee({
        ...emptyEmployee(),
        person: { ...emptyEmployee().person, ...draft.person },
        company: { ...emptyEmployee().company, ...draft.company },
      });
      const saved = await saveEmployee(familyId, employee);
      const tasks = onboardingTasksFor(saved?.id || employee.id);
      onPatch?.((state) => ({
        applications: (state.applications || []).map((row) => (
          row.id === app.id ? moveApplicationBoard(row, 'completed', 'hired') : row
        )),
        tasks: [...tasks, ...(state.tasks || [])],
      }));
      showSaveToast?.(`${draft.person.firstName || 'Søker'} er ansatt`);
    } catch {
      showSaveToast?.('Kunne ikke ansette søker');
    } finally {
      setHiring(false);
    }
  }

  function onDropToBoard(boardId) {
    if (!canWrite || !dragId) return;
    const app = (hr.applications || []).find((row) => row.id === dragId);
    if (!app) return;
    // Behold utfall ved dra til ferdig; ellers pending til HR velger vunnet/avslått.
    const outcome = boardId === 'completed'
      ? (app.outcome === 'hired' || app.outcome === 'rejected' ? app.outcome : 'pending')
      : 'pending';
    moveApp(app, boardId, outcome);
    setDragId('');
    if (boardId === 'completed' && outcome === 'pending') {
      setSelectedAppId(app.id);
      showSaveToast?.('Velg vunnet eller avslått for søknaden');
    }
  }

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Rekruttering"
          subtitle="Tre kolonner: mottatt → til behandling → ferdigbehandlet. Dra søknader mellom stegene."
        />
        <View style={styles.funnel}>
          {(funnel.board || []).map((stage) => (
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
                onPatch?.((state) => ({ jobs: [row, ...(state.jobs || [])] }));
                setJobId(row.id);
                setJobDraft({ title: '', department: '', location: '', description: '', requirements: '', status: 'open', headcount: '1' });
              }}
            />
          </View>
        ) : null}
      </HrCard>

      <HrField
        colors={colors}
        label="Søk i søknader"
        value={query}
        onChangeText={setQuery}
        placeholder="Navn, e-post, kilde …"
      />

      <View style={styles.board} nativeID="hr-ats-board">
        {APPLICATION_BOARD.map((col) => (
          <View
            key={col.id}
            style={[styles.column, { borderColor: colors.line, backgroundColor: colors.card }]}
            // @ts-ignore web DnD
            onDragOver={isWeb ? (e) => { e?.preventDefault?.(); } : undefined}
            onDrop={isWeb ? () => onDropToBoard(col.id) : undefined}
          >
            <Text style={[styles.columnTitle, { color: colors.ink }]}>{col.label}</Text>
            <Text style={[styles.columnCount, { color: colors.muted }]}>
              {(buckets[col.id] || []).length} søknader
            </Text>
            {(buckets[col.id] || []).map((app) => (
              <View
                key={app.id}
                // @ts-ignore web
                draggable={isWeb && canWrite}
                onDragStart={isWeb ? () => setDragId(app.id) : undefined}
                style={[
                  styles.card,
                  {
                    borderColor: selectedApp?.id === app.id ? colors.brand : colors.line,
                    backgroundColor: colors.bg,
                  },
                ]}
              >
                <Text
                  style={[styles.cardTitle, { color: colors.ink }]}
                  onPress={() => {
                    setSelectedAppId(app.id);
                    setEvalDraft({
                      evaluation: app.evaluation || '',
                      response: app.response || '',
                      rejectReason: app.rejectReason || '',
                    });
                  }}
                >
                  {app.name}
                </Text>
                <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={2}>
                  {[app.email, app.source, app.score ? `${app.score}/10` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {app.attachments?.length ? (
                  <Text style={[styles.cardMeta, { color: colors.muted }]}>
                    {`${app.attachments.length} dokument${app.attachments.length > 1 ? 'er' : ''}`}
                  </Text>
                ) : null}
                {col.id === 'completed' ? (
                  <Text style={[styles.cardMeta, { color: app.outcome === 'pending' ? (colors.danger || '#b91c1c') : colors.ink }]}>
                    {app.outcome === 'pending'
                      ? 'Velg utfall'
                      : choiceLabel(APPLICATION_OUTCOMES, app.outcome)}
                  </Text>
                ) : null}
                {canWrite ? (
                  <View style={styles.cardActions}>
                    {APPLICATION_BOARD.filter((b) => b.id !== col.id).map((b) => (
                      <HrChip
                        key={b.id}
                        colors={colors}
                        label={b.label.split(' ').slice(-1)[0]}
                        active={false}
                        onPress={() => moveApp(
                          app,
                          b.id,
                          b.id === 'completed'
                            ? (app.outcome === 'hired' || app.outcome === 'rejected' ? app.outcome : 'pending')
                            : 'pending',
                        )}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            ))}
            {(buckets[col.id] || []).length === 0 ? (
              <EmptyHint colors={colors} text="Tom kolonne — dra søknader hit." />
            ) : null}
          </View>
        ))}
      </View>

      {selectedApp && canWrite ? (
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title={`${selectedApp.name}`}
            subtitle="Evaluering, svar og utfall (vunnet / avslått)"
          />
          <Text style={[styles.cardMeta, { color: colors.muted }]}>
            {`Søkt ${formatNbDate(selectedApp.appliedAt)} · ${choiceLabel(APPLICATION_BOARD, selectedApp.board)}`}
          </Text>
          {(selectedApp.attachments || []).map((att) => (
            <RowLink
              key={att.id}
              colors={colors}
              title={att.name}
              subtitle={att.url || 'Dokument'}
              icon="attach-outline"
              onPress={() => {
                if (att.url && typeof window !== 'undefined') window.open(att.url, '_blank');
              }}
            />
          ))}
          <View style={styles.chips}>
            {APPLICATION_OUTCOMES.map((o) => (
              <HrChip
                key={o.id}
                colors={colors}
                label={o.label}
                active={selectedApp.outcome === o.id}
                onPress={() => {
                  if (o.id === 'rejected' && !String(evalDraft.rejectReason || selectedApp.rejectReason || '').trim()) {
                    showSaveToast?.('Fyll inn begrunnelse for avslag først');
                    return;
                  }
                  const next = moveApplicationBoard(
                    {
                      ...selectedApp,
                      rejectReason: evalDraft.rejectReason || selectedApp.rejectReason,
                    },
                    o.id === 'pending' ? 'processing' : 'completed',
                    o.id,
                  );
                  patchApps((apps) => apps.map((row) => (row.id === selectedApp.id ? next : row)));
                }}
              />
            ))}
          </View>
          <HrField colors={colors} label="Evaluering / scorecard" value={evalDraft.evaluation} onChangeText={(evaluation) => setEvalDraft((p) => ({ ...p, evaluation }))} multiline />
          <HrField colors={colors} label="Svar til søker" value={evalDraft.response} onChangeText={(response) => setEvalDraft((p) => ({ ...p, response }))} multiline />
          <HrField
            colors={colors}
            label="Begrunnelse ved avslag"
            value={evalDraft.rejectReason}
            onChangeText={(rejectReason) => setEvalDraft((p) => ({ ...p, rejectReason }))}
            multiline
            placeholder="Krav ikke møtt, annen kandidat, …"
          />
          <View style={styles.chips}>
            <HrButton
              colors={colors}
              label="Lagre vurdering"
              primary
              onPress={() => {
                patchApps((apps) => apps.map((row) => (
                  row.id === selectedApp.id
                    ? {
                      ...row,
                      evaluation: evalDraft.evaluation,
                      response: evalDraft.response,
                      rejectReason: evalDraft.rejectReason,
                    }
                    : row
                )));
              }}
            />
            {selectedApp.outcome !== 'hired' ? (
              <HrButton
                colors={colors}
                label={hiring ? 'Ansetter…' : 'Ansett (vunnet)'}
                primary
                icon="person-add-outline"
                disabled={hiring}
                onPress={() => hireApplicant(selectedApp)}
              />
            ) : null}
            {selectedApp.outcome !== 'rejected' ? (
              <HrButton
                colors={colors}
                label="Avslå"
                danger
                icon="close-circle-outline"
                onPress={() => {
                  if (!String(evalDraft.rejectReason || '').trim()) {
                    showSaveToast?.('Fyll inn begrunnelse for avslag');
                    return;
                  }
                  const next = moveApplicationBoard(
                    { ...selectedApp, rejectReason: evalDraft.rejectReason, response: evalDraft.response },
                    'completed',
                    'rejected',
                  );
                  patchApps((apps) => apps.map((row) => (row.id === selectedApp.id ? next : row)));
                }}
              />
            ) : null}
          </View>
        </HrCard>
      ) : null}

      {canWrite && activeJobId ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Registrer søknad" subtitle="Navn og dokumenter følger søknaden" />
          <HrField colors={colors} label="Navn" value={appDraft.name} onChangeText={(name) => setAppDraft((p) => ({ ...p, name }))} />
          <HrField colors={colors} label="E-post" value={appDraft.email} onChangeText={(email) => setAppDraft((p) => ({ ...p, email }))} />
          <HrField colors={colors} label="Telefon" value={appDraft.phone} onChangeText={(phone) => setAppDraft((p) => ({ ...p, phone }))} />
          <HrField colors={colors} label="Kilde" value={appDraft.source} onChangeText={(source) => setAppDraft((p) => ({ ...p, source }))} />
          <HrButton
            colors={colors}
            label={uploading ? 'Laster CV…' : 'Last opp CV / dokument'}
            icon="attach-outline"
            disabled={uploading || !familyId}
            onPress={async () => {
              if (!familyId || uploading) return;
              setUploading(true);
              try {
                const picked = await pickDocument({ accept: DEFAULT_DOCUMENT_ACCEPT });
                if (!picked) return;
                const path = `families/${familyId}/hr/applications/${Date.now()}_${picked.name || 'cv'}`;
                const url = await uploadFile(path, picked, picked.mimeType || 'application/octet-stream');
                setAppDraft((p) => ({
                  ...p,
                  documentName: picked.name || 'CV',
                  documentUrl: url,
                }));
                showSaveToast?.('Dokument lastet opp');
              } catch {
                showSaveToast?.('Kunne ikke laste opp dokument');
              } finally {
                setUploading(false);
              }
            }}
          />
          {appDraft.documentUrl ? (
            <Text style={[styles.cardMeta, { color: colors.muted }]}>
              {`Vedlegg: ${appDraft.documentName || 'Dokument'}`}
            </Text>
          ) : null}
          <HrField colors={colors} label="Dokumentnavn (CV)" value={appDraft.documentName} onChangeText={(documentName) => setAppDraft((p) => ({ ...p, documentName }))} placeholder="cv-ada.pdf" />
          <HrField colors={colors} label="Dokument-URL" value={appDraft.documentUrl} onChangeText={(documentUrl) => setAppDraft((p) => ({ ...p, documentUrl }))} placeholder="https://… eller storage-sti" />
          <HrField colors={colors} label="Notat" value={appDraft.notes} onChangeText={(notes) => setAppDraft((p) => ({ ...p, notes }))} multiline />
          <HrField colors={colors} label="Score 0–10" value={appDraft.score} onChangeText={(score) => setAppDraft((p) => ({ ...p, score }))} keyboardType="numeric" />
          <HrButton
            colors={colors}
            label="Legg inn søknad (mottatt)"
            primary
            onPress={() => {
              if (!appDraft.name.trim()) return;
              const attachments = appDraft.documentName || appDraft.documentUrl
                ? [{ name: appDraft.documentName || 'CV', url: appDraft.documentUrl }]
                : [];
              const row = normalizeApplication({
                ...appDraft,
                jobId: activeJobId,
                score: Number(appDraft.score) || 0,
                board: 'received',
                outcome: 'pending',
                stage: 'new',
                attachments,
              });
              onPatch?.((state) => ({ applications: [row, ...(state.applications || [])] }));
              setAppDraft({
                name: '', email: '', phone: '', source: '', notes: '', score: '5', documentName: '', documentUrl: '',
              });
            }}
          />
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  funnel: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  funnelCell: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, minWidth: 96 },
  funnelCount: { fontSize: 18, fontWeight: '700' },
  funnelLabel: { fontSize: 11, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 10, marginTop: 10 },
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' },
  column: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 220,
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    gap: 8,
    minHeight: 180,
  },
  columnTitle: { fontSize: 15, fontWeight: '700' },
  columnCount: { fontSize: 12, marginBottom: 4 },
  card: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardMeta: { fontSize: 12, lineHeight: 16 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
});
