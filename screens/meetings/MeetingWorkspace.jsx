/**
 * Ett møte: topptekst med status og neste steg, faner for dagsorden, deltakere,
 * referat og historikk. Endringer lagres automatisk og slås sammen med det
 * andre har lagret i mellomtiden.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { showSaveToast } from '../../src/ui/saveToast';
import DialogShell from '../economy/invoice/DialogShell';
import ConfirmDialog from '../../components/ConfirmDialog';
import { downloadFile, openFileUrl } from '../../src/economy/invoiceDelivery';
import {
  LIFECYCLE_STEPS,
  agendaStats,
  canManageMeeting,
  flatItems,
  invitees,
  isClosed,
  isLocked,
  lifecycleIndex,
  longDate,
  meetingPhase,
  normalizeMeeting,
  timeRange,
} from '../../src/meetings/model';
import { canDeleteMeeting, finalizeChecks, primaryAction } from '../../src/meetings/flow';
import { cancelText } from '../../src/meetings/mailText';
import { icsFileName } from '../../src/meetings/ics';
import { minutesFileName } from '../../src/meetings/minutesDoc';
import { meetingType, templateFromMeeting } from '../../src/meetings/templates';
import AgendaPanel from './AgendaPanel';
import ParticipantsPanel from './ParticipantsPanel';
import MinutesPanel from './MinutesPanel';
import HistoryPanel from './HistoryPanel';
import SendDialog from './SendDialog';
import * as actions from './meetingActions';
import {
  AvatarStack, Banner, Btn, Check, Field, Menu, NumberChip, PhasePill, TypeIcon, UnderTabs,
} from './meetingUi';

const CALENDAR_FIELDS = ['title', 'date', 'start', 'end', 'location', 'number'];

function Stepper({ meeting, wide }) {
  const colors = useColors();
  const current = lifecycleIndex(meeting);
  const invited = meeting.deliveries.some((d) => d.kind === 'innkalling');
  return (
    <View style={[styles.stepper, { borderColor: colors.line, backgroundColor: colors.card }]} accessibilityLabel="Fremdrift for møtet">
      {LIFECYCLE_STEPS.map((step, i) => {
        const skipped = step.id === 'innkalt' && current > 1 && !invited;
        const done = i < current && !skipped;
        const active = i === current;
        const color = done ? '#16a34a' : (active ? colors.brand : colors.line);
        return (
          <React.Fragment key={step.id}>
            {i > 0 ? <View style={[styles.stepLine, { backgroundColor: i <= current ? '#16a34a' : colors.line }]} /> : null}
            <View style={styles.step}>
              <View style={[styles.stepDot, { borderColor: color, backgroundColor: done ? '#16a34a' : (active ? colors.brand : colors.card) }]}>
                {done ? <Ionicons name="checkmark" size={13} color="#fff" /> : <Text style={{ fontSize: 11, fontWeight: '800', color: active ? '#fff' : colors.muted }}>{skipped ? '–' : i + 1}</Text>}
              </View>
              {wide || active ? (
                <Text style={{ fontSize: 12.5, fontWeight: active ? '800' : '500', color: active ? colors.ink : (done ? colors.ink : colors.muted) }} numberOfLines={1}>{skipped ? 'Ikke innkalt' : step.label}</Text>
              ) : null}
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function SaveState({ state }) {
  const colors = useColors();
  const map = {
    saved: ['cloud-done-outline', 'Lagret', colors.muted],
    dirty: ['ellipsis-horizontal', 'Endringer …', colors.muted],
    saving: ['sync-outline', 'Lagrer …', colors.brand],
    error: ['cloud-offline-outline', 'Ikke lagret', '#dc2626'],
  };
  const [icon, label, color] = map[state] || map.saved;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} accessibilityLiveRegion="polite" nativeID="save-state">
      <Ionicons name={icon} size={15} color={color} />
      <Text style={{ fontSize: 12.5, color }}>{label}</Text>
    </View>
  );
}

export default function MeetingWorkspace({
  meeting, meetings, ctxRef, viewer, isAdmin, people, projects, company, logo, today, width, initialTab,
  onBack, onOpen, onCreateNext, onSaveTemplate,
}) {
  const colors = useColors();
  const [draft, setDraft] = useState(meeting);
  const draftRef = useRef(meeting);
  const savedRef = useRef(meeting);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const [saveState, setSaveState] = useState('saved');
  const [tab, setTab] = useState(initialTab === 'live' ? 'agenda' : (initialTab || (isClosed(meeting) ? 'referat' : 'agenda')));
  const [busy, setBusy] = useState('');
  const [dialog, setDialog] = useState('');
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(true);
  const [templateName, setTemplateName] = useState('');
  const wide = width >= 900;
  const store = ctxRef.current.store;
  const demo = !!store?.demo;

  const canManage = canManageMeeting(draft, { ...viewer, admin: isAdmin });
  const locked = isLocked(draft);
  const readOnly = !canManage || locked;
  const live = draft.status === 'pagar' && !draft.endedAt;
  const phase = meetingPhase(draft, today);
  const primary = canManage ? primaryAction(draft) : null;
  const type = meetingType(draft.typeId);
  const stats = agendaStats(draft);
  const participants = draft.participants;

  // Andre har lagret: ta inn endringene når vi ikke har ulagrede egne.
  useEffect(() => {
    if (dirtyRef.current) return;
    if (meeting.updatedAt && meeting.updatedAt === savedRef.current.updatedAt) return;
    savedRef.current = meeting;
    draftRef.current = meeting;
    setDraft(meeting);
  }, [meeting]);

  const saveNow = useCallback(async () => {
    clearTimeout(timerRef.current);
    if (!dirtyRef.current) return savedRef.current;
    const snapshot = draftRef.current;
    const before = savedRef.current;
    setSaveState('saving');
    try {
      const saved = await store.saveMeeting(normalizeMeeting(snapshot), savedRef.current);
      savedRef.current = saved;
      // Flyttet møte eller nye deltakere: oppdater kalenderen i ProTop.
      const uids = (m) => m.participants.map((p) => p.uid).join(',');
      if (saved.calendar && (CALENDAR_FIELDS.some((key) => saved[key] !== before[key]) || uids(saved) !== uids(before))) {
        store.syncCalendar(saved).catch(() => {});
      }
      ctxRef.current.base = saved;
      if (draftRef.current === snapshot) {
        dirtyRef.current = false;
        setSaveState('saved');
      } else {
        timerRef.current = setTimeout(() => { saveNow(); }, 700);
      }
      return saved;
    } catch (cause) {
      setSaveState('error');
      setError(String(cause?.message || 'Endringene ble ikke lagret.'));
      throw cause;
    }
  }, [store, ctxRef]);

  useEffect(() => () => {
    clearTimeout(timerRef.current);
    if (dirtyRef.current) store.saveMeeting(normalizeMeeting(draftRef.current), savedRef.current).catch(() => {});
  }, [store]);

  const change = useCallback((next) => {
    draftRef.current = next;
    setDraft(next);
    dirtyRef.current = true;
    setSaveState('dirty');
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { saveNow().catch(() => {}); }, 900);
  }, [saveNow]);

  async function run(key, fn, { after } = {}) {
    setBusy(key);
    setError('');
    try {
      await saveNow();
      ctxRef.current.base = savedRef.current;
      const result = await fn(ctxRef.current, normalizeMeeting(draftRef.current));
      if (result?.meeting) {
        savedRef.current = result.meeting;
        draftRef.current = result.meeting;
        dirtyRef.current = false;
        setDraft(result.meeting);
        setSaveState('saved');
      }
      if (result?.message) showSaveToast(result.message);
      setDialog('');
      after?.(result);
      return result;
    } catch (cause) {
      setError(String(cause?.message || 'Noe gikk galt.'));
      return null;
    } finally {
      setBusy('');
    }
  }

  // Fra «Start møtet» i listen: start med en gang.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (initialTab !== 'live' || autoStarted.current || !canManage) return;
    autoStarted.current = true;
    if (['utkast', 'innkalt'].includes(draft.status)) run('start', actions.start);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function download(kind, file) {
    if (kind === 'archive') {
      openFileUrl(file.url);
      return;
    }
    if (Platform.OS !== 'web') {
      setError('PDF og kalenderfil lastes ned i nettleseren.');
      return;
    }
    if (kind === 'ics') {
      const bytes = actions.icsBytes(ctxRef.current, draft);
      if (!bytes) { setError('Møtet trenger en dato før det kan legges i kalenderen.'); return; }
      downloadFile(bytes, icsFileName(draft), 'text/calendar');
      return;
    }
    downloadFile(actions.pdfFor(ctxRef.current, normalizeMeeting(draft), kind), minutesFileName(draft, kind), 'application/pdf');
  }

  function onPrimary() {
    if (!primary) return;
    if (primary.id === 'invite') setDialog('innkalling');
    if (primary.id === 'start') run('start', actions.start, { after: () => setTab('agenda') });
    if (primary.id === 'end') setDialog('end');
    if (primary.id === 'finalize') {
      const checks = finalizeChecks(draft);
      if (!checks.ok) {
        setTab('referat');
        setError(checks.blocking[0].text);
        return;
      }
      setDialog('finalize');
    }
    if (primary.id === 'send') setDialog('referat');
  }

  function onMenu(id) {
    if (id === 'pdf-innkalling') download('innkalling');
    if (id === 'pdf-referat') download('referat');
    if (id === 'ics') download('ics');
    if (id === 'next') { saveNow().catch(() => {}).finally(() => onCreateNext(normalizeMeeting(draftRef.current))); }
    if (id === 'template') { setTemplateName(`${draft.title}`); setDialog('template'); }
    if (id === 'invite-again') setDialog('innkalling');
    if (id === 'start') run('start', actions.start, { after: () => setTab('agenda') });
    if (id === 'reopen') { setReason(''); setDialog('reopen'); }
    if (id === 'cancel') { setReason(''); setNotify(draft.deliveries.some((d) => d.kind === 'innkalling')); setDialog('cancel'); }
    if (id === 'delete') setDialog('delete');
  }

  const hasNext = draft.seriesId && meetings.some((m) => m.seriesId === draft.seriesId && (m.number || 0) > (draft.number || 0));
  const menuItems = [
    { id: 'pdf-innkalling', label: 'Last ned innkalling (PDF)', icon: 'mail-outline' },
    { id: 'pdf-referat', label: isClosed(draft) ? 'Last ned referat (PDF)' : 'Last ned referatutkast (PDF)', icon: 'document-text-outline' },
    { id: 'ics', label: 'Legg i kalender (.ics)', icon: 'calendar-outline', disabled: !draft.date },
    { divider: true },
    ...(canManage && draft.status === 'innkalt' ? [{ id: 'invite-again', label: 'Send oppdatert innkalling', icon: 'paper-plane-outline' }] : []),
    ...(canManage && draft.status === 'utkast' ? [{ id: 'start', label: 'Start møtet uten innkalling', icon: 'play-outline' }] : []),
    ...(!hasNext && draft.status !== 'avlyst' && canManage ? [{ id: 'next', label: draft.seriesId ? `Lag møte ${(draft.number || 1) + 1} i serien` : 'Lag neste møte (blir en serie)', icon: 'repeat-outline', hint: 'Dagsorden og åpne oppfølgingspunkter følger med.' }] : []),
    ...(canManage ? [{ id: 'template', label: 'Lagre som møtemal', icon: 'albums-outline' }] : []),
    ...(canManage && isClosed(draft) ? [{ divider: true }, { id: 'reopen', label: 'Gjenåpne referatet', icon: 'lock-open-outline', hint: 'For retting. Neste ferdigstilling får ny revisjon.' }] : []),
    ...(canManage && !locked ? [{ divider: true }, { id: 'cancel', label: 'Avlys møtet', icon: 'close-circle-outline', tone: 'danger' }] : []),
    ...(canManage && canDeleteMeeting(draft) ? [{ id: 'delete', label: 'Slett utkastet', icon: 'trash-outline', tone: 'danger' }] : []),
  ];

  const pdfBytes = useCallback((kind) => actions.pdfFor(ctxRef.current, normalizeMeeting(draftRef.current), kind), [ctxRef]);
  const subtitle = [type.label, [draft.projectNumber, draft.projectName].filter(Boolean).join(' ')].filter(Boolean).join(' · ');

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.topRow}>
        <Btn small label="Møter" icon="arrow-back" tone="plain" onPress={async () => { await saveNow().catch(() => {}); onBack(); }} nativeID="meeting-back" />
        <View style={{ flex: 1 }} />
        {canManage && !locked ? <SaveState state={saveState} /> : null}
      </View>

      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={[styles.headerBand, { backgroundColor: type.color }]} />
        <View style={[styles.headerBody, !wide && { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <View style={styles.rowWrap}>
              <TypeIcon typeId={draft.typeId} size={30} />
              <Text style={{ fontSize: 13, color: colors.muted }} numberOfLines={1}>{subtitle}</Text>
              <NumberChip number={draft.number} />
              <PhasePill phase={phase} />
              {draft.visibility === 'deltakere' ? <View style={styles.rowWrap}><Ionicons name="lock-closed" size={12} color={colors.muted} /><Text style={{ fontSize: 12, color: colors.muted }}>Bare deltakerne</Text></View> : null}
            </View>
            <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header" nativeID="meeting-title">{draft.title}</Text>
            <View style={styles.rowWrap}>
              <View style={styles.meta}><Ionicons name="calendar-outline" size={15} color={colors.muted} /><Text style={[styles.metaText, { color: colors.ink }]}>{draft.date ? longDate(draft.date) : 'Ingen dato'}</Text></View>
              {draft.start ? <View style={styles.meta}><Ionicons name="time-outline" size={15} color={colors.muted} /><Text style={[styles.metaText, { color: colors.ink }]}>{timeRange(draft.start, draft.end)}</Text></View> : null}
              {draft.location ? <View style={styles.meta}><Ionicons name="location-outline" size={15} color={colors.muted} /><Text style={[styles.metaText, { color: colors.ink }]} numberOfLines={1}>{draft.location}</Text></View> : null}
              {draft.videoUrl ? <View style={styles.meta}><Ionicons name="videocam-outline" size={15} color={colors.muted} /><Text style={[styles.metaText, { color: colors.brand }]} numberOfLines={1} onPress={() => openFileUrl(draft.videoUrl)}>Videomøte</Text></View> : null}
              <View style={styles.meta}><AvatarStack people={invitees(draft)} max={4} size={22} /><Text style={[styles.metaText, { color: colors.muted }]}>{invitees(draft).length} deltakere</Text></View>
            </View>
          </View>
          <View style={[styles.headerActions, !wide && { justifyContent: 'flex-start' }]}>
            <Menu items={menuItems} onSelect={onMenu} nativeID="meeting-more" label="Mer" />
            {primary ? (
              <Btn
                label={primary.label}
                icon={primary.icon}
                tone={primary.id === 'end' ? 'dark' : 'primary'}
                busy={!!busy}
                onPress={onPrimary}
                nativeID={`meeting-primary-${primary.id}`}
              />
            ) : null}
          </View>
        </View>
        {draft.status !== 'avlyst' ? <Stepper meeting={draft} wide={wide} /> : null}
      </View>

      {error ? <Banner tone="danger" icon="alert-circle" action={<Btn small tone="plain" label="Lukk" onPress={() => setError('')} />}>{error}</Banner> : null}
      {draft.status === 'avlyst' ? (
        <Banner tone="danger" icon="close-circle" title="Møtet er avlyst">{draft.cancelReason || 'Ingen årsak oppgitt.'}</Banner>
      ) : null}
      {isClosed(draft) ? (
        <Banner
          tone="success"
          icon="lock-closed"
          title={draft.status === 'sendt' ? 'Referatet er ferdigstilt og sendt' : 'Referatet er ferdigstilt og låst'}
          action={canManage ? <Btn small label="Gjenåpne" icon="lock-open-outline" tone="ghost" onPress={() => onMenu('reopen')} /> : null}
        >
          {draft.status === 'sendt' ? 'Endringer krever at referatet gjenåpnes. Neste versjon får ny revisjon.' : 'Send referatet til deltakerne med knappen øverst.'}
        </Banner>
      ) : null}
      {!canManage && !locked ? (
        <Banner tone="info" icon="eye-outline">Du kan se møtet. Møteleder, referent eller administrator for Møter kan endre det.</Banner>
      ) : null}
      {draft.status === 'pagar' && draft.endedAt && canManage ? (
        <Banner tone="warn" icon="document-text-outline" title="Møtet er avsluttet" action={<Btn small label="Gå til referat" tone="soft" onPress={() => setTab('referat')} />}>
          Se over notatene, skriv sammendrag og ferdigstill referatet.
        </Banner>
      ) : null}

      <UnderTabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'agenda', label: live ? 'Møtemodus' : 'Dagsorden', icon: live ? 'radio-button-on' : 'list', count: stats.items, dot: live ? '#ef4444' : null },
          { id: 'deltakere', label: 'Deltakere', icon: 'people-outline', count: participants.length },
          { id: 'referat', label: 'Referat', icon: 'document-text-outline', dot: phase === 'referat' ? '#f59e0b' : null },
          { id: 'historikk', label: 'Historikk', icon: 'time-outline' },
        ]}
      />

      {tab === 'agenda' ? (
        <AgendaPanel
          key={live ? 'live' : 'plan'}
          meeting={draft}
          onChange={change}
          readOnly={readOnly}
          live={live && canManage}
          participants={participants}
          projects={projects}
          today={today}
          width={width}
          companyId={store?.companyId}
          remoteAi={!demo}
          onEnd={() => setDialog('end')}
        />
      ) : null}
      {tab === 'deltakere' ? (
        <ParticipantsPanel meeting={draft} onChange={change} readOnly={readOnly} people={people} width={width} live={live} />
      ) : null}
      {tab === 'referat' ? (
        <MinutesPanel
          meeting={draft}
          onChange={change}
          readOnly={readOnly}
          canManage={canManage}
          company={company}
          width={width}
          companyId={store?.companyId}
          remoteAi={!demo}
          busy={busy}
          pdfBytes={pdfBytes}
          onDownload={download}
          onFinalize={() => onPrimary()}
        />
      ) : null}
      {tab === 'historikk' ? (
        <HistoryPanel meeting={draft} meetings={meetings} today={today} onOpen={onOpen} onCreateNext={onCreateNext} canCreate={canManage} width={width} />
      ) : null}

      <SendDialog
        visible={dialog === 'innkalling' || dialog === 'referat'}
        kind={dialog === 'referat' ? 'referat' : 'innkalling'}
        meeting={normalizeMeeting(draft)}
        busy={busy === 'send'}
        viewer={viewer}
        company={company}
        demo={demo}
        onClose={() => setDialog('')}
        onSend={(options) => run('send', (ctx, m) => (dialog === 'referat' ? actions.sendMinutes(ctx, m, options) : actions.invite(ctx, m, options)))}
      />

      <ConfirmDialog
        visible={dialog === 'end'}
        title="Avslutte møtet?"
        message={`Møtet avsluttes. ${flatItems(draft).filter(({ item }) => !item.notes && !item.decisions.length && !item.actions.length).length} punkter står uten referat. Du kan fortsatt skrive i referatet til det er ferdigstilt.`}
        confirmText="Avslutt møtet"
        onCancel={() => setDialog('')}
        onConfirm={() => run('end', actions.end, { after: () => setTab('referat') })}
      />

      <ConfirmDialog
        visible={dialog === 'finalize'}
        title="Ferdigstille referatet?"
        message={draft.revision ? `Referatet låses som revisjon ${draft.revision + 1} og lagres som PDF.` : 'Referatet låses og lagres som PDF. Etterpå kan det bare rettes ved å gjenåpne det med en begrunnelse.'}
        confirmText="Ferdigstill"
        onCancel={() => setDialog('')}
        onConfirm={() => run('finalize', actions.finalize, { after: () => { setTab('referat'); setDialog('referat'); } })}
      />

      <ConfirmDialog
        visible={dialog === 'delete'}
        title="Slette utkastet?"
        message="Møtet er ikke sendt til noen og slettes for godt."
        confirmText="Slett"
        danger
        onCancel={() => setDialog('')}
        onConfirm={() => run('delete', actions.remove, { after: () => onBack() })}
      />

      <DialogShell
        visible={dialog === 'reopen'}
        title="Gjenåpne referatet"
        onClose={() => setDialog('')}
        colors={colors}
        width={520}
        footer={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Avbryt" tone="ghost" onPress={() => setDialog('')} />
            <Btn label="Gjenåpne" icon="lock-open-outline" tone="primary" disabled={reason.trim().length < 3} busy={busy === 'reopen'} onPress={() => run('reopen', (ctx, m) => actions.reopen(ctx, m, reason))} nativeID="reopen-confirm" />
          </View>
        )}
      >
        <Text style={{ color: colors.muted, fontSize: 13.5, lineHeight: 20 }}>
          Referatet åpnes for retting. Begrunnelsen står i loggen og i referatet, og neste ferdigstilling får revisjon {(draft.revision || 1) + 1}. PDF-en av dagens versjon blir liggende i arkivet.
        </Text>
        <Field label="Hva skal rettes?" value={reason} onChange={setReason} placeholder="For eksempel feil frist på punkt 5.1" autoFocus nativeID="reopen-reason" />
      </DialogShell>

      <DialogShell
        visible={dialog === 'cancel'}
        title="Avlys møtet"
        onClose={() => setDialog('')}
        colors={colors}
        width={560}
        footer={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Behold møtet" tone="ghost" onPress={() => setDialog('')} />
            <Btn
              label="Avlys møtet"
              icon="close-circle-outline"
              tone="danger"
              busy={busy === 'cancel'}
              nativeID="cancel-confirm"
              onPress={() => run('cancel', (ctx, m) => actions.cancel(ctx, m, {
                reason,
                notify,
                to: invitees(m).map((p) => p.email).filter(Boolean),
                text: cancelText(m, { reason, senderName: viewer?.name, companyName: company?.name }),
              }))}
            />
          </View>
        )}
      >
        <Field label="Årsak (valgfritt)" value={reason} onChange={setReason} placeholder="For eksempel sykdom eller flyttet til neste uke" autoFocus />
        {draft.deliveries.some((d) => d.kind === 'innkalling') ? (
          <Check checked={notify} onPress={() => setNotify((v) => !v)} label={`Send avlysning på e-post til ${invitees(draft).filter((p) => p.email).length} deltakere`} />
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 12.5 }}>Møtet blir stående som avlyst i listen og fjernes fra kalenderen i ProTop.</Text>
      </DialogShell>

      <DialogShell
        visible={dialog === 'template'}
        title="Lagre som møtemal"
        onClose={() => setDialog('')}
        colors={colors}
        width={520}
        footer={(
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn label="Avbryt" tone="ghost" onPress={() => setDialog('')} />
            <Btn
              label="Lagre malen"
              icon="albums-outline"
              tone="primary"
              disabled={!templateName.trim()}
              busy={busy === 'template'}
              nativeID="template-from-meeting"
              onPress={() => run('template', async (ctx, m) => {
                const tpl = templateFromMeeting(m, { name: templateName, at: new Date().toISOString(), by: viewer?.uid, byName: viewer?.name });
                await onSaveTemplate(tpl);
                return { message: `Malen «${tpl.name}» er lagret under Møtemaler.` };
              })}
            />
          </View>
        )}
      >
        <Text style={{ color: colors.muted, fontSize: 13.5, lineHeight: 20 }}>
          Dagsordenen med kapitler, punkter, tid og veiledning blir en mal. Notater, beslutninger, deltakere og datoer tas ikke med.
        </Text>
        <Field label="Navn på malen" value={templateName} onChange={setTemplateName} autoFocus nativeID="template-name-input" />
      </DialogShell>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  header: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  headerBand: { height: 4 },
  headerBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, padding: 18, paddingBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 },
  metaText: { fontSize: 13.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 12, borderTopWidth: 1, gap: 8 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 2, borderRadius: 1, minWidth: 12 },
});
