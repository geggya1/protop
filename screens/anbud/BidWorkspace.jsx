import React, { useEffect, useState } from 'react';
import {
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BidCollab from './BidCollab';
import TypedInput from '../../src/ui/TypedInput';
import OptionPicker from '../../components/OptionPicker';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  BID_STEPS,
  GROUND_ATTACH_FOLDER_ID,
  GROUND_FOLDER_ID,
  QA_ATTACH_FOLDER_ID,
  QA_FOLDER_ID,
  WORK_ATTACH_FOLDER_ID,
  WORK_ITEM_KINDS,
  WORK_ITEM_STATUSES,
  addBidFile,
  addBidQuestion,
  addWorkItem,
  answerBidQuestion,
  childFolders,
  createBidFolder,
  deleteBidFile,
  deleteBidFolder,
  discardPendingWorkItems,
  filesForCheck,
  filesInFolder,
  importPendingWorkItems,
  isSystemFolderId,
  patchWorkItem,
  proposedWorkItemsFromInterpretation,
  pullFormTemplate,
  removeWorkItem,
  renameBidFile,
  renameBidFolder,
  saveBidInterpretation,
  saveBidReviewNotes,
  saveBidStepAi,
  saveBidStepNotes,
  setFormStatus,
  setFormValue,
  setPendingWorkItems,
  togglePendingWorkItem,
  updateBidAssignment,
  updateBidSettings,
  workItemKindLabel,
  workItemStatusLabel,
  workRootFolders,
} from '../../src/anbud/bidLibrary';
import { interpretBidCompetition } from '../../src/anbud/bidAi';
import { MAX_BID_UPLOAD_BYTES, uploadBidFile } from '../../src/anbud/bidFiles';
import {
  awardContract,
  executionBlockers,
  markOutcome,
  markSubmitted,
  openExecution,
  regulatoryChecks,
  STAGE_LABELS,
  STRATEGY_ITEMS,
  toggleStrategy,
} from '../../src/anbud/lifecycle';
import {
  formatNoticeText,
  officialNoticeUrl,
  sourceLabel,
} from '../../src/anbud/noticeText';
import { deadlineCountdown, fileTypeLabel, groundFileTree, workProgress } from '../../src/anbud/bidOverview';
import { noticeMapScope, noticePlaceBucket } from '../../src/anbud/noticePlace';
import { pickDocument } from '../../src/utils/media';
import { processStepsForBid } from '../../src/anbud/processTrail';
import { bidCanLeaveDesk, bidCanReturnToReview } from '../../src/anbud/model';
import FormAnswer from './FormAnswer';
import ProcessTrail from './ProcessTrail';
import BidOverview from './BidOverview';
import BidSymbolButton from './BidSymbolButton';
import ReviewNotes from './ReviewNotes';
import { useCompanyAiGuard } from '../../src/privacy/useCompanyAi';
import DateInput from '../../components/DateInput';
import TimeField from '../../components/TimeField';
import { detectDateFormat } from '../../src/utils/dateInput';

const TABS = [
  { id: 'oversikt', label: 'Oversikt', icon: 'grid-outline' },
  ...BID_STEPS.map((row) => ({
    ...row,
    label: row.label.replace(/^\d+\s*/, ''),
    icon: { grunnlag: 'folder-open-outline', qa: 'chatbubbles-outline', arbeid: 'document-text-outline' }[row.id],
  })),
];

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,application/pdf,image/*';

// Tilbudsfristen er tekst som «02.11.2026 12:00» eller «2026-11-02T12:00». Dato og klokkeslett velges hver for seg.
function splitDeadline(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})(?:(T|\s+(?:kl\.?\s*)?)(\d{1,2}:\d{2}))?/i);
  if (m) return { date: m[1], time: m[3] || '', sep: m[2] || ' ', rest: m[3] ? raw.slice(m[0].length) : '' };
  if (/^\d{1,2}:\d{2}$/.test(raw)) return { date: '', time: raw, sep: ' ', rest: '' };
  // Fritekst uten dato vises i feltet til en dato velges.
  return { date: raw, time: '', sep: ' ', rest: '', free: !!raw };
}

/** Tilbudsfrist med datovelger og klokkeslett. Lagres i samme tekstform som før. */
export function DeadlineField({ value, onChange, colors }) {
  const parts = splitDeadline(value);
  const join = (date, time) => (date ? `${date}${time ? `${parts.sep}${time}${parts.rest}` : ''}` : time);
  return (
    <View style={styles.deadlineRow}>
      <DateInput
        value={parts.date}
        onChange={(date) => onChange(join(date, parts.time))}
        format={detectDateFormat(parts.date, 'nb')}
        placeholder="Tilbudsfrist"
        clearable
        style={[styles.deadlineDate, { backgroundColor: colors.bg }]}
      />
      <TimeField
        value={parts.time}
        onChange={(time) => onChange(join(parts.free ? '' : parts.date, time))}
        placeholder="Klokkeslett"
        iconColor={colors.brand}
        style={[styles.deadlineTime, { borderColor: colors.line, backgroundColor: colors.bg }]}
        textStyle={{ color: parts.time ? colors.ink : colors.placeholder }}
      />
    </View>
  );
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function payloadFromPicked(picked, { companyId, bidId } = {}) {
  let blob = picked?.blob || null;
  if (!blob && picked?.uri && typeof fetch === 'function') {
    const res = await fetch(picked.uri);
    blob = await res.blob();
  }
  const name = picked?.name || 'Fil';
  const mimeType = blob?.type || picked?.mimeType || 'application/octet-stream';
  const size = blob?.size || picked?.size || 0;
  const enriched = { ...picked, blob, name, mimeType, size };
  if (companyId && bidId && (blob || picked?.uri) && size <= MAX_BID_UPLOAD_BYTES) {
    try {
      const uploaded = await uploadBidFile(companyId, bidId, enriched);
      return {
        name: uploaded.name,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        sizeLabel: uploaded.sizeLabel,
        url: uploaded.url,
        storagePath: uploaded.storagePath,
        status: 'lastet',
      };
    } catch {
      // Fall back to inline dataUrl for smaller files.
    }
  }
  if (!blob || size > 480000) {
    return { name, mimeType, size, status: 'for-stor' };
  }
  const dataUrl = await readAsDataUrl(blob);
  return { name, mimeType, size, dataUrl, status: 'lastet' };
}

function openStoredFile(file) {
  if (file?.dataUrl) {
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.open(file.dataUrl, '_blank', 'noopener,noreferrer');
    else Linking.openURL(file.dataUrl).catch(() => {});
    return;
  }
  if (file?.text && Platform.OS === 'web' && typeof window !== 'undefined') {
    const blob = new Blob([file.text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  if (file?.url) Linking.openURL(file.url).catch(() => {});
}

function statusLabel(file) {
  if (file.status === 'lastet') return 'Lagret';
  if (file.status === 'for-stor') return 'For stor til å lagres';
  if (file.status === 'portal') return 'Krever innlogging på portalen';
  return 'Lenke';
}

function toneColor(tone, colors) {
  if (tone === 'danger') return colors.danger;
  if (tone === 'warn') return colors.warn || colors.danger;
  if (tone === 'brand') return colors.brand;
  return colors.ink;
}

export default function BidWorkspace({
  bid, state, colors, busy, note, onBack, onCommit, onRefresh,
  members = [], units = [], companies = [],
  onReturnToReview, onMarkUaktuell,
}) {
  const guardAi = useCompanyAiGuard();
  const [step, setStep] = useState('oversikt');
  const [folderId, setFolderId] = useState(null);
  const [folderName, setFolderName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [renamingFolder, setRenamingFolder] = useState(false);
  const [question, setQuestion] = useState('');
  const [openFileId, setOpenFileId] = useState('');
  const [value, setValue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [localNote, setLocalNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [expandedQual, setExpandedQual] = useState('');
  const [expandedAward, setExpandedAward] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [ownTitle, setOwnTitle] = useState('');
  const [ownKind, setOwnKind] = useState('annet');
  const [metaTitle, setMetaTitle] = useState('');
  const [metaBuyer, setMetaBuyer] = useState('');
  const [metaDeadline, setMetaDeadline] = useState('');

  useEffect(() => {
    setNotesDraft(bid?.stepNotes?.[step] || '');
  }, [bid?.id, bid?.stepNotes, step]);

  useEffect(() => {
    setMetaTitle(bid?.title || '');
    setMetaBuyer(bid?.buyer || '');
    setMetaDeadline(bid?.dossier?.submissionDeadline || '');
  }, [bid?.id, bid?.title, bid?.buyer, bid?.dossier?.submissionDeadline]);

  if (!bid) {
    return (
      <View style={{ gap: 8 }}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Tilbake til tilbudene</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted }}>Tilbudet er ikke tilgjengelig.</Text>
      </View>
    );
  }

  const dossier = bid.dossier || {};
  const stage = bid.stage || 'planlegging';
  const locked = stage === 'kontrakt' || stage === 'tapt' || stage === 'trukket';
  const strategyLocked = locked || stage === 'levert';
  const folder = folderId ? bid.folders.find((row) => row.id === folderId) : null;
  const message = localNote || note;
  const notice = (state?.notices || []).find((row) => row.id === bid.noticeId) || null;
  const noticeUrl = officialNoticeUrl({
    ...(notice || {}),
    id: bid.noticeId || notice?.id,
    source: notice?.source || bid.source,
    url: notice?.url || dossier.noticeUrl || dossier.documentsUrl,
    dossier,
  });
  const source = sourceLabel(notice || { source: /^\d{4}-\d+$/.test(String(bid.noticeId || '')) ? 'doffin' : 'ted' });
  const companyId = state?.companyId || '';
  const interpretation = bid.interpretation || {};
  const people = (members || []).filter((row) => row.role !== 'child');

  async function commit(result) {
    setLocalNote('');
    await onCommit(result);
  }

  async function goStep(next) {
    if (notesDraft !== (bid.stepNotes?.[step] || '')) {
      await commit(saveBidStepNotes(state, bid.id, step, notesDraft));
    }
    setStep(next);
    setFolderId(null);
    setOpenFileId('');
    setRenamingFolder(false);
  }

  async function addFolder() {
    const parentId = folder && !isSystemFolderId(folder.id) && !folder.locked ? folderId : null;
    const result = createBidFolder(state, bid.id, { name: folderName, parentId });
    if (!result.ok) {
      setLocalNote(result.error);
      return;
    }
    setFolderName('');
    await commit(result);
  }

  async function saveRenameFolder() {
    if (!folder || isSystemFolderId(folder.id)) return;
    const result = renameBidFolder(state, bid.id, folder.id, renameValue);
    if (!result.ok) {
      setLocalNote(result.error);
      return;
    }
    setRenamingFolder(false);
    await commit(result);
  }

  async function uploadFiles(list, targetFolderId, checkId) {
    const target = targetFolderId || folderId;
    if (!target) {
      setLocalNote('Åpne eller opprett en mappe før du laster opp.');
      return;
    }
    const targetFolder = bid.folders.find((row) => row.id === target);
    if (!targetFolder || targetFolder.locked || target === GROUND_FOLDER_ID || target === QA_FOLDER_ID) {
      setLocalNote('Denne mappen er låst. Last opp under egne vedlegg.');
      return;
    }
    const files = (Array.isArray(list) ? list : [list]).filter(Boolean);
    if (!files.length) return;
    setUploading(true);
    setLocalNote('');
    let saved = 0;
    let nextState = state;
    try {
      for (const file of files) {
        let payload;
        try {
          payload = await payloadFromPicked(file, { companyId, bidId: bid.id });
        } catch (err) {
          setLocalNote(err?.message || 'Kunne ikke lese filen.');
          continue;
        }
        if (payload.status === 'for-stor') {
          setLocalNote(`«${payload.name}» er for stor (maks 25 MB via lagring, eller under 500 KB uten).`);
          continue;
        }
        const result = addBidFile(nextState, bid.id, target, { ...payload, checkId });
        if (!result.ok) {
          setLocalNote(result.error);
          continue;
        }
        nextState = result.state;
        saved += 1;
      }
      if (saved) {
        await onCommit({ ok: true, state: nextState, error: null });
        setLocalNote(saved === 1 ? '1 fil er lagret.' : `${saved} filer er lagret.`);
        showSaveToast(saved === 1 ? '1 fil er lagret.' : `${saved} filer er lagret.`);
      }
    } finally {
      setUploading(false);
      setDragOver(false);
    }
  }

  async function pickAndUpload(targetFolderId, checkId) {
    const picked = await pickDocument({ multiple: true, accept: FILE_ACCEPT });
    const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
    await uploadFiles(list, targetFolderId, checkId);
  }

  async function attachToField(form, field) {
    setLocalNote('');
    const picked = await pickDocument({
      accept: field.kind === 'image' ? 'image/*' : FILE_ACCEPT,
    });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) return;
    let payload;
    try {
      payload = await payloadFromPicked(file, { companyId, bidId: bid.id });
    } catch (err) {
      setLocalNote(err?.message || 'Kunne ikke lese filen.');
      return;
    }
    if (payload.status === 'for-stor') {
      setLocalNote('Filen er for stor til å lagres i skjemaet.');
      return;
    }
    await commit(setFormValue(state, bid.id, form.id, field.id, {
      name: payload.name,
      mimeType: payload.mimeType,
      dataUrl: payload.dataUrl,
      url: payload.url,
    }));
  }

  async function runStepAi(focus) {
    setAiBusy(true);
    setLocalNote('');
    try {
      const result = await guardAi(interpretBidCompetition)(bid, {
        focus,
        companyName: companies.find((row) => row.id === companyId)?.name || '',
      });
      if (focus === 'grunnlag' || focus === 'qa') {
        await commit(saveBidStepAi(state, bid.id, focus, result.interpretation));
        setLocalNote(result.engine === 'gemini'
          ? 'AI har tolket innholdet.'
          : 'Lokal oppsummering er laget. Kjør på nytt når AI er tilgjengelig for rikere treff.');
        return;
      }
      let next = saveBidInterpretation(state, bid.id, result.interpretation);
      if (!next.ok) {
        setLocalNote(next.error);
        return;
      }
      const proposals = proposedWorkItemsFromInterpretation(next.state.bids.find((row) => row.id === bid.id)?.interpretation);
      next = setPendingWorkItems(next.state, bid.id, proposals);
      await commit(next);
      setLocalNote(result.engine === 'gemini'
        ? 'AI og OCR har foreslått leveranser. Gå gjennom dem før import.'
        : 'Lokalt forslag er klart. Gå gjennom det før import, eller kjør på nytt når AI er tilgjengelig.');
    } catch (err) {
      setLocalNote(err?.message || 'Kunne ikke tolke konkurransen.');
    } finally {
      setAiBusy(false);
    }
  }

  const groundFiles = [
    ...filesInFolder(bid.files, GROUND_FOLDER_ID),
    ...filesInFolder(bid.files, GROUND_ATTACH_FOLDER_ID),
  ];
  const qaFiles = [
    ...filesInFolder(bid.files, QA_FOLDER_ID),
    ...filesInFolder(bid.files, QA_ATTACH_FOLDER_ID),
  ];

  const assignee = [bid.assignment?.personName, bid.assignment?.unitName].filter(Boolean).join(' · ');
  const stepCounts = {
    grunnlag: groundFiles.length,
    qa: (dossier.qa?.length || 0) + (bid.questions?.length || 0),
    arbeid: bid.workItems?.length || 0,
  };
  const manual = !bid.noticeId;
  // Ukjent sted skal ikke se ut som «Hele Norge».
  const placeBucket = notice ? noticePlaceBucket(notice) : 'miss';
  const place = placeBucket === 'miss'
    ? (Array.isArray(dossier.places) ? dossier.places.filter(Boolean).join(', ') : '')
    : noticeMapScope(notice).label;
  const reference = dossier.reference || bid.noticeId || '';
  const groundGroups = groundFileTree(filesInFolder(bid.files, GROUND_FOLDER_ID));
  const overviewFiles = [
    ...groundGroups.flatMap((group) => group.files),
    ...filesInFolder(bid.files, GROUND_ATTACH_FOLDER_ID),
  ];
  const narrow = step === 'oversikt' ? null : styles.narrow;

  return (
    <View style={styles.page}>
      <View style={[styles.hero, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.heroTop}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.back}>
          <Ionicons name="chevron-back" size={16} color={colors.brand} />
          <Text style={{ color: colors.brand, fontWeight: '600' }}>Alle tilbud</Text>
        </TouchableOpacity>
        <View style={styles.row}>
        {bidCanReturnToReview(bid) ? (
          <BidSymbolButton
            icon="arrow-undo-outline"
            tip="Tilbake til vurdering"
            label="Tilbake til vurdering"
            color={colors.brand}
            backgroundColor={colors.card}
            borderColor={colors.brand}
            onPress={onReturnToReview}
            disabled={busy}
          />
        ) : null}
        {bidCanLeaveDesk(bid) ? (
          <BidSymbolButton
            icon="ban-outline"
            tip="Uaktuell"
            label="Uaktuell"
            color={colors.danger}
            backgroundColor={colors.card}
            borderColor={colors.danger}
            onPress={onMarkUaktuell}
            disabled={busy}
          />
        ) : null}
        <BidSymbolButton
          icon={settingsOpen ? 'settings' : 'settings-outline'}
          tip={settingsOpen ? 'Skjul innstillinger' : 'Innstillinger'}
          label={settingsOpen ? 'Skjul innstillinger' : 'Innstillinger'}
          color={colors.brand}
          backgroundColor={settingsOpen ? colors.brandSoft : colors.card}
          borderColor={colors.brand}
          onPress={() => setSettingsOpen((value) => !value)}
        />
        </View>
      </View>
      <View style={styles.heroBody}>
        <View style={styles.heroText}>
          <View style={styles.row}>
            <Pill text={manual ? 'Direkte forespørsel' : 'Offentlig anbud'} color={colors.brand} background={colors.brandSoft} />
            <Pill text={STAGE_LABELS[stage] || 'Planlegging'} color={colors.muted} background={colors.sunken} />
          </View>
          <Text style={[styles.h, { color: colors.ink }]}>{bid.title}</Text>
          <View style={styles.meta}>
            <Meta icon="business-outline" text={bid.buyer || 'Oppdragsgiver ikke oppgitt'} colors={colors} />
            {place ? <Meta icon="location-outline" text={place} colors={colors} /> : null}
            {reference ? <Meta icon="document-text-outline" text={reference} colors={colors} /> : null}
            {assignee ? <Meta icon="person-outline" text={assignee} colors={colors} /> : null}
          </View>
        </View>
        {noticeUrl ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(noticeUrl)}
            accessibilityRole="link"
            style={[styles.heroLink, { borderColor: colors.brand, backgroundColor: colors.card }]}
          >
            <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne på {source}</Text>
            <Ionicons name="open-outline" size={15} color={colors.brand} />
          </TouchableOpacity>
        ) : null}
      </View>
      <ProcessTrail colors={colors} steps={processStepsForBid(bid, notice)} />
      </View>
      <View style={styles.column}>
      <View style={[styles.tabs, { borderColor: colors.line }]} accessibilityRole="tablist">
        {TABS.map((item) => {
          const on = step === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => goStep(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, { borderColor: on ? colors.brand : 'transparent' }]}
            >
              <Ionicons name={item.icon} size={17} color={on ? colors.brand : colors.muted} />
              <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '700' : '500', fontSize: 14 }}>
                {item.label}
              </Text>
              {stepCounts[item.id] ? (
                <View style={[styles.tabCount, { backgroundColor: on ? colors.brandSoft : colors.sunken }]}>
                  <Text style={{ color: on ? colors.brand : colors.muted, fontSize: 12, fontWeight: '600' }}>{stepCounts[item.id]}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {!!message && <Text style={[narrow, { color: colors.brand }]}>{message}</Text>}
      {settingsOpen ? (
        <View style={[styles.card, styles.narrow, { borderColor: colors.line, backgroundColor: colors.card, gap: 10 }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Innstillinger for tilbudsarbeidet</Text>
          <TextInput
            value={metaTitle}
            onChangeText={setMetaTitle}
            placeholder="Tittel"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TextInput
            value={metaBuyer}
            onChangeText={setMetaBuyer}
            placeholder="Oppdragsgiver"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <DeadlineField value={metaDeadline} onChange={setMetaDeadline} colors={colors} />
          <TouchableOpacity
            onPress={() => commit(updateBidSettings(state, bid.id, {
              title: metaTitle,
              buyer: metaBuyer,
              deadline: metaDeadline,
            }))}
            accessibilityRole="button"
            style={[styles.btn, { backgroundColor: colors.brand }]}
          >
            <Text style={{ color: '#fff' }}>Lagre innstillinger</Text>
          </TouchableOpacity>
          <AssignmentPanel
            bid={bid}
            state={state}
            colors={colors}
            locked={locked}
            members={members}
            units={units}
            companies={companies}
            onCommit={commit}
            compact
          />
        </View>
      ) : null}
      {step === 'oversikt' ? (
        <BidOverview
          bid={bid}
          dossier={dossier}
          notice={notice}
          colors={colors}
          noticeUrl={noticeUrl}
          source={source}
          place={place}
          groundFiles={overviewFiles}
          busy={busy}
          aiBusy={aiBusy}
          onRefresh={onRefresh}
          onGoStep={goStep}
          onSuggest={async () => {
            await runStepAi('arbeid');
            setStep('arbeid');
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : (
        <View style={[styles.narrow, { gap: 10 }]}>
          <DeadlineTiles
            colors={colors}
            rows={[
              { id: 'qa', label: 'Frist for spørsmål', icon: 'chatbubbles-outline', value: dossier.questionDeadline },
              { id: 'tilbud', label: 'Tilbudsfrist', icon: 'flag-outline', value: dossier.submissionDeadline || bid.deadline, main: true },
            ]}
          />
          <StepInfo step={step} bid={bid} dossier={dossier} stage={stage} colors={colors} />
        </View>
      )}
      <View style={narrow}>
        <BidCollab
          bid={bid}
          state={state}
          notice={notice}
          colors={colors}
          members={members}
          onCommit={commit}
        />
      </View>
      {bid.reviewNotes?.length ? (
        <View style={[styles.card, narrow, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <ReviewNotes
            notes={bid.reviewNotes || []}
            colors={colors}
            heading="Notater fra vurderingen"
            hint="Notatene fulgte med fra vurderingen og kan fortsatt endres her."
            onSave={locked ? undefined : (notes) => commit(saveBidReviewNotes(state, bid.id, notes))}
            onDelete={locked ? undefined : (notes) => commit(saveBidReviewNotes(state, bid.id, notes))}
          />
        </View>
      ) : null}

      {step === 'grunnlag' ? (
        <View style={[styles.narrow, { gap: 14 }]}>
          <Section title="Dokumenter" icon="documents-outline" colors={colors} well>
            {dossier.description ? <FoldedText text={formatNoticeText(dossier.description)} colors={colors} /> : null}
            <View style={styles.row}>
              <TouchableOpacity
                onPress={onRefresh}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.btn, { backgroundColor: colors.brand, opacity: busy ? 0.7 : 1 }]}
              >
                <Text style={{ color: '#fff' }}>{busy ? 'Henter dokumenter …' : (dossier.ground?.checkedAt ? 'Oppdater dokumenter' : 'Hent anbudsgrunnlag')}</Text>
              </TouchableOpacity>
              {dossier.documentsUrl ? (
                <TouchableOpacity onPress={() => Linking.openURL(dossier.documentsUrl)} accessibilityRole="link" style={[styles.btn, { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }]}>
                  <Text style={{ color: colors.ink }}>Åpne originalkilde</Text>
                </TouchableOpacity>
              ) : null}
              {dossier.ground?.access === 'interest' && (dossier.interestUrl || dossier.documentsUrl) ? (
                <TouchableOpacity
                  onPress={() => Linking.openURL(dossier.interestUrl || dossier.documentsUrl)}
                  accessibilityRole="link"
                  style={[styles.btn, { borderWidth: 1, borderColor: colors.brand, backgroundColor: colors.card }]}
                >
                  <Text style={{ color: colors.brand }}>Meld interesse</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {dossier.ground?.note ? <Text style={{ color: colors.muted }}>{dossier.ground.note}</Text> : null}
            {dossier.ground?.checkedAt ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Sist kontrollert {String(dossier.ground.checkedAt).slice(0, 16).replace('T', ' ')}
                {dossier.ground.portal ? ` · ${dossier.ground.portal}` : ''}
              </Text>
            ) : null}
            {Array.isArray(dossier.updates) && dossier.updates.length ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>Oppdateringer</Text>
                {dossier.updates.slice(-6).reverse().map((row) => (
                  <Text key={`${row.at}-${row.field}`} style={{ color: colors.muted }}>
                    {String(row.at || '').slice(0, 16).replace('T', ' ')} · {row.label || row.field}
                  </Text>
                ))}
              </View>
            ) : null}
            <FileTree
              root="Konkurransegrunnlag"
              groups={groundGroups}
              ownFiles={filesInFolder(bid.files, GROUND_ATTACH_FOLDER_ID)}
              colors={colors}
              openFileId={openFileId}
              onOpen={setOpenFileId}
              onDelete={(fileId) => commit(deleteBidFile(state, bid.id, fileId))}
              onRename={(fileId, name) => commit(renameBidFile(state, bid.id, fileId, name))}
              upload={(
                <DropUpload
                  colors={colors}
                  dragOver={dragOver}
                  setDragOver={setDragOver}
                  uploading={uploading}
                  onPick={() => pickAndUpload(GROUND_ATTACH_FOLDER_ID)}
                  onFiles={(files) => uploadFiles(files, GROUND_ATTACH_FOLDER_ID)}
                  compact
                />
              )}
            />
          </Section>
          <Section title="AI-tolkning og oppsummering" icon="sparkles-outline" colors={colors}>
            <Text style={{ color: colors.muted }}>
              AI leser dokumentene og lager en oppsummering av konkurransegrunnlaget.
            </Text>
            <TouchableOpacity
              onPress={() => runStepAi('grunnlag')}
              disabled={aiBusy}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand, opacity: aiBusy ? 0.7 : 1 }]}
            >
              <Text style={{ color: '#fff' }}>{aiBusy ? 'Tolker …' : 'Tolk grunnlaget med AI og OCR'}</Text>
            </TouchableOpacity>
            {bid.stepAi?.grunnlag?.summary ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.ink, lineHeight: 22 }}>{bid.stepAi.grunnlag.summary}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {bid.stepAi.grunnlag.generatedAt ? String(bid.stepAi.grunnlag.generatedAt).slice(0, 16).replace('T', ' ') : ''}
                  {bid.stepAi.grunnlag.engine ? ` · ${bid.stepAi.grunnlag.engine}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.muted }}>Ingen tolkning ennå.</Text>
            )}
          </Section>
          <NotesSection colors={colors} value={notesDraft} onChange={setNotesDraft} onSave={() => commit(saveBidStepNotes(state, bid.id, 'grunnlag', notesDraft))} />
        </View>
      ) : null}

      {step === 'qa' ? (
        <View style={[styles.narrow, { gap: 14 }]}>
          <Section title="Innhold og filer" icon="chatbubbles-outline" colors={colors} well>
            <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{busy ? 'Henter …' : 'Hent publiserte svar på nytt'}</Text>
            </TouchableOpacity>
            {dossier.qa?.length ? dossier.qa.map((row) => (
              <View key={row.id || `${row.question}-${row.answer}`} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                {row.fresh || row.changed ? (
                  <Text style={{ color: colors.brand, fontWeight: '700' }}>{row.fresh ? 'Nytt' : 'Endret svar'}</Text>
                ) : null}
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.question}</Text>
                <Text style={{ color: colors.ink }}>{row.answer || 'Svaret er ikke publisert ennå.'}</Text>
                {row.published ? <Text style={{ color: colors.muted, fontSize: 12 }}>Publisert {row.published}</Text> : null}
              </View>
            )) : <Text style={{ color: colors.muted }}>Ingen spørsmål og svar er publisert i kunngjøringen ennå.</Text>}
            <FileList
              files={filesInFolder(bid.files, QA_FOLDER_ID)}
              colors={colors}
              openFileId={openFileId}
              onOpen={setOpenFileId}
            />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Egne spørsmål</Text>
            {(bid.questions || []).map((row) => (
              <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.ink }}>{row.question}</Text>
                <TypedInput
                  value={row.answer}
                  onChangeText={(answer) => commit(answerBidQuestion(state, bid.id, row.id, answer))}
                  placeholder="Svar fra oppdragsgiver"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                />
              </View>
            ))}
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Nytt spørsmål til oppdragsgiver"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TouchableOpacity
              onPress={() => {
                const result = addBidQuestion(state, bid.id, question);
                if (!result.ok) {
                  setLocalNote(result.error);
                  return;
                }
                setQuestion('');
                commit(result);
              }}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff' }}>Legg til spørsmål</Text>
            </TouchableOpacity>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Vedlegg til spørsmål og svar</Text>
            <DropUpload
              colors={colors}
              dragOver={dragOver}
              setDragOver={setDragOver}
              uploading={uploading}
              onPick={() => pickAndUpload(QA_ATTACH_FOLDER_ID)}
              onFiles={(files) => uploadFiles(files, QA_ATTACH_FOLDER_ID)}
            />
            <FileList
              files={filesInFolder(bid.files, QA_ATTACH_FOLDER_ID)}
              colors={colors}
              openFileId={openFileId}
              onOpen={setOpenFileId}
              onDelete={(fileId) => commit(deleteBidFile(state, bid.id, fileId))}
              onRename={(fileId, name) => commit(renameBidFile(state, bid.id, fileId, name))}
            />
            {!qaFiles.length && !dossier.qa?.length ? (
              <Text style={{ color: colors.muted }}>Kunngjorte Q&A-filer vises her når de er hentet inn.</Text>
            ) : null}
          </Section>
          <Section title="AI-tolkning av betydning" icon="sparkles-outline" colors={colors}>
            <Text style={{ color: colors.muted }}>
              AI leser spørsmål og svar og forklarer hva de betyr for tilbudet.
            </Text>
            <TouchableOpacity
              onPress={() => runStepAi('qa')}
              disabled={aiBusy}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand, opacity: aiBusy ? 0.7 : 1 }]}
            >
              <Text style={{ color: '#fff' }}>{aiBusy ? 'Tolker …' : 'Tolk Q&A med AI og OCR'}</Text>
            </TouchableOpacity>
            {bid.stepAi?.qa?.summary ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.ink, lineHeight: 22 }}>{bid.stepAi.qa.summary}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {bid.stepAi.qa.generatedAt ? String(bid.stepAi.qa.generatedAt).slice(0, 16).replace('T', ' ') : ''}
                  {bid.stepAi.qa.engine ? ` · ${bid.stepAi.qa.engine}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={{ color: colors.muted }}>Ingen tolkning ennå.</Text>
            )}
          </Section>
          <NotesSection colors={colors} value={notesDraft} onChange={setNotesDraft} onSave={() => commit(saveBidStepNotes(state, bid.id, 'qa', notesDraft))} />
        </View>
      ) : null}

      {step === 'arbeid' ? (
        <View style={[styles.narrow, { gap: 14 }]}>
          <Section title="Hva som skal leveres" icon="checkbox-outline" colors={colors} well>
            <Text style={{ color: colors.muted }}>
              AI og OCR leser konkurransegrunnlaget og foreslår leveranser. Forslag vises her før du importerer dem.
            </Text>
            <TouchableOpacity
              onPress={() => runStepAi('arbeid')}
              disabled={aiBusy}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand, opacity: aiBusy ? 0.7 : 1 }]}
            >
              <Text style={{ color: '#fff' }}>{aiBusy ? 'Foreslår leveranser …' : 'Foreslå leveranser med AI og OCR'}</Text>
            </TouchableOpacity>
            {interpretation.summary ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>AI-tolkning</Text>
                <Text style={{ color: colors.ink, lineHeight: 22 }}>{interpretation.summary}</Text>
                {interpretation.generatedAt ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Generert {String(interpretation.generatedAt).slice(0, 16).replace('T', ' ')}
                    {interpretation.engine ? ` · ${interpretation.engine}` : ''}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {(bid.pendingWorkItems || []).length ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>Forslag før import</Text>
                {bid.pendingWorkItems.map((row) => (
                  <TouchableOpacity
                    key={row.id}
                    onPress={() => commit(togglePendingWorkItem(state, bid.id, row.id))}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: row.selected !== false }}
                    style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
                  >
                    <Text style={{ color: colors.ink, fontWeight: '600' }}>
                      {row.selected === false ? '○' : '✓'} {row.title}
                    </Text>
                    <Text style={{ color: colors.muted }}>{workItemKindLabel(row.kind)}</Text>
                    {row.detail ? <Text style={{ color: colors.ink }}>{row.detail}</Text> : null}
                  </TouchableOpacity>
                ))}
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => commit(importPendingWorkItems(state, bid.id))} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                    <Text style={{ color: '#fff' }}>Importer valgte</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => commit(discardPendingWorkItems(state, bid.id))} accessibilityRole="button">
                    <Text style={{ color: colors.muted }}>Forkast forslag</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Sjekkpunkt i tilbudsarbeidet</Text>
            {(bid.workItems || []).map((item) => (
              <WorkItemCard
                key={item.id}
                item={item}
                bid={bid}
                state={state}
                colors={colors}
                people={people}
                openFileId={openFileId}
                setOpenFileId={setOpenFileId}
                dragOver={dragOver}
                setDragOver={setDragOver}
                uploading={uploading}
                onCommit={commit}
                onPick={() => pickAndUpload(WORK_ATTACH_FOLDER_ID, item.id)}
                onFiles={(files) => uploadFiles(files, WORK_ATTACH_FOLDER_ID, item.id)}
              />
            ))}
            {!bid.workItems?.length && !bid.pendingWorkItems?.length ? (
              <Text style={{ color: colors.muted }}>Ingen sjekkpunkt ennå. Foreslå med AI, eller legg til egne under.</Text>
            ) : null}
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Legg til eget sjekkpunkt</Text>
            <OptionPicker
              options={WORK_ITEM_KINDS}
              value={ownKind}
              onChange={(id) => { if (id) setOwnKind(id); }}
              title="Legg til eget sjekkpunkt"
              clearable={false}
              small
            />
            <TextInput
              value={ownTitle}
              onChangeText={setOwnTitle}
              placeholder="Navn, f.eks. Tilbudsbrev"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TouchableOpacity
              onPress={() => {
                const result = addWorkItem(state, bid.id, { title: ownTitle, kind: ownKind });
                if (!result.ok) {
                  setLocalNote(result.error);
                  return;
                }
                setOwnTitle('');
                commit(result);
              }}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff' }}>Legg til</Text>
            </TouchableOpacity>
          </Section>
          <Section title="Krav og kriterier" icon="ribbon-outline" colors={colors}>
            <ExpandSection
              title="Kvalifikasjonskrav"
              items={interpretation.qualification || []}
              colors={colors}
              expandedId={expandedQual}
              onToggle={setExpandedQual}
              empty="Kjør AI-forslag for å hente kvalifikasjonskrav fra dokumentene."
            />
            <ExpandSection
              title="Tildelingskriterier"
              items={interpretation.awardCriteria || []}
              colors={colors}
              expandedId={expandedAward}
              onToggle={setExpandedAward}
              empty="Kjør AI-forslag for å hente tildelingskriterier fra dokumentene."
              showWeight
            />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Dokumentmappe og skjema</Text>
            {folder ? (
              <TouchableOpacity onPress={() => { setFolderId(folder.parentId || null); setRenamingFolder(false); }} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>{folder.parentId ? 'Tilbake' : 'Alle mapper'}</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{folder ? folder.name : 'Mapper'}</Text>
            {(folder ? childFolders(bid.folders, folder.id) : workRootFolders(bid.folders)).map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => { setFolderId(row.id); setRenameValue(row.name); setRenamingFolder(false); }}
                accessibilityRole="button"
                style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.emoji || '📁'} {row.name}</Text>
                <Text style={{ color: colors.muted }}>{filesInFolder(bid.files, row.id).length} filer · {childFolders(bid.folders, row.id).length} undermapper</Text>
              </TouchableOpacity>
            ))}
            {folder && !isSystemFolderId(folder.id) ? (
              <View style={{ gap: 8 }}>
                {renamingFolder ? (
                  <View style={styles.row}>
                    <TextInput
                      value={renameValue}
                      onChangeText={setRenameValue}
                      placeholder="Nytt mappenavn"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
                    />
                    <TouchableOpacity onPress={saveRenameFolder} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                      <Text style={{ color: '#fff' }}>Lagre navn</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setRenamingFolder(false)} accessibilityRole="button">
                      <Text style={{ color: colors.muted }}>Avbryt</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity onPress={() => { setRenameValue(folder.name); setRenamingFolder(true); }} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>Endre mappenavn</Text>
                  </TouchableOpacity>
                )}
                <FileList
                  files={filesInFolder(bid.files, folder.id)}
                  colors={colors}
                  openFileId={openFileId}
                  onOpen={setOpenFileId}
                  onDelete={(fileId) => commit(deleteBidFile(state, bid.id, fileId))}
                  onRename={(fileId, name) => commit(renameBidFile(state, bid.id, fileId, name))}
                />
                <DropUpload
                  colors={colors}
                  dragOver={dragOver}
                  setDragOver={setDragOver}
                  uploading={uploading}
                  onPick={() => pickAndUpload(folder.id)}
                  onFiles={(files) => uploadFiles(files, folder.id)}
                />
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <TextInput
                value={folderName}
                onChangeText={setFolderName}
                placeholder={folder && !isSystemFolderId(folder.id) ? 'Ny undermappe' : 'Ny mappe'}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              <View style={styles.row}>
                <TouchableOpacity onPress={addFolder} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
                  <Text style={{ color: '#fff' }}>Opprett mappe</Text>
                </TouchableOpacity>
                {folder && !isSystemFolderId(folder.id) ? (
                  <TouchableOpacity
                    onPress={() => {
                      const parent = folder.parentId || null;
                      setFolderId(parent);
                      setRenamingFolder(false);
                      commit(deleteBidFolder(state, bid.id, folder.id));
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.danger }}>Slett mappe</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Skjema fra bedriften</Text>
            {(state.formTemplates || []).map((template) => (
              <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Text style={{ color: colors.ink }}>{template.title}</Text>
                <Text style={{ color: colors.muted }}>{template.intro}</Text>
                <TouchableOpacity onPress={() => commit(pullFormTemplate(state, bid.id, template.id))} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Hent inn og arbeid</Text>
                </TouchableOpacity>
              </View>
            ))}
            {(bid.forms || []).map((form) => (
              <View key={form.id} style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{form.title}</Text>
                <Text style={{ color: colors.muted }}>{form.status === 'ferdig' ? 'Ferdig' : 'Under arbeid'}</Text>
                {form.fields.map((field) => (
                  <FormAnswer
                    key={field.id}
                    field={field}
                    colors={colors}
                    onChange={(next) => commit(setFormValue(state, bid.id, form.id, field.id, next))}
                    onPickFile={() => attachToField(form, field)}
                  />
                ))}
                <TouchableOpacity
                  onPress={() => commit(setFormStatus(state, bid.id, form.id, form.status === 'ferdig' ? 'apent' : 'ferdig'))}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.brand }}>{form.status === 'ferdig' ? 'Åpne igjen' : 'Merk ferdig'}</Text>
                </TouchableOpacity>
              </View>
            ))}
            <ExecutionPanel
              bid={bid}
              state={state}
              colors={colors}
              locked={locked}
              strategyLocked={strategyLocked}
              value={value}
              start={start}
              end={end}
              setValue={setValue}
              setStart={setStart}
              setEnd={setEnd}
              onCommit={commit}
            />
          </Section>
          <NotesSection colors={colors} value={notesDraft} onChange={setNotesDraft} onSave={() => commit(saveBidStepNotes(state, bid.id, 'arbeid', notesDraft))} />
        </View>
      ) : null}
      </View>
    </View>
  );
}

function Section({ title, icon, colors, well, children }) {
  return (
    <View style={[styles.section, { borderColor: colors.line, backgroundColor: well ? colors.card : colors.sunken }]}>
      <View style={styles.sectionHead}>
        {icon ? (
          <View style={[styles.sectionIcon, { backgroundColor: colors.brandSoft }]}>
            <Ionicons name={icon} size={16} color={colors.brand} />
          </View>
        ) : null}
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function NotesSection({ colors, value, onChange, onSave }) {
  return (
    <Section title="Egne notater" icon="create-outline" colors={colors}>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Skriv notater til dette steget"
        placeholderTextColor={colors.placeholder}
        multiline
        style={[styles.input, styles.long, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      <TouchableOpacity onPress={onSave} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
        <Text style={{ color: '#fff' }}>Lagre notater</Text>
      </TouchableOpacity>
    </Section>
  );
}

function WorkItemCard({
  item, bid, state, colors, people, openFileId, setOpenFileId, dragOver, setDragOver, uploading, onCommit, onPick, onFiles,
}) {
  const [open, setOpen] = useState(false);
  const attachments = filesForCheck(bid.files, item.id);
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, gap: 8 }]}>
      <TouchableOpacity onPress={() => setOpen((value) => !value)} accessibilityRole="button">
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{open ? '▾' : '▸'} {item.title}</Text>
        <Text style={{ color: colors.muted }}>{workItemKindLabel(item.kind)} · {workItemStatusLabel(item.status)}</Text>
        {item.ownerName ? <Text style={{ color: colors.muted }}>Eier: {item.ownerName}</Text> : null}
      </TouchableOpacity>
      {item.detail && open ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{item.detail}</Text> : null}
      {open ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Status</Text>
          <View style={styles.row}>
            {WORK_ITEM_STATUSES.map((status) => {
              const on = item.status === status.id;
              return (
                <TouchableOpacity
                  key={status.id}
                  onPress={() => onCommit(patchWorkItem(state, bid.id, item.id, { status: status.id }))}
                  accessibilityRole="button"
                  style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                >
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{status.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Eier</Text>
          <View style={{ gap: 6 }}>
            <OptionPicker
              options={people.map((person) => ({ id: person.id || person.uid, label: person.name }))}
              value={item.ownerId}
              onChange={(id) => {
                const person = people.find((row) => (row.id || row.uid) === id);
                if (!person) return;
                onCommit(patchWorkItem(state, bid.id, item.id, {
                  ownerId: id,
                  ownerName: person.name || '',
                }));
              }}
              title="Eier"
              clearable={false}
              small
            />
            {item.ownerId ? (
              <TouchableOpacity
                onPress={() => onCommit(patchWorkItem(state, bid.id, item.id, { ownerId: '', ownerName: '' }))}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>Fjern eier</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TypedInput
            value={item.note}
            onChangeText={(note) => onCommit(patchWorkItem(state, bid.id, item.id, { note }))}
            placeholder="Notat til sjekkpunktet"
            placeholderTextColor={colors.placeholder}
            multiline
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg, minHeight: 56 }]}
          />
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Vedlegg</Text>
          <DropUpload
            colors={colors}
            dragOver={dragOver}
            setDragOver={setDragOver}
            uploading={uploading}
            onPick={onPick}
            onFiles={onFiles}
          />
          <FileList
            files={attachments}
            colors={colors}
            openFileId={openFileId}
            onOpen={setOpenFileId}
            onDelete={(fileId) => onCommit(deleteBidFile(state, bid.id, fileId))}
            onRename={(fileId, name) => onCommit(renameBidFile(state, bid.id, fileId, name))}
          />
          <TouchableOpacity onPress={() => onCommit(removeWorkItem(state, bid.id, item.id))} accessibilityRole="button">
            <Text style={{ color: colors.danger }}>Fjern sjekkpunkt</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function DropUpload({ colors, dragOver, setDragOver, uploading, onPick, onFiles, compact }) {
  const webHandlers = Platform.OS === 'web' ? {
    onDragEnter: (event) => {
      event.preventDefault?.();
      setDragOver(true);
    },
    onDragOver: (event) => {
      event.preventDefault?.();
      setDragOver(true);
    },
    onDragLeave: () => setDragOver(false),
    onDrop: (event) => {
      event.preventDefault?.();
      setDragOver(false);
      const list = Array.from(event?.dataTransfer?.files || []).map((file) => ({
        name: file.name,
        mimeType: file.type,
        size: file.size,
        blob: file,
      }));
      if (list.length) onFiles(list);
    },
  } : {};

  return (
    <View
      {...webHandlers}
      style={[
        styles.drop,
        compact ? styles.dropCompact : null,
        {
          borderColor: dragOver ? colors.brand : colors.line,
          backgroundColor: dragOver ? colors.brandSoft : colors.bg,
        },
      ]}
    >
      {compact ? <Ionicons name="cloud-upload-outline" size={20} color={colors.brand} /> : null}
      <View style={compact ? styles.grow : null}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>
          {uploading ? 'Laster opp …' : 'Dra og slipp filer her'}
        </Text>
        <Text style={{ color: colors.muted, fontSize: compact ? 12 : 14 }}>eller velg fra PC (PDF, Word, Excel, bilder — inntil 25 MB)</Text>
      </View>
      <TouchableOpacity onPress={onPick} disabled={uploading} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand, opacity: uploading ? 0.7 : 1 }]}>
        <Text style={{ color: '#fff' }}>Velg filer</Text>
      </TouchableOpacity>
    </View>
  );
}

function ExpandSection({ title, items, colors, expandedId, onToggle, empty, showWeight }) {
  if (!items.length) {
    return (
      <View style={{ gap: 4 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: colors.muted }}>{empty}</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text>
      {items.map((row) => {
        const open = expandedId === row.id;
        return (
          <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <TouchableOpacity onPress={() => onToggle(open ? '' : row.id)} accessibilityRole="button">
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{open ? '▾' : '▸'} {row.title}</Text>
              {showWeight && row.weight ? <Text style={{ color: colors.brand }}>Vekt: {row.weight}</Text> : null}
              {row.summary ? <Text style={{ color: colors.muted }}>{row.summary}</Text> : null}
            </TouchableOpacity>
            {open && row.detail ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{row.detail}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

function StepInfo({ step, bid, dossier, stage, colors }) {
  const publishedQa = Array.isArray(dossier?.qa) ? dossier.qa.length : 0;
  const ownQuestions = Array.isArray(bid?.questions) ? bid.questions.length : 0;
  let facts = [];
  if (step === 'qa') {
    facts = [
      publishedQa ? `${publishedQa} publiserte spørsmål og svar` : 'Ingen spørsmål og svar er publisert ennå',
      ownQuestions ? `${ownQuestions} egne spørsmål` : '',
    ];
  } else if (step === 'arbeid') {
    const closed = stage === 'levert' || stage === 'kontrakt' || stage === 'tapt' || stage === 'trukket';
    const progress = workProgress(bid);
    facts = [
      closed ? 'Tilbudet er avsluttet' : 'Tilbudet er under arbeid',
      progress.items ? `${progress.done} av ${progress.items} sjekkpunkt ferdig` : '',
    ];
  } else {
    const access = {
      public: 'Offentlig tilgang',
      interest: 'Krever at interesse meldes',
      login: 'Krever innlogging',
    }[dossier?.ground?.access];
    facts = [
      dossier?.procedure ? `Prosedyre: ${dossier.procedure}` : '',
      dossier?.ground?.portal || '',
      access || '',
    ];
  }
  facts = facts.filter(Boolean);
  if (!facts.length) return null;
  return (
    <View style={[styles.facts, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {facts.map((fact, index) => (
        <Text key={fact} style={{ color: index ? colors.muted : colors.ink, fontSize: 13 }}>
          {index ? '· ' : ''}{fact}
        </Text>
      ))}
    </View>
  );
}

const TONE_BG = { danger: '#fef2f2', warn: '#fffbeb' };

/** Store fristfelt: antall dager igjen er det første øyet ser. */
function DeadlineTiles({ rows, colors }) {
  return (
    <View style={styles.tiles}>
      {rows.map((row) => {
        const info = deadlineCountdown(row.value);
        const color = info.tone === 'muted' ? colors.muted : toneColor(info.tone, colors);
        const background = TONE_BG[info.tone] || (info.tone === 'brand' ? colors.brandSoft : colors.bg);
        const spoken = info.ok
          ? `${row.label}: ${info.unit ? `${info.big} ${info.unit}` : info.big}, ${info.dateLabel}`
          : `${row.label} er ikke oppgitt`;
        return (
          <View
            key={row.id}
            accessibilityRole="summary"
            accessibilityLabel={spoken}
            style={[styles.tile, { borderColor: info.ok ? color : colors.line, backgroundColor: background }]}
          >
            <View style={styles.tileHead}>
              <Ionicons name={row.icon} size={15} color={color} />
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '600' }}>{row.label}</Text>
            </View>
            <View style={styles.tileCount}>
              <Text style={{ color, fontSize: info.unit ? 36 : 26, fontWeight: '800', lineHeight: 40 }}>{info.big}</Text>
              {info.unit ? <Text style={{ color, fontSize: 15, fontWeight: '600' }}>{info.unit}</Text> : null}
            </View>
            <Text style={{ color: info.ok ? colors.ink : colors.muted, fontSize: 13 }}>
              {info.ok ? info.dateLabel : (row.main ? 'Sett fristen under innstillinger.' : 'Står ikke i kunngjøringen.')}
            </Text>
            {info.ok && !info.passed && info.daysLeft != null && info.daysLeft <= 7 ? (
              <Text style={{ color, fontSize: 12, fontWeight: '700' }}>Fristen nærmer seg</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Meta({ icon, text, colors }) {
  return (
    <View style={styles.metaItem}>
      <Ionicons name={icon} size={16} color={colors.muted} />
      <Text style={{ color: colors.ink, fontSize: 14 }} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function Pill({ text, color, background }) {
  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

const TYPE_COLORS = {
  PDF: '#dc2626',
  DOC: '#2563eb',
  DOCX: '#2563eb',
  XLS: '#16a34a',
  XLSX: '#16a34a',
  ZIP: '#7c3aed',
};

/**
 * Nedlastede filer som en ryddig sti: Konkurransegrunnlag › mappe › fil.
 * Egne vedlegg ligger som egen mappe nederst, med opplasting inni.
 */
function FileTree({ root, groups, ownFiles, colors, openFileId, onOpen, onDelete, onRename, upload }) {
  const all = [...groups, { id: 'egne', name: 'Egne vedlegg', files: ownFiles, own: true }];
  const total = all.reduce((sum, group) => sum + group.files.length, 0);
  const stored = all.reduce((sum, group) => sum + group.files.filter((file) => file.status === 'lastet').length, 0);
  const [closed, setClosed] = useState({});
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');

  return (
    <View style={[styles.tree, { borderColor: colors.line }]}>
      <View style={[styles.treeBar, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
        <Ionicons name="folder-open" size={16} color={colors.brand} />
        <Text style={{ color: colors.ink, fontWeight: '700', flexShrink: 1 }}>{root}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 'auto' }}>
          {total === 1 ? '1 fil' : `${total} filer`} · {stored} lagret
        </Text>
      </View>
      {all.map((group) => {
        const open = !closed[group.id];
        return (
          <View key={group.id}>
            <TouchableOpacity
              onPress={() => setClosed((value) => ({ ...value, [group.id]: open }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: open }}
              style={[styles.folderRow, { borderColor: colors.line }]}
            >
              <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.muted} />
              <Ionicons name={open ? 'folder-open-outline' : 'folder-outline'} size={17} color={group.own ? colors.muted : colors.brand} />
              <Text style={{ color: colors.ink, fontWeight: '600', flexShrink: 1 }}>{group.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{group.files.length}</Text>
            </TouchableOpacity>
            {open ? (
              <View style={[styles.branch, { borderColor: colors.line }]}>
                {group.files.map((file) => {
                  const type = fileTypeLabel(file);
                  const preview = openFileId === file.id;
                  const editing = editId === file.id;
                  const canOpen = file.status === 'lastet' || !!file.url;
                  const statusColor = file.status === 'lastet' ? colors.success || colors.brand : colors.muted;
                  return (
                    <View key={file.id} style={[styles.fileRow, { borderColor: colors.line }]}>
                      <View style={styles.fileMain}>
                        <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[type] || '#64748b' }]}>
                          <Text style={styles.typeText} numberOfLines={1}>{type}</Text>
                        </View>
                        {editing ? (
                          <View style={[styles.row, styles.grow]}>
                            <TextInput
                              value={editName}
                              onChangeText={setEditName}
                              style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                            />
                            <TouchableOpacity onPress={() => { onRename?.(file.id, editName); setEditId(''); }} accessibilityRole="button">
                              <Text style={{ color: colors.brand }}>Lagre</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setEditId('')} accessibilityRole="button">
                              <Text style={{ color: colors.muted }}>Avbryt</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => (file.text ? onOpen(preview ? '' : file.id) : canOpen && openStoredFile(file))}
                            accessibilityRole="button"
                            style={styles.fileName}
                          >
                            <Text style={{ color: colors.ink, fontWeight: '600' }} numberOfLines={2}>{file.name}</Text>
                            <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
                              {root} / {group.name} / {file.name}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <Text style={[styles.fileStatus, { color: statusColor }]} numberOfLines={1}>
                          {file.status === 'portal' ? 'Kun på portalen' : statusLabel(file)}{file.sizeLabel ? ` · ${file.sizeLabel}` : ''}
                        </Text>
                        <View style={styles.fileActions}>
                          {file.text ? (
                            <IconAction icon={preview ? 'eye-off-outline' : 'eye-outline'} label={preview ? 'Skjul tekst' : 'Vis tekst'} color={colors.brand} onPress={() => onOpen(preview ? '' : file.id)} />
                          ) : null}
                          {canOpen ? (
                            <IconAction
                              icon="open-outline"
                              label={file.status === 'portal' || file.status === 'lenke' ? 'Åpne på portalen' : 'Åpne fil'}
                              color={colors.brand}
                              onPress={() => openStoredFile(file)}
                            />
                          ) : null}
                          {group.own && onRename && !editing ? (
                            <IconAction icon="pencil-outline" label="Endre navn" color={colors.brand} onPress={() => { setEditId(file.id); setEditName(file.name); }} />
                          ) : null}
                          {group.own && onDelete ? (
                            <IconAction icon="trash-outline" label="Slett" color={colors.danger} onPress={() => onDelete(file.id)} />
                          ) : null}
                        </View>
                      </View>
                      {preview && file.text ? <FoldedText text={formatNoticeText(file.text)} colors={colors} limit={700} /> : null}
                    </View>
                  );
                })}
                {!group.files.length && !group.own ? (
                  <Text style={{ color: colors.muted, fontSize: 13, paddingVertical: 6 }}>Tom mappe.</Text>
                ) : null}
                {group.own ? <View style={{ paddingVertical: 8 }}>{upload}</View> : null}
              </View>
            ) : null}
          </View>
        );
      })}
      {!groups.length ? (
        <Text style={{ color: colors.muted, fontSize: 13, padding: 12 }}>
          Ingen dokumenter er hentet ennå. Trykk «Hent anbudsgrunnlag», så legges filene inn i mappene her.
        </Text>
      ) : null}
    </View>
  );
}

function IconAction({ icon, label, color, onPress }) {
  const ref = React.useRef(null);
  useEffect(() => {
    if (ref.current && typeof ref.current.setAttribute === 'function') ref.current.setAttribute('title', label);
  }, [label]);
  return (
    <TouchableOpacity ref={ref} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.iconAction}>
      <Ionicons name={icon} size={17} color={color} />
    </TouchableOpacity>
  );
}

function AssignmentPanel({ bid, state, colors, locked, members, units, companies, onCommit, compact }) {
  const interest = bid.interest || {};
  const assignment = bid.assignment || {};
  const people = (members || []).filter((row) => row.role !== 'child');
  const unitRows = units || [];
  const companyRows = (companies || []).filter((row) => (
    row.id
    && row.id !== state?.companyId
    && row.organization !== false
  ));

  function assignPerson(person) {
    onCommit(updateBidAssignment(state, bid.id, {
      personId: person.id || person.uid || '',
      personName: person.name || '',
    }));
  }

  function assignUnit(unit) {
    onCommit(updateBidAssignment(state, bid.id, {
      unitId: unit.id,
      unitName: unit.name,
      unitKind: unit.kind || '',
      companyId: unit.companyId || '',
      companyName: unit.kind === 'underenhet' ? unit.name : assignment.companyName,
    }));
  }

  function assignCompany(company) {
    onCommit(updateBidAssignment(state, bid.id, {
      companyId: company.id,
      companyName: company.name,
      unitId: '',
      unitName: '',
      unitKind: '',
    }));
  }

  function clearAssignment() {
    onCommit(updateBidAssignment(state, bid.id, {
      personId: '',
      personName: '',
      unitId: '',
      unitName: '',
      unitKind: '',
      companyId: '',
      companyName: '',
    }));
  }

  return (
    <View style={{ gap: compact ? 8 : 8 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Ansvarlig og interesse</Text>
      <Text style={{ color: colors.muted, fontSize: compact ? 13 : 14 }}>
        {interest.contactName || interest.username
          ? `Interesse: ${[interest.contactName, interest.username].filter(Boolean).join(' · ')}`
          : 'Ingen portalinteresse ennå.'}
      </Text>
      {assignment.personName || assignment.unitName || assignment.companyName ? (
        <Text style={{ color: colors.ink, fontSize: compact ? 13 : 14 }}>
          {assignment.personName || '—'}
          {assignment.unitName ? `\n${assignment.unitName}` : ''}
          {assignment.companyName ? `\n${assignment.companyName}` : ''}
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>Ikke tildelt ennå.</Text>
      )}
      {!locked ? (
        <View style={{ gap: 8 }}>
          {people.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Person</Text>
              <OptionPicker
                options={people.map((person) => ({ id: person.id || person.uid, label: person.name }))}
                value={assignment.personId}
                onChange={(id) => {
                  const person = people.find((row) => (row.id || row.uid) === id);
                  if (person) assignPerson(person);
                }}
                title="Person"
                clearable={false}
                small
              />
            </View>
          ) : null}
          {unitRows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Avdeling / datterselskap</Text>
              <OptionPicker
                options={unitRows.map((unit) => ({ id: unit.id, label: unit.kind === 'underenhet' ? `${unit.name} (datter)` : unit.name }))}
                value={assignment.unitId}
                onChange={(id) => {
                  const unit = unitRows.find((row) => row.id === id);
                  if (unit) assignUnit(unit);
                }}
                title="Avdeling / datterselskap"
                clearable={false}
                small
              />
            </View>
          ) : null}
          {companyRows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Annet selskap</Text>
              <OptionPicker
                options={companyRows.map((company) => ({ id: company.id, label: company.name }))}
                value={assignment.companyId}
                onChange={(id) => {
                  const company = companyRows.find((row) => row.id === id);
                  if (company) assignCompany(company);
                }}
                title="Annet selskap"
                clearable={false}
                small
              />
            </View>
          ) : null}
          {(assignment.personName || assignment.unitName || assignment.companyName) ? (
            <TouchableOpacity onPress={clearAssignment} accessibilityRole="button">
              <Text style={{ color: colors.muted, fontSize: 13 }}>Fjern tildeling</Text>
            </TouchableOpacity>
          ) : null}
          {!people.length && !unitRows.length && !companyRows.length ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Legg til medlemmer eller enheter i selskapet for å tildele.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ExecutionPanel({
  bid, state, colors, locked, strategyLocked, value, start, end, setValue, setStart, setEnd, onCommit,
}) {
  const stage = bid.stage || 'planlegging';
  const checks = regulatoryChecks(bid);
  const blockers = stage === 'planlegging' ? executionBlockers(bid) : [];
  const canAward = stage === 'gjennomforing' || stage === 'levert';
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Status i konkurransen</Text>
      {STRATEGY_ITEMS.map((item) => {
        const on = !!bid.strategy?.[item.id];
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onCommit(toggleStrategy(state, bid.id, item.id))}
            disabled={strategyLocked}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: strategyLocked }}
          >
            <Text style={{ color: on ? colors.ink : colors.muted }}>{on ? '✓' : '○'} {item.label}</Text>
          </TouchableOpacity>
        );
      })}
      {checks.map((check) => (
        <Text key={check.id} style={{ color: check.ok ? colors.ink : (check.blocking ? colors.danger : colors.warn) }}>
          {check.ok ? '✓' : '·'} {check.label}: {check.detail}
        </Text>
      ))}
      {stage === 'planlegging' ? (
        <View style={{ gap: 6 }}>
          {blockers.length ? <Text style={{ color: colors.muted }}>Gjenstår før gjennomføring: {blockers.join(' · ')}</Text> : null}
          <TouchableOpacity onPress={() => onCommit(openExecution(state, bid.id))} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Start gjennomføring</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {(stage === 'planlegging' || stage === 'gjennomforing') ? (
        <TouchableOpacity onPress={() => onCommit(markSubmitted(state, bid.id))} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>Marker som levert</Text>
        </TouchableOpacity>
      ) : null}
      {canAward ? (
        <View style={{ gap: 6 }}>
          {stage === 'levert' ? (
            <Text style={{ color: colors.ink }}>Tilbudet er levert. Registrer vunnet kontrakt eller marker utfallet.</Text>
          ) : null}
          <TextInput value={value} onChangeText={setValue} placeholder="Kontraktssum" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <DateInput value={start} onChange={setStart} format="iso" placeholder="Oppstart" clearable />
          <DateInput value={end} onChange={setEnd} format="iso" placeholder="Overlevering" clearable />
          <TouchableOpacity onPress={() => onCommit(awardContract(state, bid.id, { value, start, end }))} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Registrer vunnet kontrakt</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!locked && (stage === 'planlegging' || stage === 'gjennomforing' || stage === 'levert') ? (
        <View style={styles.row}>
          <TouchableOpacity onPress={() => onCommit(markOutcome(state, bid.id, 'tapt'))} accessibilityRole="button">
            <Text style={{ color: colors.danger }}>Tapt</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onCommit(markOutcome(state, bid.id, 'trukket'))} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Trukket</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function FileList({ files, colors, openFileId, onOpen, onDelete, onRename }) {
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  if (!files.length) return <Text style={{ color: colors.muted }}>Ingen filer her ennå.</Text>;
  return (
    <View style={{ gap: 6 }}>
      {files.map((file) => {
        const open = openFileId === file.id;
        const editing = editId === file.id;
        return (
          <View key={file.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {editing ? (
              <View style={styles.row}>
                <TextInput
                  value={editName}
                  onChangeText={setEditName}
                  style={[styles.input, styles.grow, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                />
                <TouchableOpacity
                  onPress={() => {
                    onRename?.(file.id, editName);
                    setEditId('');
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.brand }}>Lagre</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEditId('')} accessibilityRole="button">
                  <Text style={{ color: colors.muted }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => onOpen(open ? '' : file.id)} accessibilityRole="button">
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{file.name}</Text>
                <Text style={{ color: colors.muted }}>{statusLabel(file)}{file.sizeLabel ? ` · ${file.sizeLabel}` : ''}</Text>
              </TouchableOpacity>
            )}
            {open && file.text ? <FoldedText text={formatNoticeText(file.text)} colors={colors} limit={700} /> : null}
            <View style={styles.row}>
              {file.status === 'lastet' || file.url ? (
                <TouchableOpacity onPress={() => openStoredFile(file)} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>{file.status === 'portal' || file.status === 'lenke' ? 'Åpne på portalen' : 'Åpne fil'}</Text>
                </TouchableOpacity>
              ) : null}
              {onRename && file.kind === 'egen' && !editing ? (
                <TouchableOpacity onPress={() => { setEditId(file.id); setEditName(file.name); }} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Endre navn</Text>
                </TouchableOpacity>
              ) : null}
              {onDelete ? (
                <TouchableOpacity onPress={() => onDelete(file.id)} accessibilityRole="button">
                  <Text style={{ color: colors.danger }}>Slett</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function FoldedText({ text, colors, limit = 280 }) {
  const [open, setOpen] = useState(false);
  const value = String(text || '');
  const long = value.length > limit;
  const shown = open || !long ? value : `${value.slice(0, limit).trim()} …`;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.ink, lineHeight: 22 }}>{shown}</Text>
      {long ? (
        <TouchableOpacity onPress={() => setOpen((current) => !current)} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{open ? 'Vis mindre' : 'Vis hele teksten'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16, width: '100%', maxWidth: 1240 },
  h: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  deadlineRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deadlineDate: { flexGrow: 1, flexBasis: 180 },
  deadlineTime: { flexGrow: 1, flexBasis: 140, minHeight: 44 },
  column: { width: '100%', gap: 14 },
  narrow: { width: '100%', maxWidth: 920, alignSelf: 'flex-start' },
  hero: { borderWidth: 1, borderRadius: 16, padding: 20, gap: 16, width: '100%' },
  heroBody: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  heroText: { flexGrow: 1, flexShrink: 1, flexBasis: 320, gap: 8 },
  heroLink: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  heroTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 1, flexBasis: 220, borderWidth: 1, borderLeftWidth: 5, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 2 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileCount: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, borderBottomWidth: 1 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2, marginBottom: -1 },
  tabCount: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tree: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  treeBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, flexWrap: 'wrap' },
  folderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  branch: { marginLeft: 25, marginRight: 12, marginBottom: 6, paddingLeft: 12, borderLeftWidth: 1 },
  fileRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  fileMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileName: { flex: 1, minWidth: 0 },
  fileStatus: { fontSize: 12, flexShrink: 0, maxWidth: 140, textAlign: 'right' },
  typeBadge: { width: 42, borderRadius: 6, paddingVertical: 4, alignItems: 'center' },
  typeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconAction: { padding: 6, borderRadius: 8 },
  dropCompact: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', padding: 12 },
  info: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  long: { minHeight: 120, textAlignVertical: 'top' },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  drop: {
    borderWidth: 1,
    borderStyle: Platform.OS === 'web' ? 'dashed' : 'solid',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
});
