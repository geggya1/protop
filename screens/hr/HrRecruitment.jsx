import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  JOB_STATUSES,
  choiceLabel,
  employeeDraftFromApplication,
  formatNbDate,
  normalizeApplication,
  onboardingTasksFor,
} from '../../src/hr/model';
import {
  APPLICATION_SOURCES, SORTS, applicationFromRead, applicationsByColumn, applyReadToApplication,
  filterApplications, isClosedStage, jobCounts, logApplicationEvent, moveApplicationStage,
  recruitmentOverview, sortApplications, stageLabel,
} from '../../src/hr/recruitment';
import {
  APPLICATION_ACCEPT, canReadApplicationFile, fileBytes, readApplicationFile, storageSafeName,
} from '../../src/hr/applicationImport';
import { RETENTION_DEFAULTS } from '../../src/hr/retention';
import { emptyEmployee, normalizeEmployee, displayName } from '../../src/employees/model';
import { saveEmployee } from '../../src/employees/storage';
import { pickDocument, uploadFile } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import { requestConfirm } from '../../src/ui/confirm';
import FileDropZone from '../anbud/FileDropZone';
import RecruitmentBoard from './RecruitmentBoard';
import RecruitmentApplicant from './RecruitmentApplicant';
import RecruitmentJobForm from './RecruitmentJobForm';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField,
} from './HrShared';
import { radius, type } from '../../src/ui/tokens';

const isWeb = Platform.OS === 'web';
const MAX_FILES = 15;

const OWNER_FILTERS = [
  { id: '', label: 'Alle' },
  { id: 'mine', label: 'Mine' },
  { id: 'none', label: 'Uten ansvarlig' },
];

const EMPTY_MANUAL = {
  name: '', email: '', phone: '', source: '', notes: '',
};

function Kpi({
  colors, label, value, tone, onPress, active, nativeID,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      nativeID={nativeID}
      accessibilityRole={onPress ? 'button' : undefined}
      style={[
        styles.kpi,
        {
          borderColor: active ? colors.brand : colors.line,
          backgroundColor: active ? `${colors.brand}10` : colors.card,
        },
      ]}
    >
      <Text style={[styles.kpiValue, { color: tone || colors.ink }]}>{value}</Text>
      <Text style={[styles.kpiLabel, { color: colors.muted }]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

function ImportRow({ colors, row }) {
  const icon = row.status === 'done' ? 'checkmark-circle' : row.status === 'error' ? 'alert-circle' : 'sync-outline';
  const tone = row.status === 'done' ? colors.successInk : row.status === 'error' ? colors.dangerInk : colors.muted;
  const label = {
    upload: 'Laster opp …',
    read: 'Leser med OCR og AI …',
    done: row.message || 'Lagt inn',
    error: row.message || 'Feilet',
  }[row.status];
  return (
    <View style={styles.importRow}>
      <Ionicons name={icon} size={15} color={tone} />
      <Text style={[styles.importName, { color: colors.ink }]} numberOfLines={1}>{row.name}</Text>
      <Text style={[styles.importStatus, { color: tone }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

export default function HrRecruitment({
  colors, hr, canWrite, onPatch, familyId, focus = null, retention = RETENTION_DEFAULTS,
  employees = [], uid = '', assigneeName = '', companyName = '',
}) {
  const jobs = hr.jobs || [];
  const applications = hr.applications || [];
  // null: ingen valgt ennå, vis første åpne stilling. '': alle stillinger.
  const [jobPick, setJobId] = useState(focus?.jobId || null);
  const [query, setQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sort, setSort] = useState('recent');
  const [showClosed, setShowClosed] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [closeOnOpen, setCloseOnOpen] = useState(false);
  const [jobForm, setJobForm] = useState(focus?.newJob ? { job: null } : null);
  const [showJobText, setShowJobText] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [imports, setImports] = useState([]);
  const [hiring, setHiring] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const busyRef = useRef(false);

  const actor = useMemo(() => ({ uid: uid || '', name: assigneeName || '' }), [uid, assigneeName]);

  // Fra oversikten: stillingen som ble trykket på, eller «Ny stilling».
  useEffect(() => {
    if (focus?.jobId) setJobId(focus.jobId);
    if (focus?.newJob) setJobForm({ job: null });
  }, [focus]);

  const jobsById = useMemo(() => Object.fromEntries(jobs.map((row) => [row.id, row])), [jobs]);
  const counts = useMemo(() => jobCounts(jobs, applications), [jobs, applications]);
  const sortedJobs = useMemo(() => {
    const rank = { open: 0, draft: 1, paused: 2, closed: 3 };
    return [...jobs].sort((a, b) => (rank[a.status] ?? 4) - (rank[b.status] ?? 4)
      || String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [jobs]);
  const jobId = jobPick ?? (sortedJobs.find((row) => row.status === 'open')?.id || '');
  const activeJob = jobsById[jobId] || null;

  const ownerOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    const add = (id, name, hint) => {
      if (!id || seen.has(id) || !name) return;
      seen.add(id);
      out.push({ id, label: hint ? `${name} (${hint})` : name, name });
    };
    add(uid, assigneeName || 'Meg', 'meg');
    for (const employee of employees || []) {
      const status = String(employee?.company?.status || 'active');
      if (status !== 'active') continue;
      const id = employee.personUid || `emp:${employee.id}`;
      add(id, displayName(employee), employee?.company?.title || '');
    }
    // Ansvarlige som er satt før, men ikke lenger står i listen.
    for (const row of [...applications, ...jobs]) add(row.ownerUid, row.ownerName, '');
    return out;
  }, [employees, uid, assigneeName, applications, jobs]);

  const scoped = useMemo(
    () => applications.filter((row) => !jobId || row.jobId === jobId),
    [applications, jobId],
  );
  const overview = useMemo(() => recruitmentOverview(scoped), [scoped]);
  const visible = useMemo(() => sortApplications(filterApplications(scoped, {
    query, owner: ownerFilter, uid, showClosed,
  }), sort), [scoped, query, ownerFilter, uid, showClosed, sort]);
  const buckets = useMemo(() => applicationsByColumn(visible), [visible]);
  const selected = applications.find((row) => row.id === selectedId) || null;

  const updateApp = useCallback((appId, mapper) => {
    onPatch?.((state) => ({
      applications: (state.applications || []).map((row) => (
        row.id === appId ? mapper(normalizeApplication(row)) : row
      )),
    }));
  }, [onPatch]);

  function moveCard(appId, target) {
    if (!canWrite) return;
    const app = applications.find((row) => row.id === appId);
    if (!app) return;
    if (target === 'closed') {
      if (isClosedStage(app.stage)) return;
      setSelectedId(app.id);
      setCloseOnOpen(true);
      return;
    }
    if (app.stage === target) return;
    if (app.stage === 'hired') {
      showSaveToast?.('Søkeren er ansatt og kan ikke flyttes tilbake');
      return;
    }
    const result = moveApplicationStage(app, target, { actor });
    if (!result.ok) {
      showSaveToast?.(result.error);
      return;
    }
    updateApp(app.id, (row) => moveApplicationStage(row, target, { actor }).app);
  }

  function setImport(id, patch) {
    setImports((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  /** Laster opp filen og leser den. Svarer { attachment, read, engine, error }. */
  async function uploadAndRead(file, { job, importId }) {
    const name = file?.name || 'soknad';
    const mime = file?.mimeType || file?.type || '';
    let attachment = null;
    try {
      const path = `families/${familyId}/hr/applications/${Date.now()}_${storageSafeName(name)}`;
      const url = await uploadFile(path, file, mime || 'application/octet-stream');
      attachment = {
        name, url, mime, size: file?.size || 0, uploadedAt: new Date().toISOString(),
      };
    } catch {
      attachment = null;
    }
    if (!canReadApplicationFile(name)) {
      return { attachment, read: null, engine: '', error: attachment ? '' : 'Kunne ikke laste opp filen' };
    }
    if (importId) setImport(importId, { status: 'read' });
    let bytes = null;
    try {
      bytes = await fileBytes(file);
    } catch {
      return { attachment, read: null, engine: '', error: 'Kunne ikke lese filen' };
    }
    const result = await readApplicationFile({
      familyId, bytes, filename: name, mime, job,
    });
    return { attachment, ...result };
  }

  async function importFiles(fileList, stage = 'new') {
    if (!canWrite) return;
    if (!familyId) {
      showSaveToast?.('Åpne selskapet først');
      return;
    }
    const files = Array.from(fileList || []).filter(Boolean).slice(0, MAX_FILES);
    if (!files.length) return;
    if ((fileList || []).length > MAX_FILES) showSaveToast?.(`Tar de første ${MAX_FILES} filene`);
    const job = activeJob;
    const queue = files.map((file, index) => ({
      id: `${Date.now()}_${index}`, name: file?.name || 'Fil', status: 'upload', message: '',
    }));
    setImports((rows) => [...queue, ...rows].slice(0, 30));
    let added = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const importId = queue[index].id;
      try {
        // eslint-disable-next-line no-await-in-loop
        const { attachment, read, engine, error } = await uploadAndRead(file, { job, importId });
        if (!read && !attachment) {
          setImport(importId, { status: 'error', message: error || 'Kunne ikke lese filen' });
          continue;
        }
        const email = String(read?.candidate?.email || '').toLowerCase();
        let mergedInto = '';
        onPatch?.((state) => {
          const list = state.applications || [];
          const twin = email
            ? list.find((row) => row.email === email && row.jobId === (job?.id || '') && !isClosedStage(row.stage))
            : null;
          if (twin) {
            mergedInto = twin.name;
            return {
              applications: list.map((row) => {
                if (row.id !== twin.id) return row;
                const withRead = read ? applyReadToApplication(row, read, { engine }) : normalizeApplication(row);
                return logApplicationEvent({
                  ...withRead,
                  attachments: attachment ? [...withRead.attachments, attachment] : withRead.attachments,
                }, 'ai', { actor, text: attachment?.name || '' });
              }),
            };
          }
          const app = applicationFromRead(read || { candidate: {} }, {
            jobId: job?.id || '', stage, attachment, actor, engine,
          });
          return { applications: [app, ...list] };
        });
        added += 1;
        const who = read?.candidate?.name || file?.name || 'Søker';
        setImport(importId, {
          status: 'done',
          message: mergedInto
            ? `Lagt til hos ${mergedInto} (samme e-post)`
            : `${who} lagt inn i ${stageLabel(stage)}${error ? ` · ${error}` : (engine && engine !== 'local' ? ' · lest med AI' : '')}`,
        });
      } catch (err) {
        setImport(importId, { status: 'error', message: String(err?.message || 'Feilet') });
      }
    }
    if (added) showSaveToast?.(added === 1 ? 'Søknaden er lagt inn' : `${added} søknader er lagt inn`);
  }

  async function pickAndImport() {
    if (!canWrite || busyRef.current) return;
    busyRef.current = true;
    try {
      const picked = await pickDocument({ accept: APPLICATION_ACCEPT, multiple: true });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      if (list.length) await importFiles(list, 'new');
    } catch {
      showSaveToast?.('Kunne ikke åpne filvelgeren');
    } finally {
      busyRef.current = false;
    }
  }

  async function attachFiles(appId, fileList) {
    if (!canWrite || !familyId || attaching) return;
    const files = Array.from(fileList || []).filter(Boolean).slice(0, 5);
    if (!files.length) return;
    const app = applications.find((row) => row.id === appId);
    if (!app) return;
    setAttaching(true);
    try {
      for (const file of files) {
        // eslint-disable-next-line no-await-in-loop
        const { attachment, read, engine, error } = await uploadAndRead(file, { job: jobsById[app.jobId] || null });
        updateApp(appId, (row) => {
          const withRead = read ? applyReadToApplication(row, read, { engine }) : row;
          return logApplicationEvent({
            ...withRead,
            attachments: attachment ? [...withRead.attachments, attachment] : withRead.attachments,
          }, read && engine !== 'local' ? 'ai' : 'document', { actor, text: attachment?.name || file?.name || '' });
        });
        showSaveToast?.(error || (read && engine !== 'local' ? 'Dokument lagt til og lest med AI' : 'Dokument lagt til'));
      }
    } finally {
      setAttaching(false);
    }
  }

  async function pickAndAttach(appId) {
    try {
      const picked = await pickDocument({ accept: APPLICATION_ACCEPT, multiple: true });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      if (list.length) await attachFiles(appId, list);
    } catch {
      showSaveToast?.('Kunne ikke åpne filvelgeren');
    }
  }

  function addManual() {
    if (!canWrite || !manual.name.trim()) return;
    const app = applicationFromRead({
      candidate: { name: manual.name.trim(), email: manual.email.trim(), phone: manual.phone.trim() },
    }, { jobId: activeJob?.id || '', actor, source: manual.source });
    const row = normalizeApplication({ ...app, notes: manual.notes.trim() });
    onPatch?.((state) => ({ applications: [row, ...(state.applications || [])] }));
    setManual(EMPTY_MANUAL);
    setManualOpen(false);
    setSelectedId(row.id);
    showSaveToast?.('Søknaden er lagt inn');
  }

  async function hireApplicant(app) {
    if (!canWrite || !familyId || !app || hiring) return;
    const job = jobsById[app.jobId] || null;
    const ok = await requestConfirm({
      title: 'Ansette søkeren?',
      message: `${app.name} opprettes som ansatt${job ? ` i stillingen ${job.title}` : ''}${app.offerStart ? ` med oppstart ${formatNbDate(app.offerStart)}` : ''}, og får oppgaver for onboarding.`,
      confirmText: 'Ansett',
    });
    if (!ok) return;
    setHiring(true);
    try {
      const draft = employeeDraftFromApplication(app, job);
      const base = emptyEmployee();
      const employee = normalizeEmployee({
        ...base,
        person: { ...base.person, ...draft.person },
        company: {
          ...base.company,
          ...draft.company,
          ...(app.offerStart ? { periodFrom: app.offerStart } : {}),
        },
      });
      const saved = await saveEmployee(familyId, employee);
      const employeeId = saved?.id || employee.id;
      const tasks = onboardingTasksFor(employeeId, { assignedBy: assigneeName });
      onPatch?.((state) => ({
        applications: (state.applications || []).map((row) => {
          if (row.id !== app.id) return row;
          const moved = moveApplicationStage({ ...normalizeApplication(row), ...app }, 'hired', { actor }).app;
          return logApplicationEvent({ ...moved, employeeId }, 'hired', { actor });
        }),
        tasks: [...tasks, ...(state.tasks || [])],
      }));
      showSaveToast?.(`${draft.person.firstName || 'Søker'} er ansatt`);
    } catch {
      showSaveToast?.('Kunne ikke ansette søker');
    } finally {
      setHiring(false);
    }
  }

  async function deleteApplication(app) {
    const ok = await requestConfirm({
      title: 'Slette søknaden?',
      message: `Søknaden fra ${app.name} med vurderinger og notater slettes. Dette kan ikke angres.`,
      tone: 'danger',
    });
    if (!ok) return;
    setSelectedId('');
    onPatch?.((state) => ({
      applications: (state.applications || []).filter((row) => row.id !== app.id),
    }));
  }

  function saveJob(row) {
    onPatch?.((state) => {
      const list = state.jobs || [];
      const exists = list.some((job) => job.id === row.id);
      return { jobs: exists ? list.map((job) => (job.id === row.id ? row : job)) : [row, ...list] };
    });
    setJobId(row.id);
    setJobForm(null);
  }

  async function removeJob(job) {
    const used = counts[job.id]?.total || 0;
    if (used) {
      onPatch?.((state) => ({
        jobs: (state.jobs || []).map((row) => (row.id === job.id ? { ...row, status: 'closed', updatedAt: new Date().toISOString() } : row)),
      }));
      setJobForm(null);
      return;
    }
    const ok = await requestConfirm({ title: 'Slette stillingen?', message: `«${job.title}» slettes.`, tone: 'danger' });
    if (!ok) return;
    onPatch?.((state) => ({ jobs: (state.jobs || []).filter((row) => row.id !== job.id) }));
    setJobId('');
    setJobForm(null);
  }

  function setJobStatus(job, status) {
    onPatch?.((state) => ({
      jobs: (state.jobs || []).map((row) => (row.id === job.id
        ? { ...row, status, publishedAt: status === 'open' && !row.publishedAt ? new Date().toISOString().slice(0, 10) : row.publishedAt, updatedAt: new Date().toISOString() }
        : row)),
    }));
  }

  const importing = imports.some((row) => row.status === 'upload' || row.status === 'read');
  const empty = !jobs.length && !applications.length;

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <View style={styles.rowBetween}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.jobChips} style={{ flex: 1 }}>
            <HrChip
              colors={colors}
              label={`Alle stillinger (${applications.length})`}
              active={!jobId}
              onPress={() => setJobId('')}
              nativeID="hr-job-all"
            />
            {sortedJobs.map((job) => (
              <HrChip
                key={job.id}
                colors={colors}
                label={`${job.title}${job.status !== 'open' ? ` · ${choiceLabel(JOB_STATUSES, job.status).toLowerCase()}` : ''} (${counts[job.id]?.active || 0})`}
                active={jobId === job.id}
                onPress={() => setJobId(job.id)}
              />
            ))}
          </ScrollView>
          {canWrite ? (
            <HrButton colors={colors} label="Ny stilling" primary icon="add" onPress={() => setJobForm({ job: null })} nativeID="hr-job-new" />
          ) : null}
        </View>
        {activeJob ? (
          <View style={[styles.jobBox, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="hr-job-detail">
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={[styles.jobTitle, { color: colors.ink }]}>{activeJob.title}</Text>
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {[
                    activeJob.department,
                    activeJob.location,
                    activeJob.headcount > 1 ? `${activeJob.headcount} stillinger` : '',
                    activeJob.closesAt ? `Frist ${formatNbDate(activeJob.closesAt)}` : '',
                    activeJob.ownerName ? `Ansvarlig: ${activeJob.ownerName}` : 'Ingen ansvarlig',
                    `${counts[activeJob.id]?.total || 0} søkere`,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {canWrite ? (
                <HrButton colors={colors} label="Endre" icon="create-outline" onPress={() => setJobForm({ job: activeJob })} />
              ) : null}
            </View>
            {canWrite ? (
              <View style={styles.chips}>
                {JOB_STATUSES.map((status) => (
                  <HrChip key={status.id} colors={colors} label={status.label} active={activeJob.status === status.id} onPress={() => setJobStatus(activeJob, status.id)} />
                ))}
              </View>
            ) : null}
            {activeJob.description || activeJob.requirements ? (
              <>
                <Pressable onPress={() => setShowJobText((v) => !v)} accessibilityRole="button" style={styles.toggle}>
                  <Ionicons name={showJobText ? 'chevron-up' : 'chevron-down'} size={14} color={colors.brand} />
                  <Text style={[styles.meta, { color: colors.brand }]}>{showJobText ? 'Skjul annonsetekst og krav' : 'Vis annonsetekst og krav'}</Text>
                </Pressable>
                {showJobText ? (
                  <View style={{ gap: 6 }}>
                    {activeJob.description ? <Text style={[styles.body, { color: colors.ink }]}>{activeJob.description}</Text> : null}
                    {activeJob.requirements ? (
                      <>
                        <Text style={[styles.label, { color: colors.muted }]}>Krav</Text>
                        <Text style={[styles.body, { color: colors.ink }]}>{activeJob.requirements}</Text>
                      </>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}
      </HrCard>

      <View style={styles.kpis} nativeID="hr-recruit-kpis">
        <Kpi colors={colors} label="Aktive søkere" value={overview.active} />
        <Kpi colors={colors} label="Nye" value={overview.new} />
        <Kpi colors={colors} label="Til vurdering" value={overview.screening} />
        <Kpi colors={colors} label="Intervju / referanser" value={overview.interview} />
        <Kpi colors={colors} label="Tilbud sendt" value={overview.offer} />
        <Kpi colors={colors} label="Ansatt" value={overview.hired} tone={colors.successInk} />
        <Kpi colors={colors} label="Avslått / trukket" value={overview.closedNo} />
        {overview.unassigned ? (
          <Kpi
            colors={colors}
            label="Uten ansvarlig"
            value={overview.unassigned}
            tone={colors.warnInk}
            active={ownerFilter === 'none'}
            onPress={() => setOwnerFilter(ownerFilter === 'none' ? '' : 'none')}
          />
        ) : null}
        {overview.unscored ? (
          <Kpi colors={colors} label="Ikke vurdert" value={overview.unscored} tone={colors.warnInk} />
        ) : null}
        {overview.unanswered ? (
          <Kpi colors={colors} label="Mangler svar" value={overview.unanswered} tone={colors.dangerInk} />
        ) : null}
        {overview.idle ? (
          <Kpi colors={colors} label="Uendret i 14+ dager" value={overview.idle} tone={colors.warnInk} />
        ) : null}
      </View>

      {canWrite ? (
        <FileDropZone
          colors={colors}
          onFiles={(files) => importFiles(files, 'new')}
          disabled={!familyId}
          nativeID="hr-recruit-drop"
          style={[styles.drop, { borderColor: colors.line, backgroundColor: colors.card }]}
        >
          <View style={styles.dropInner}>
            <View style={[styles.dropIcon, { backgroundColor: `${colors.brand}14` }]}>
              <Ionicons name="document-text-outline" size={22} color={colors.brand} />
            </View>
            <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
              <Text style={[styles.dropTitle, { color: colors.ink }]}>
                {isWeb ? 'Slipp CV-er og søknader her' : 'Last opp CV-er og søknader'}
              </Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {`PDF, Word eller bilde. Filen lagres, leses med OCR og AI, og søkeren legges i «Mottatt»${activeJob ? ` for ${activeJob.title}` : ' som åpen søknad'}. Navn, kontaktinfo, erfaring og match mot kravene fylles ut.`}
              </Text>
            </View>
            <View style={styles.chips}>
              <HrButton
                colors={colors}
                label={importing ? 'Leser …' : 'Velg filer'}
                primary
                icon="cloud-upload-outline"
                disabled={importing || !familyId}
                onPress={pickAndImport}
                nativeID="hr-recruit-upload"
              />
              <HrButton
                colors={colors}
                label="Registrer manuelt"
                icon="create-outline"
                onPress={() => setManualOpen((v) => !v)}
                nativeID="hr-recruit-manual"
              />
            </View>
          </View>
          {imports.length ? (
            <View style={[styles.imports, { borderTopColor: colors.line }]} nativeID="hr-recruit-imports">
              {imports.slice(0, 8).map((row) => <ImportRow key={row.id} colors={colors} row={row} />)}
              {!importing ? (
                <Pressable onPress={() => setImports([])} accessibilityRole="button">
                  <Text style={[styles.meta, { color: colors.brand }]}>Fjern listen</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </FileDropZone>
      ) : null}

      {canWrite && manualOpen ? (
        <HrCard colors={colors}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Registrer søknad</Text>
          <View style={styles.grid}>
            <View style={styles.cell}><HrField colors={colors} label="Navn" value={manual.name} onChangeText={(name) => setManual((p) => ({ ...p, name }))} autoFocus /></View>
            <View style={styles.cell}><HrField colors={colors} label="E-post" value={manual.email} onChangeText={(email) => setManual((p) => ({ ...p, email }))} keyboardType="email-address" /></View>
            <View style={styles.cell}><HrField colors={colors} label="Telefon" value={manual.phone} onChangeText={(phone) => setManual((p) => ({ ...p, phone }))} keyboardType="phone-pad" /></View>
          </View>
          <Text style={[styles.label, { color: colors.muted }]}>Kilde</Text>
          <View style={styles.chips}>
            {APPLICATION_SOURCES.map((source) => (
              <HrChip key={source} colors={colors} label={source} active={manual.source === source} onPress={() => setManual((p) => ({ ...p, source: p.source === source ? '' : source }))} />
            ))}
          </View>
          <HrField colors={colors} label="Notat" value={manual.notes} onChangeText={(notes) => setManual((p) => ({ ...p, notes }))} multiline />
          <Text style={[styles.meta, { color: colors.muted }]}>
            {`Legges i «Mottatt»${activeJob ? ` for ${activeJob.title}` : ' som åpen søknad'}. CV og dokumenter legger du til i søknaden etterpå.`}
          </Text>
          <View style={styles.chips}>
            <HrButton colors={colors} label="Legg inn søknad" primary icon="person-add-outline" disabled={!manual.name.trim()} onPress={addManual} nativeID="hr-recruit-manual-save" />
            <HrButton colors={colors} label="Avbryt" onPress={() => { setManualOpen(false); setManual(EMPTY_MANUAL); }} />
          </View>
        </HrCard>
      ) : null}

      <View style={styles.filters}>
        <View style={styles.search}>
          <HrField colors={colors} value={query} onChangeText={setQuery} placeholder="Søk i navn, e-post, kilde, ferdigheter …" />
        </View>
        <View style={[styles.chips, styles.filterChips]}>
          {OWNER_FILTERS.map((row) => (
            <HrChip key={row.id || 'all'} colors={colors} label={row.label} active={ownerFilter === row.id} onPress={() => setOwnerFilter(row.id)} />
          ))}
        </View>
        <View style={[styles.chips, styles.filterChips]}>
          {SORTS.map((row) => (
            <HrChip key={row.id} colors={colors} label={row.label} active={sort === row.id} onPress={() => setSort(row.id)} />
          ))}
          <HrChip colors={colors} label={showClosed ? 'Skjul avsluttede' : 'Vis avsluttede'} active={!showClosed} onPress={() => setShowClosed((v) => !v)} />
        </View>
      </View>

      {empty ? (
        <EmptyHint
          colors={colors}
          text={canWrite
            ? 'Ingen stillinger eller søknader ennå. Opprett en stilling med krav, og slipp CV-ene i feltet over. Søkerne havner i «Mottatt», og du drar dem videre gjennom vurdering, intervju og tilbud.'
            : 'Ingen søknader ennå.'}
        />
      ) : null}

      <RecruitmentBoard
        colors={colors}
        buckets={buckets}
        jobsById={jobsById}
        showJob={!jobId}
        selectedId={selectedId}
        canWrite={canWrite}
        retention={retention}
        onOpen={(id) => { setCloseOnOpen(false); setSelectedId(id); }}
        onMove={moveCard}
        onFiles={importFiles}
      />

      {selected ? (
        <RecruitmentApplicant
          colors={colors}
          app={selected}
          job={jobsById[selected.jobId] || null}
          jobs={jobs}
          canWrite={canWrite}
          actor={actor}
          ownerOptions={ownerOptions}
          company={{ name: companyName }}
          retention={retention}
          hiring={hiring}
          attaching={attaching}
          initialClose={closeOnOpen}
          onClose={() => { setSelectedId(''); setCloseOnOpen(false); }}
          onUpdate={updateApp}
          onHire={hireApplicant}
          onDelete={deleteApplication}
          onAttachFiles={attachFiles}
          onPickFiles={pickAndAttach}
        />
      ) : null}

      {jobForm ? (
        <RecruitmentJobForm
          colors={colors}
          job={jobForm.job}
          actor={actor}
          ownerOptions={ownerOptions}
          applicationCount={jobForm.job ? counts[jobForm.job.id]?.total || 0 : 0}
          onSave={saveJob}
          onDelete={removeJob}
          onClose={() => setJobForm(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  rowBetween: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
  },
  jobChips: { gap: 8, alignItems: 'center', paddingRight: 8 },
  jobBox: {
    borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 8, marginTop: 10,
  },
  jobTitle: { fontSize: type.body.fontSize, fontWeight: '700' },
  meta: { fontSize: type.caption.fontSize, lineHeight: 17 },
  body: { fontSize: type.label.fontSize, lineHeight: 19 },
  label: { fontSize: type.caption.fontSize, fontWeight: '600' },
  cardTitle: { fontSize: type.body.fontSize, fontWeight: '700', marginBottom: 6 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  chips: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center',
  },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 12, paddingVertical: 8, minWidth: 104, flexGrow: 1, flexBasis: 104, maxWidth: 180,
  },
  kpiValue: { fontSize: type.h2.fontSize, fontWeight: '700' },
  kpiLabel: { fontSize: type.caption.fontSize, marginTop: 2 },
  drop: {
    borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.card, padding: 14, gap: 10,
  },
  dropInner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap',
  },
  dropIcon: {
    width: 42, height: 42, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
  },
  dropTitle: { fontSize: type.body.fontSize, fontWeight: '700' },
  imports: { borderTopWidth: 1, paddingTop: 8, gap: 6 },
  importRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  importName: { fontSize: type.caption.fontSize, fontWeight: '600', flexShrink: 1, maxWidth: 260 },
  importStatus: { fontSize: type.caption.fontSize, flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexGrow: 1, flexBasis: 200, minWidth: 0 },
  filters: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center',
  },
  search: { flexGrow: 1, flexBasis: 260, minWidth: 0 },
  filterChips: { flexShrink: 1, minWidth: 0, maxWidth: '100%' },
});
