import React, { useEffect, useMemo, useState } from 'react';
import {
  Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  APPLICATION_STAGES, formatNbDate, jobCriteria, localIsoDate, normalizeApplication,
} from '../../src/hr/model';
import {
  APPLICATION_SOURCES, CLOSED_STAGES, RECOMMENDATIONS, RESPONSE_TEMPLATES,
  addApplicationComment, addReference, assignApplication, criteriaAverages, historyLine,
  interviewIcs, isClosedStage, mailtoHref, markAiReviewed, markResponseSent, moveApplicationStage,
  myScorecard, otherApplications, removeApplicationComment, removeReference, responseTemplate,
  saveScorecard, stageLabel, updateReference,
} from '../../src/hr/recruitment';
import {
  RETENTION_DEFAULTS, addMonths, applicationClosed, applicationDeleteOn, deleteCountdownLabel,
} from '../../src/hr/retention';
import { showSaveToast } from '../../src/ui/saveToast';
import OptionPicker from '../../components/OptionPicker';
import FileDropZone from '../anbud/FileDropZone';
import {
  EmptyHint, HrButton, HrChip, HrField,
} from './HrShared';
import { radius, type } from '../../src/ui/tokens';
import { BREAKPOINTS } from '../../src/ui/layout';

/** Samtykke fra søkeren: søknaden beholdes så lenge, regnet fra i dag. */
const CONSENT_MONTHS = 12;

const TABS = [
  { id: 'overview', label: 'Oversikt' },
  { id: 'score', label: 'Vurdering' },
  { id: 'interview', label: 'Intervju og tilbud' },
  { id: 'references', label: 'Referanser' },
  { id: 'notes', label: 'Interne notater' },
  { id: 'reply', label: 'Svar til søker' },
  { id: 'history', label: 'Historikk' },
];

const DRAFT_KEYS = [
  'name', 'email', 'phone', 'location', 'source', 'jobId', 'evaluation', 'rejectReason',
  'interviewDate', 'interviewTime', 'interviewPlace', 'interviewers',
  'offerSalary', 'offerStart', 'offerDeadline', 'response', 'interviewNotes',
];

const EMPTY_REF = {
  name: '', relation: '', phone: '', email: '', notes: '', givenByApplicant: true,
};

/** Anonym vurdering gjelder til søkeren er kalt inn til intervju. */
const ANON_STAGES = ['new', 'screening'];

/** Laster ned en tekstfil i nettleseren. */
function downloadText(filename, content, mime) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

function draftOf(app) {
  return Object.fromEntries(DRAFT_KEYS.map((key) => [key, app?.[key] ?? (key === 'interviewNotes' ? {} : '')]));
}

function same(a, b) {
  return typeof a === 'object' || typeof b === 'object'
    ? JSON.stringify(a || {}) === JSON.stringify(b || {})
    : String(a ?? '') === String(b ?? '');
}

function when(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatNbDate(localIsoDate(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Section({ colors, title, right, children }) {
  return (
    <View style={[styles.section, { borderColor: colors.line }]}>
      {title || right ? (
        <View style={styles.sectionHead}>
          {title ? <Text style={[styles.sectionTitle, { color: colors.ink }]}>{title}</Text> : <View />}
          {right || null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

function Tag({ colors, label, tone }) {
  const c = tone || colors.muted;
  return (
    <View style={[styles.tag, { borderColor: `${c}55`, backgroundColor: `${c}12` }]}>
      <Text style={[styles.tagText, { color: c }]}>{label}</Text>
    </View>
  );
}

function Lines({ colors, items, icon }) {
  return (items || []).map((item, index) => (
    <View key={`${index}-${item}`} style={styles.lineRow}>
      <Ionicons name={icon} size={13} color={colors.muted} style={{ marginTop: 2 }} />
      <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{item}</Text>
    </View>
  ));
}

function RatingRow({ colors, label, value, onChange, disabled }) {
  return (
    <View style={styles.ratingRow}>
      <Text style={[styles.body, { color: colors.ink, flex: 1, minWidth: 140 }]}>{label}</Text>
      <View style={styles.ratingBtns}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <Pressable
              key={n}
              disabled={disabled}
              onPress={() => onChange(on ? 0 : n)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label}: ${n} av 5`}
              style={[
                styles.ratingBtn,
                { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : colors.bg },
              ]}
            >
              <Text style={[styles.ratingText, { color: on ? colors.onBrand : colors.ink }]}>{n}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Søkerpanelet: alt om én søknad. Steg, ansvarlig og notater lagres med en gang.
 * Tekstfeltene (kontaktinfo, intervju, tilbud, svar) lagres med «Lagre» og når panelet lukkes.
 */
export default function RecruitmentApplicant({
  colors, app, job, jobs, apps = [], canWrite, actor, ownerOptions, company, retention = RETENTION_DEFAULTS,
  hiring, attaching, onClose, onUpdate, onHire, onDelete, onAttachFiles, onPickFiles, onCopyToJob,
  onOpenOther, anonymous = false, initialClose = false,
}) {
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.tablet;
  const [tab, setTab] = useState('overview');
  // Bare feltene brukeren har endret. Resten følger søknaden, også når AI fyller inn mens panelet er åpent.
  const [edits, setEdits] = useState({});
  const draft = useMemo(() => ({ ...draftOf(app), ...edits }), [app, edits]);
  const [note, setNote] = useState('');
  const [closing, setClosing] = useState(initialClose ? 'pick' : '');
  const [replyKind, setReplyKind] = useState('');
  const [subject, setSubject] = useState('');
  const [refDraft, setRefDraft] = useState(EMPTY_REF);
  const [copyJobId, setCopyJobId] = useState('');
  const [reveal, setReveal] = useState(false);
  const mine = myScorecard(app, actor);
  const [card, setCard] = useState(() => ({
    ratings: mine?.ratings || {}, comment: mine?.comment || '', recommendation: mine?.recommendation || '',
  }));

  useEffect(() => {
    setEdits({});
    setTab('overview');
    setNote('');
    setClosing(initialClose ? 'pick' : '');
    setReplyKind('');
    setSubject('');
    setRefDraft(EMPTY_REF);
    setCopyJobId('');
    setReveal(false);
    const own = myScorecard(app, actor);
    setCard({ ratings: own?.ratings || {}, comment: own?.comment || '', recommendation: own?.recommendation || '' });
    // Bare når en annen søknad åpnes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, initialClose]);

  const dirty = useMemo(
    () => Object.keys(edits).some((key) => !same(edits[key], app?.[key])),
    [edits, app],
  );
  const criteria = useMemo(() => jobCriteria(job), [job]);
  const averages = useMemo(() => criteriaAverages(app?.scorecards, criteria), [app?.scorecards, criteria]);
  const others = useMemo(() => (app ? otherApplications(app, apps) : []), [app, apps]);
  const jobOptions = useMemo(() => [
    { id: '', label: 'Åpen søknad (ingen stilling)' },
    ...(jobs || []).map((row) => ({ id: row.id, label: row.title })),
  ], [jobs]);

  if (!app) return null;
  const closed = isClosedStage(app.stage);
  const hidden = anonymous && ANON_STAGES.includes(app.stage) && !reveal;
  const shownName = hidden ? `Søker ${String(app.id).slice(-4).toUpperCase()}` : app.name;
  const set = (key) => (value) => setEdits((prev) => ({ ...prev, [key]: value }));

  /** Lagrer utkastet sammen med handlingen, så ingenting skrevet går tapt. */
  function commit(mapper) {
    if (!canWrite) return;
    const snap = { ...edits };
    onUpdate(app.id, (row) => {
      const merged = normalizeApplication({ ...row, ...snap, updatedAt: new Date().toISOString() });
      return mapper ? mapper(merged) : merged;
    });
    setEdits({});
  }

  function close() {
    if (dirty && canWrite) commit();
    onClose();
  }

  function moveTo(stage) {
    if (!canWrite) return;
    if (stage === 'hired') {
      onHire({ ...app, ...draft });
      setClosing('');
      return;
    }
    const check = moveApplicationStage({ ...app, ...draft }, stage, { actor, reason: draft.rejectReason });
    if (!check.ok) {
      if (check.needsReason) setClosing(stage);
      showSaveToast?.(check.error);
      return;
    }
    commit((row) => moveApplicationStage(row, stage, { actor, reason: draft.rejectReason }).app);
    setClosing('');
    showSaveToast?.(`Flyttet til ${stageLabel(stage)}`);
  }

  function pickTemplate(kind) {
    const tpl = responseTemplate(kind, {
      app: { ...app, ...draft }, job, company: company?.name || '', sender: actor?.name || '',
    });
    setReplyKind(kind);
    setSubject(tpl.subject);
    setEdits((prev) => ({ ...prev, response: tpl.body }));
  }

  const activeStages = APPLICATION_STAGES.filter((row) => !row.closed);
  const ownerLabel = app.ownerName || 'Ingen ansvarlig';

  const header = (
    <View style={[styles.head, { borderBottomColor: colors.line }]}>
      <View style={styles.headTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1} accessibilityRole="header">{shownName}</Text>
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={2}>
            {[job?.title || 'Åpen søknad', `Søkt ${formatNbDate(app.appliedAt)}`, ownerLabel].join(' · ')}
          </Text>
        </View>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Lukk" nativeID="hr-app-close">
          <Ionicons name="close" size={22} color={colors.muted} />
        </Pressable>
      </View>
      <View style={styles.stepper} nativeID="hr-app-stages">
        {activeStages.map((stage, index) => {
          const current = app.stage === stage.id;
          const passed = !closed && activeStages.findIndex((row) => row.id === app.stage) > index;
          return (
            <Pressable
              key={stage.id}
              disabled={!canWrite || current}
              onPress={() => moveTo(stage.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: current }}
              style={[
                styles.step,
                {
                  borderColor: current ? colors.brand : colors.line,
                  backgroundColor: current ? colors.brand : passed ? `${colors.brand}14` : colors.bg,
                },
              ]}
            >
              {passed ? <Ionicons name="checkmark" size={12} color={colors.brand} /> : null}
              <Text style={[styles.stepText, { color: current ? colors.onBrand : colors.ink }]} numberOfLines={1}>{stage.label}</Text>
            </Pressable>
          );
        })}
        {closed ? <Tag colors={colors} label={stageLabel(app.stage)} tone={app.stage === 'hired' ? colors.successInk : colors.dangerInk} /> : null}
      </View>
      {canWrite && !closed ? (
        <View style={styles.actions}>
          <HrButton
            colors={colors}
            label={hiring ? 'Ansetter…' : 'Ansett'}
            primary
            icon="person-add-outline"
            disabled={hiring}
            onPress={() => moveTo('hired')}
            nativeID="hr-app-hire"
          />
          <HrButton colors={colors} label="Avslå" danger icon="close-circle-outline" onPress={() => setClosing('rejected')} nativeID="hr-app-reject" />
          <HrButton colors={colors} label="Trukket" icon="exit-outline" onPress={() => setClosing('withdrawn')} />
          {app.stage === 'offer' ? (
            <HrButton colors={colors} label="Takket nei" icon="hand-left-outline" onPress={() => setClosing('declined')} />
          ) : null}
        </View>
      ) : null}
      {canWrite && closed && app.stage !== 'hired' ? (
        <View style={styles.actions}>
          <HrButton colors={colors} label="Gjenåpne søknaden" icon="refresh-outline" onPress={() => moveTo('screening')} />
        </View>
      ) : null}
      {closing ? (
        <View style={[styles.closeBox, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="hr-app-closebox">
          {closing === 'pick' ? (
            <>
              <Text style={[styles.body, { color: colors.ink }]}>Hvordan ble søknaden avsluttet?</Text>
              <View style={styles.actions}>
                {CLOSED_STAGES.map((stage) => (
                  <HrChip key={stage.id} colors={colors} label={stage.label} active={false} onPress={() => (stage.id === 'hired' ? moveTo('hired') : setClosing(stage.id))} />
                ))}
                <HrChip colors={colors} label="Avbryt" active={false} onPress={() => setClosing('')} />
              </View>
            </>
          ) : (
            <>
              <HrField
                colors={colors}
                label={`Begrunnelse (${stageLabel(closing).toLowerCase()})`}
                value={draft.rejectReason}
                onChangeText={set('rejectReason')}
                multiline
                autoFocus
                placeholder={closing === 'rejected' ? 'Krav ikke møtt, annen kandidat valgt, …' : 'Hva søkeren oppga, …'}
              />
              <Text style={[styles.meta, { color: colors.muted }]}>
                Begrunnelsen er intern og lagres i historikken. Svar til søkeren sender du under «Svar til søker».
              </Text>
              <View style={styles.actions}>
                <HrButton
                  colors={colors}
                  label={`Bekreft: ${stageLabel(closing)}`}
                  danger={closing === 'rejected'}
                  primary={closing !== 'rejected'}
                  disabled={!String(draft.rejectReason || '').trim()}
                  onPress={() => moveTo(closing)}
                  nativeID="hr-app-close-confirm"
                />
                <HrButton colors={colors} label="Avbryt" onPress={() => setClosing('')} />
              </View>
            </>
          )}
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((row) => {
          const count = row.id === 'notes' ? app.comments.length + (app.notes ? 1 : 0)
            : row.id === 'score' ? app.scorecards.length
              : row.id === 'references' ? app.references.length : 0;
          return (
            <Pressable
              key={row.id}
              onPress={() => setTab(row.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === row.id }}
              style={[styles.tab, { borderBottomColor: tab === row.id ? colors.brand : 'transparent' }]}
              nativeID={`hr-app-tab-${row.id}`}
            >
              <Text style={[styles.tabText, { color: tab === row.id ? colors.brand : colors.muted }]}>
                {count ? `${row.label} (${count})` : row.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const overview = (
    <>
      <Section colors={colors} title="Søker">
        {hidden ? (
          <View style={[styles.anonBox, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="hr-app-anon">
            <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>
              Anonym vurdering: navn og kontaktinfo er skjult til søkeren går videre til intervju. Vurder kompetanse og erfaring.
            </Text>
            <HrButton colors={colors} label="Vis likevel" icon="eye-outline" onPress={() => setReveal(true)} />
          </View>
        ) : (
        <>
        <View style={styles.grid}>
          <View style={styles.cell}><HrField colors={colors} label="Navn" value={draft.name} onChangeText={set('name')} /></View>
          <View style={styles.cell}><HrField colors={colors} label="Bosted" value={draft.location} onChangeText={set('location')} /></View>
          <View style={styles.cell}><HrField colors={colors} label="E-post" value={draft.email} onChangeText={set('email')} keyboardType="email-address" /></View>
          <View style={styles.cell}><HrField colors={colors} label="Telefon" value={draft.phone} onChangeText={set('phone')} keyboardType="phone-pad" /></View>
        </View>
        <View style={styles.actions}>
          {app.email ? (
            <HrChip colors={colors} label={`E-post: ${app.email}`} active={false} onPress={() => Linking.openURL(`mailto:${app.email}`).catch(() => {})} />
          ) : null}
          {app.phone ? (
            <HrChip colors={colors} label={`Ring ${app.phone}`} active={false} onPress={() => Linking.openURL(`tel:${app.phone.replace(/\s/g, '')}`).catch(() => {})} />
          ) : null}
        </View>
        </>
        )}
        <Text style={[styles.label, { color: colors.muted }]}>Kilde</Text>
        <View style={styles.actions}>
          {APPLICATION_SOURCES.map((source) => (
            <HrChip key={source} colors={colors} label={source} active={draft.source === source} onPress={() => set('source')(draft.source === source ? '' : source)} />
          ))}
        </View>
        <View style={styles.grid}>
          <View style={styles.cell}>
            <Text style={[styles.label, { color: colors.muted }]}>Stilling</Text>
            <OptionPicker
              options={jobOptions}
              value={draft.jobId}
              onChange={(id) => set('jobId')(id || '')}
              clearable={false}
              placeholder="Velg stilling"
              title="Stilling"
              disabled={!canWrite}
            />
          </View>
          <View style={styles.cell}>
            <Text style={[styles.label, { color: colors.muted }]}>Ansvarlig</Text>
            <OptionPicker
              options={ownerOptions}
              value={app.ownerUid}
              onChange={(id) => {
                const hit = ownerOptions.find((row) => row.id === id);
                commit((row) => assignApplication(row, id ? { uid: id, name: hit?.name || hit?.label || '' } : null, { actor }));
              }}
              placeholder="Velg ansvarlig"
              title="Ansvarlig for søkeren"
              disabled={!canWrite}
            />
          </View>
        </View>
      </Section>

      {others.length || (canWrite && (jobs || []).length > 1) ? (
        <Section colors={colors} title="Andre stillinger">
          {others.map((row) => {
            const title = (jobs || []).find((j) => j.id === row.jobId)?.title || 'Åpen søknad';
            return (
              <Pressable key={row.id} onPress={() => onOpenOther?.(row.id)} style={styles.docRow} accessibilityRole="link">
                <Ionicons name="git-branch-outline" size={15} color={colors.brand} />
                <Text style={[styles.body, { color: colors.brand, flex: 1 }]} numberOfLines={1}>
                  {`Har også søkt: ${title} · ${stageLabel(row.stage)}`}
                </Text>
              </Pressable>
            );
          })}
          {canWrite && (jobs || []).length > 1 ? (
            <View style={styles.grid}>
              <View style={styles.cell}>
                <OptionPicker
                  options={(jobs || []).filter((j) => j.id !== app.jobId && j.status !== 'closed').map((j) => ({ id: j.id, label: j.title }))}
                  value={copyJobId}
                  onChange={(id) => setCopyJobId(id || '')}
                  placeholder="Velg stilling"
                  title="Vurder for en annen stilling"
                />
              </View>
              <HrButton
                colors={colors}
                label="Kopier søkeren dit"
                icon="copy-outline"
                disabled={!copyJobId}
                onPress={() => { onCopyToJob?.(app, copyJobId); setCopyJobId(''); }}
                nativeID="hr-app-copy"
              />
            </View>
          ) : null}
          {canWrite && (jobs || []).length > 1 ? (
            <Text style={[styles.meta, { color: colors.muted }]}>
              Talentbank: kopien starter i «Mottatt» på den andre stillingen, med CV og AI-profil. Vurderinger og notater følger ikke med.
            </Text>
          ) : null}
        </Section>
      ) : null}

      {app.ai || app.profile ? (
        <Section
          colors={colors}
          title="Lest med OCR og AI"
          right={app.ai?.match != null ? <Tag colors={colors} label={`Match ${app.ai.match}/10`} tone={colors.accent} /> : null}
        >
          {app.profile?.headline ? <Text style={[styles.bodyStrong, { color: colors.ink }]}>{app.profile.headline}</Text> : null}
          {app.profile?.yearsExperience ? (
            <Text style={[styles.meta, { color: colors.muted }]}>{`${app.profile.yearsExperience} års relevant erfaring`}</Text>
          ) : null}
          {app.profile?.summary ? <Text style={[styles.body, { color: colors.ink }]}>{app.profile.summary}</Text> : null}
          {app.ai?.summary ? (
            <Text style={[styles.body, { color: colors.ink, fontStyle: 'italic' }]}>{app.ai.summary}</Text>
          ) : null}
          {app.ai?.strengths?.length ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>Styrker mot kravene</Text>
              <Lines colors={colors} items={app.ai.strengths} icon="checkmark-circle-outline" />
            </>
          ) : null}
          {app.ai?.gaps?.length ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>Mangler eller uklart</Text>
              <Lines colors={colors} items={app.ai.gaps} icon="alert-circle-outline" />
            </>
          ) : null}
          {app.profile?.skills?.length ? (
            <View style={styles.actions}>
              {app.profile.skills.map((skill) => <Tag key={skill} colors={colors} label={skill} />)}
            </View>
          ) : null}
          {app.profile?.experience?.length ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>Erfaring</Text>
              <Lines colors={colors} items={app.profile.experience} icon="briefcase-outline" />
            </>
          ) : null}
          {app.profile?.education?.length ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>Utdanning</Text>
              <Lines colors={colors} items={app.profile.education} icon="school-outline" />
            </>
          ) : null}
          {[...(app.profile?.certifications || []), ...(app.profile?.languages || [])].length ? (
            <Text style={[styles.meta, { color: colors.muted }]}>
              {[...(app.profile?.certifications || []), ...(app.profile?.languages || [])].join(' · ')}
            </Text>
          ) : null}
          <View style={[styles.anonBox, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="hr-app-ai-review">
            <Text style={[styles.meta, { color: colors.muted, flex: 1 }]}>
              {app.aiReviewedBy
                ? `Kontrollert mot dokumentet av ${app.aiReviewedBy} ${when(app.aiReviewedAt)}. AI-en er et forslag; avgjørelsen tas av mennesker.`
                : 'AI-lesingen er et forslag og kan ta feil. Kontroller mot dokumentet før søkeren vurderes. Avgjørelser tas av mennesker.'}
            </Text>
            {canWrite && !app.aiReviewedBy ? (
              <HrButton
                colors={colors}
                label="Jeg har kontrollert"
                icon="shield-checkmark-outline"
                onPress={() => commit((row) => markAiReviewed(row, { actor }))}
                nativeID="hr-app-ai-reviewed"
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      <Section
        colors={colors}
        title="Dokumenter"
        right={canWrite ? (
          <HrButton
            colors={colors}
            label={attaching ? 'Leser…' : 'Legg til og les'}
            icon="cloud-upload-outline"
            disabled={attaching}
            onPress={() => onPickFiles(app.id)}
            nativeID="hr-app-attach"
          />
        ) : null}
      >
        <FileDropZone
          colors={colors}
          disabled={!canWrite || attaching}
          onFiles={(files) => onAttachFiles(app.id, files)}
          nativeID="hr-app-drop"
          style={[styles.drop, { borderColor: colors.line }]}
        >
          {(app.attachments || []).length ? (app.attachments || []).map((att) => (
            <Pressable
              key={att.id}
              onPress={() => { if (att.url) Linking.openURL(att.url).catch(() => {}); }}
              style={styles.docRow}
              accessibilityRole="link"
            >
              <Ionicons name="document-attach-outline" size={16} color={colors.brand} />
              <Text style={[styles.body, { color: att.url ? colors.brand : colors.ink, flex: 1 }]} numberOfLines={1}>{att.name}</Text>
              {att.url ? <Ionicons name="open-outline" size={14} color={colors.muted} /> : null}
            </Pressable>
          )) : (
            <EmptyHint colors={colors} text="Ingen dokumenter." />
          )}
          {canWrite && Platform.OS === 'web' ? (
            <Text style={[styles.meta, { color: colors.muted }]}>
              Slipp CV, søknadsbrev eller attester her. Filen lagres og leses med OCR og AI.
            </Text>
          ) : null}
        </FileDropZone>
      </Section>

      {applicationClosed(app) ? (
        <Section colors={colors} title="Lagringstid">
          <View nativeID="hr-app-retention" style={{ gap: 8 }}>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {app.consentToKeep
                ? `Søkeren har samtykket til at søknaden beholdes til ${formatNbDate(app.retainUntil)}. ${deleteCountdownLabel(applicationDeleteOn(app, retention))}.`
                : `Avslåtte søknader slettes ${retention.applicantMonths} måneder etter avgjørelsen. ${deleteCountdownLabel(applicationDeleteOn(app, retention))}.`}
            </Text>
            {canWrite ? (
              <HrChip
                colors={colors}
                label={app.consentToKeep ? 'Fjern samtykket' : `Søkeren samtykker: behold i ${CONSENT_MONTHS} mnd`}
                active={!!app.consentToKeep}
                onPress={() => {
                  const keep = !app.consentToKeep;
                  commit((row) => normalizeApplication({
                    ...row,
                    consentToKeep: keep,
                    retainUntil: keep ? addMonths(localIsoDate(), CONSENT_MONTHS) : '',
                  }));
                }}
              />
            ) : null}
          </View>
        </Section>
      ) : null}

      {canWrite ? (
        <View style={styles.actions}>
          <HrButton colors={colors} label="Slett søknaden" icon="trash-outline" onPress={() => onDelete(app)} />
        </View>
      ) : null}
    </>
  );

  const scoreTab = (
    <>
      <Section
        colors={colors}
        title="Ditt scorekort"
        right={app.scorecards.length ? <Tag colors={colors} label={`Snitt ${app.score}/10 · ${app.scorecards.length} vurderer${app.scorecards.length > 1 ? 'e' : ''}`} tone={colors.brand} /> : null}
      >
        <Text style={[styles.meta, { color: colors.muted }]}>
          Gi 1–5 per kriterium. Hver vurderer har sitt eget scorekort, og scoren er snittet av alle.
        </Text>
        {criteria.map((criterion) => (
          <RatingRow
            key={criterion.id}
            colors={colors}
            label={criterion.label}
            value={card.ratings[criterion.id] || 0}
            disabled={!canWrite}
            onChange={(n) => setCard((prev) => {
              const ratings = { ...prev.ratings };
              if (n) ratings[criterion.id] = n; else delete ratings[criterion.id];
              return { ...prev, ratings };
            })}
          />
        ))}
        <Text style={[styles.label, { color: colors.muted }]}>Anbefaling</Text>
        <View style={styles.actions}>
          {RECOMMENDATIONS.map((row) => (
            <HrChip
              key={row.id}
              colors={colors}
              label={row.label}
              active={card.recommendation === row.id}
              onPress={() => setCard((prev) => ({ ...prev, recommendation: prev.recommendation === row.id ? '' : row.id }))}
            />
          ))}
        </View>
        <HrField
          colors={colors}
          label="Kommentar"
          value={card.comment}
          onChangeText={(comment) => setCard((prev) => ({ ...prev, comment }))}
          multiline
          placeholder="Hva vektla du?"
        />
        {canWrite ? (
          <View style={styles.actions}>
            <HrButton
              colors={colors}
              label={mine ? 'Oppdater scorekort' : 'Lagre scorekort'}
              primary
              icon="star-outline"
              onPress={() => {
                commit((row) => saveScorecard(row, card, { actor }));
                showSaveToast?.('Scorekort lagret');
              }}
              nativeID="hr-app-score-save"
            />
          </View>
        ) : null}
      </Section>

      {app.scorecards.length ? (
        <Section colors={colors} title="Alle vurderinger">
          {averages.filter((row) => row.avg != null).map((row) => (
            <View key={row.id} style={styles.barRow}>
              <Text style={[styles.meta, { color: colors.ink, width: 170 }]} numberOfLines={1}>{row.label}</Text>
              <View style={[styles.barTrack, { backgroundColor: colors.line }]}>
                <View style={[styles.barFill, { width: `${(row.avg / 5) * 100}%`, backgroundColor: colors.brand }]} />
              </View>
              <Text style={[styles.meta, { color: colors.muted, width: 32, textAlign: 'right' }]}>{row.avg}</Text>
            </View>
          ))}
          {app.scorecards.map((row) => {
            const values = criteria.map((c) => row.ratings?.[c.id]).filter((n) => n >= 1 && n <= 5);
            const avg = values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : null;
            const rec = RECOMMENDATIONS.find((r) => r.id === row.recommendation);
            return (
              <View key={`${row.byUid}-${row.byName}`} style={[styles.scoreRow, { borderTopColor: colors.line }]}>
                <View style={styles.sectionHead}>
                  <Text style={[styles.bodyStrong, { color: colors.ink }]}>{row.byName}</Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {[avg != null ? `${avg}/5` : '', rec?.label || '', when(row.at)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                {row.comment ? <Text style={[styles.body, { color: colors.ink }]}>{row.comment}</Text> : null}
              </View>
            );
          })}
        </Section>
      ) : null}

      <Section colors={colors} title="Samlet vurdering">
        <HrField
          colors={colors}
          label="Oppsummering for beslutning"
          value={draft.evaluation}
          onChangeText={set('evaluation')}
          multiline
          placeholder="Hvorfor går vi videre (eller ikke)?"
        />
      </Section>
    </>
  );

  const interviewTab = (
    <>
      <Section colors={colors} title="Intervju">
        <View style={styles.grid}>
          <View style={styles.cell}><HrField colors={colors} label="Dato" value={draft.interviewDate} onChangeText={set('interviewDate')} date="iso" clearable /></View>
          <View style={styles.cell}><HrField colors={colors} label="Klokkeslett" value={draft.interviewTime} onChangeText={set('interviewTime')} placeholder="10:00" /></View>
          <View style={styles.cell}><HrField colors={colors} label="Sted eller lenke" value={draft.interviewPlace} onChangeText={set('interviewPlace')} /></View>
          <View style={styles.cell}><HrField colors={colors} label="Intervjuere" value={draft.interviewers} onChangeText={set('interviewers')} placeholder="Navn" /></View>
        </View>
        {canWrite ? (
          <View style={styles.actions}>
            {app.stage !== 'interview' && !closed ? (
              <HrButton colors={colors} label="Flytt til Intervju" icon="arrow-forward" onPress={() => moveTo('interview')} />
            ) : null}
            <HrButton colors={colors} label="Lag innkalling" icon="mail-outline" onPress={() => { pickTemplate('interview'); setTab('reply'); }} />
            {Platform.OS === 'web' ? (
              <HrButton
                colors={colors}
                label="Legg i kalender (.ics)"
                icon="calendar-outline"
                disabled={!draft.interviewDate}
                onPress={() => {
                  const ics = interviewIcs({ ...app, ...draft }, { job, company: company?.name || '' });
                  if (ics) downloadText(`intervju-${String(app.name).replace(/[^\p{L}\d]+/gu, '-').toLowerCase()}.ics`, ics, 'text/calendar');
                }}
                nativeID="hr-app-ics"
              />
            ) : null}
          </View>
        ) : null}
      </Section>
      <Section colors={colors} title="Intervjuspørsmål">
        {(job?.questions || []).length ? (
          <>
            <Text style={[styles.meta, { color: colors.muted }]}>
              Samme spørsmål til alle søkerne. Skriv svar og inntrykk per spørsmål.
            </Text>
            {job.questions.map((q, index) => (
              <HrField
                key={q.id}
                colors={colors}
                label={`${index + 1}. ${q.label}`}
                value={draft.interviewNotes?.[q.id] || ''}
                onChangeText={(value) => setEdits((prev) => ({
                  ...prev,
                  interviewNotes: { ...(prev.interviewNotes || app.interviewNotes || {}), [q.id]: value },
                }))}
                multiline
              />
            ))}
          </>
        ) : (
          <EmptyHint colors={colors} text="Stillingen har ingen intervjuspørsmål. Legg dem inn under «Endre» på stillingen for et strukturert intervju." />
        )}
      </Section>
      <Section colors={colors} title="Tilbud">
        <View style={styles.grid}>
          <View style={styles.cell}><HrField colors={colors} label="Lønn" value={draft.offerSalary} onChangeText={set('offerSalary')} placeholder="kr 650 000 per år" /></View>
          <View style={styles.cell}><HrField colors={colors} label="Oppstart" value={draft.offerStart} onChangeText={set('offerStart')} date="iso" clearable /></View>
          <View style={styles.cell}><HrField colors={colors} label="Svarfrist" value={draft.offerDeadline} onChangeText={set('offerDeadline')} date="iso" clearable /></View>
          <View style={styles.cell}>
            <Text style={[styles.label, { color: colors.muted }]}>Tilbud sendt</Text>
            <Text style={[styles.body, { color: colors.ink }]}>{app.offerSentAt ? formatNbDate(app.offerSentAt) : 'Ikke sendt'}</Text>
          </View>
        </View>
        {canWrite ? (
          <View style={styles.actions}>
            {app.stage !== 'offer' && !closed ? (
              <HrButton colors={colors} label="Flytt til Tilbud sendt" icon="arrow-forward" onPress={() => moveTo('offer')} />
            ) : null}
            <HrButton colors={colors} label="Lag tilbudsbrev" icon="mail-outline" onPress={() => { pickTemplate('offer'); setTab('reply'); }} />
          </View>
        ) : null}
      </Section>
    </>
  );

  const referencesTab = (
    <Section colors={colors} title="Referanser">
      <Text style={[styles.meta, { color: colors.muted }]}>
        Ta bare kontakt med referanser søkeren selv har oppgitt, og fortell søkeren at du gjør det. Noter bare det som er relevant for stillingen.
      </Text>
      {app.references.map((ref) => (
        <View key={ref.id} style={[styles.scoreRow, { borderTopColor: colors.line }]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.bodyStrong, { color: colors.ink, flex: 1 }]}>
              {[ref.name, ref.relation].filter(Boolean).join(' · ')}
            </Text>
            {canWrite ? (
              <Pressable onPress={() => commit((row) => removeReference(row, ref.id))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Slett referansen">
                <Ionicons name="trash-outline" size={14} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {[ref.phone, ref.email, ref.givenByApplicant ? 'Oppgitt av søkeren' : 'Ikke oppgitt av søkeren', ref.byName ? `Registrert av ${ref.byName}` : ''].filter(Boolean).join(' · ')}
          </Text>
          {ref.notes ? <Text style={[styles.body, { color: colors.ink }]}>{ref.notes}</Text> : null}
          {canWrite ? (
            <View style={styles.actions}>
              <HrChip
                colors={colors}
                label={ref.contactedAt ? `Kontaktet ${formatNbDate(ref.contactedAt)}` : 'Merk som kontaktet i dag'}
                active={!!ref.contactedAt}
                onPress={() => commit((row) => updateReference(row, ref.id, { contactedAt: ref.contactedAt ? '' : localIsoDate() }))}
              />
            </View>
          ) : null}
        </View>
      ))}
      {canWrite ? (
        <View style={[styles.anonBox, styles.refForm, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="hr-app-ref-form">
          <View style={styles.grid}>
            <View style={styles.cell}><HrField colors={colors} label="Navn" value={refDraft.name} onChangeText={(name) => setRefDraft((p) => ({ ...p, name }))} /></View>
            <View style={styles.cell}><HrField colors={colors} label="Rolle / forhold" value={refDraft.relation} onChangeText={(relation) => setRefDraft((p) => ({ ...p, relation }))} placeholder="Nærmeste leder, Bygg AS" /></View>
            <View style={styles.cell}><HrField colors={colors} label="Telefon" value={refDraft.phone} onChangeText={(phone) => setRefDraft((p) => ({ ...p, phone }))} keyboardType="phone-pad" /></View>
            <View style={styles.cell}><HrField colors={colors} label="E-post" value={refDraft.email} onChangeText={(email) => setRefDraft((p) => ({ ...p, email }))} keyboardType="email-address" /></View>
          </View>
          <HrField colors={colors} label="Notat fra samtalen" value={refDraft.notes} onChangeText={(notes) => setRefDraft((p) => ({ ...p, notes }))} multiline />
          <View style={styles.actions}>
            <HrChip
              colors={colors}
              label="Oppgitt av søkeren"
              active={refDraft.givenByApplicant}
              onPress={() => setRefDraft((p) => ({ ...p, givenByApplicant: !p.givenByApplicant }))}
            />
            <HrButton
              colors={colors}
              label="Legg til referanse"
              primary
              icon="person-add-outline"
              disabled={!refDraft.name.trim()}
              onPress={() => {
                commit((row) => addReference(row, refDraft, { actor }));
                setRefDraft(EMPTY_REF);
              }}
              nativeID="hr-app-ref-add"
            />
          </View>
        </View>
      ) : null}
      {!app.references.length && !canWrite ? <EmptyHint colors={colors} text="Ingen referanser." /> : null}
    </Section>
  );

  const notesTab = (
    <Section colors={colors} title="Interne notater">
      <Text style={[styles.meta, { color: colors.muted }]}>Bare for HR og de som vurderer. Søkeren ser ikke notatene.</Text>
      {canWrite ? (
        <>
          <HrField colors={colors} label="Nytt notat" value={note} onChangeText={setNote} multiline placeholder="Inntrykk fra samtale, referanser, oppfølging …" />
          <View style={styles.actions}>
            <HrButton
              colors={colors}
              label="Legg til notat"
              primary
              icon="chatbubble-outline"
              disabled={!note.trim()}
              onPress={() => {
                commit((row) => addApplicationComment(row, note, { actor }));
                setNote('');
              }}
              nativeID="hr-app-note-add"
            />
          </View>
        </>
      ) : null}
      {[...app.comments].reverse().map((row) => (
        <View key={row.id} style={[styles.scoreRow, { borderTopColor: colors.line }]}>
          <View style={styles.sectionHead}>
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>{row.byName || 'Ukjent'}</Text>
            <View style={styles.actions}>
              <Text style={[styles.meta, { color: colors.muted }]}>{when(row.at)}</Text>
              {canWrite && (!row.byUid || row.byUid === actor?.uid) ? (
                <Pressable
                  onPress={() => commit((r) => removeApplicationComment(r, row.id))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Slett notat"
                >
                  <Ionicons name="trash-outline" size={14} color={colors.muted} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <Text style={[styles.body, { color: colors.ink }]}>{row.text}</Text>
        </View>
      ))}
      {app.notes ? (
        <View style={[styles.scoreRow, { borderTopColor: colors.line }]}>
          <Text style={[styles.bodyStrong, { color: colors.ink }]}>Notat ved registrering</Text>
          <Text style={[styles.body, { color: colors.ink }]}>{app.notes}</Text>
        </View>
      ) : null}
      {!app.comments.length && !app.notes ? <EmptyHint colors={colors} text="Ingen notater ennå." /> : null}
    </Section>
  );

  const replyTab = (
    <Section colors={colors} title="Svar til søker">
      <Text style={[styles.meta, { color: colors.muted }]}>
        {[
          app.acknowledgedAt ? `Bekreftelse sendt ${formatNbDate(app.acknowledgedAt)}` : 'Bekreftelse ikke sendt',
          app.respondedAt ? `Svar sendt ${formatNbDate(app.respondedAt)}` : (closed && app.stage !== 'hired' ? 'Endelig svar ikke sendt' : ''),
        ].filter(Boolean).join(' · ')}
      </Text>
      <View style={styles.actions}>
        {RESPONSE_TEMPLATES.map((row) => (
          <HrChip key={row.id} colors={colors} label={row.label} active={replyKind === row.id} onPress={() => pickTemplate(row.id)} />
        ))}
      </View>
      {replyKind ? <HrField colors={colors} label="Emne" value={subject} onChangeText={setSubject} /> : null}
      <HrField colors={colors} label="Tekst" value={draft.response} onChangeText={set('response')} multiline placeholder="Velg en mal over, eller skriv selv." />
      {canWrite ? (
        <View style={styles.actions}>
          <HrButton
            colors={colors}
            label="Åpne i e-post"
            primary
            icon="send-outline"
            disabled={!app.email && !draft.email}
            onPress={() => {
              Linking.openURL(mailtoHref(draft.email || app.email, subject, draft.response)).catch(() => {
                showSaveToast?.('Fant ingen e-postklient');
              });
            }}
          />
          <HrButton
            colors={colors}
            label="Merk som sendt"
            icon="checkmark-done-outline"
            disabled={!replyKind}
            onPress={() => {
              commit((row) => markResponseSent(row, replyKind, { actor, body: draft.response }));
              showSaveToast?.('Registrert som sendt');
            }}
            nativeID="hr-app-reply-sent"
          />
        </View>
      ) : null}
      {!app.email && !draft.email ? (
        <Text style={[styles.meta, { color: colors.warnInk }]}>Søkeren mangler e-post.</Text>
      ) : null}
    </Section>
  );

  const historyTab = (
    <Section colors={colors} title="Historikk">
      {[...app.history].reverse().map((row) => (
        <View key={row.id} style={styles.histRow}>
          <View style={[styles.dot, { backgroundColor: colors.brand }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.body, { color: colors.ink }]}>{historyLine(row)}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>{when(row.at)}</Text>
          </View>
        </View>
      ))}
      {!app.history.length ? <EmptyHint colors={colors} text="Ingen historikk ennå (eldre søknad)." /> : null}
    </Section>
  );

  const content = {
    overview, score: scoreTab, interview: interviewTab, references: referencesTab, notes: notesTab, reply: replyTab, history: historyTab,
  }[tab];

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <View style={[styles.backdrop, wide && styles.backdropWide]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel="Lukk" />
        <View
          style={[styles.panel, wide ? styles.panelWide : styles.panelNarrow, { backgroundColor: colors.card, borderColor: colors.line }]}
          accessibilityRole="dialog"
          accessibilityLabel={`Søknad fra ${shownName}`}
          nativeID="hr-app-panel"
        >
          {header}
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
          {canWrite && dirty ? (
            <View style={[styles.foot, { borderTopColor: colors.line }]}>
              <Text style={[styles.meta, { color: colors.muted, flex: 1 }]}>Endringer lagres også når du lukker.</Text>
              <HrButton colors={colors} label="Angre" onPress={() => setEdits({})} />
              <HrButton colors={colors} label="Lagre" primary icon="save-outline" onPress={() => commit()} nativeID="hr-app-save" />
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const shadow = Platform.OS === 'web' ? { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)' } : { elevation: 8 };

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'flex-end', alignItems: 'stretch',
  },
  backdropWide: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'stretch' },
  panel: { borderWidth: 1, overflow: 'hidden', ...shadow },
  panelWide: { width: 760, maxWidth: '100%', height: '100%', borderTopLeftRadius: radius.sheet, borderBottomLeftRadius: radius.sheet },
  panelNarrow: { width: '100%', maxHeight: '94%', height: '94%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet },
  head: {
    paddingHorizontal: 16, paddingTop: 14, gap: 10, borderBottomWidth: 1,
  },
  headTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: type.title.fontSize, fontWeight: '700' },
  meta: { fontSize: type.caption.fontSize, lineHeight: 17 },
  stepper: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  step: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5,
  },
  stepText: { fontSize: type.caption.fontSize, fontWeight: '600' },
  actions: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center',
  },
  closeBox: { borderWidth: 1, borderRadius: radius.card, padding: 10, gap: 8 },
  tabs: { gap: 14, paddingTop: 2 },
  tab: { paddingVertical: 8, borderBottomWidth: 2 },
  tabText: { fontSize: type.label.fontSize, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 8 },
  sectionHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
  },
  sectionTitle: { fontSize: type.body.fontSize, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: { flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 4 },
  label: { fontSize: type.caption.fontSize, fontWeight: '600', marginTop: 4 },
  body: { fontSize: type.label.fontSize, lineHeight: 19 },
  bodyStrong: { fontSize: type.label.fontSize, lineHeight: 19, fontWeight: '700' },
  tag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontSize: type.caption.fontSize, fontWeight: '700' },
  lineRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  drop: {
    borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, padding: 10, gap: 6,
  },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  ratingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap',
  },
  ratingBtns: { flexDirection: 'row', gap: 6 },
  ratingBtn: {
    width: 34, height: 30, borderWidth: 1, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center',
  },
  ratingText: { fontSize: type.label.fontSize, fontWeight: '700' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barTrack: {
    flex: 1, height: 8, borderRadius: radius.pill, overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: radius.pill },
  scoreRow: { borderTopWidth: 1, paddingTop: 8, gap: 4 },
  histRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dot: {
    width: 8, height: 8, borderRadius: radius.pill, marginTop: 6,
  },
  anonBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: radius.card, padding: 10, flexWrap: 'wrap',
  },
  refForm: { flexDirection: 'column', alignItems: 'stretch' },
  foot: {
    flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: 1, flexWrap: 'wrap',
  },
});
