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
  deadlineInfo,
  formatNoticeText,
  officialNoticeUrl,
  sourceLabel,
} from '../../src/anbud/noticeText';
import { pickDocument } from '../../src/utils/media';
import FormAnswer from './FormAnswer';

const FILE_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg,application/pdf,image/*';

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
}) {
  const [step, setStep] = useState('grunnlag');
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
  const deadline = deadlineInfo(dossier.submissionDeadline || bid.deadline);
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
  const stepIndex = BID_STEPS.findIndex((row) => row.id === step);
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
      const result = await interpretBidCompetition(bid, {
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

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.row}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Alle tilbud</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSettingsOpen((value) => !value)} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{settingsOpen ? 'Skjul innstillinger' : 'Innstillinger'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.h, { color: colors.ink }]}>{bid.title}</Text>
      <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
      <Text style={{ color: colors.brand, fontWeight: '600' }}>{STAGE_LABELS[stage] || 'Planlegging'}</Text>
      <DeadlineBanner deadline={deadline} colors={colors} compact />
      {noticeUrl ? (
        <TouchableOpacity onPress={() => Linking.openURL(noticeUrl)} accessibilityRole="link">
          <Text style={{ color: colors.brand }}>Åpne på {source}</Text>
        </TouchableOpacity>
      ) : null}
      {settingsOpen ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, gap: 10 }]}>
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
          <TextInput
            value={metaDeadline}
            onChangeText={setMetaDeadline}
            placeholder="Tilbudsfrist"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
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
      <View style={styles.row}>
        {BID_STEPS.map((item) => {
          const on = step === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => goStep(item.id)}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.row}>
        {stepIndex > 0 ? (
          <TouchableOpacity onPress={() => goStep(BID_STEPS[stepIndex - 1].id)} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Forrige steg</Text>
          </TouchableOpacity>
        ) : null}
        {stepIndex < BID_STEPS.length - 1 ? (
          <TouchableOpacity onPress={() => goStep(BID_STEPS[stepIndex + 1].id)} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Neste steg</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {!!message && <Text style={{ color: colors.brand }}>{message}</Text>}

      {step === 'grunnlag' ? (
        <View style={{ gap: 14 }}>
          <Section title="Seksjon 1 · Dokumenter" colors={colors} well>
            <Line label="Tilbudsfrist" value={dossier.submissionDeadline} colors={colors} />
            <Line label="Frist for spørsmål" value={dossier.questionDeadline} colors={colors} />
            <Line label="Prosedyre" value={dossier.procedure} colors={colors} />
            {dossier.description ? <FoldedText text={formatNoticeText(dossier.description)} colors={colors} /> : null}
            <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{busy ? 'Henter dokumenter …' : 'Hent dokumenter på nytt'}</Text>
            </TouchableOpacity>
            <FileList
              files={filesInFolder(bid.files, GROUND_FOLDER_ID)}
              colors={colors}
              openFileId={openFileId}
              onOpen={setOpenFileId}
            />
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Egne vedlegg</Text>
            <DropUpload
              colors={colors}
              dragOver={dragOver}
              setDragOver={setDragOver}
              uploading={uploading}
              onPick={() => pickAndUpload(GROUND_ATTACH_FOLDER_ID)}
              onFiles={(files) => uploadFiles(files, GROUND_ATTACH_FOLDER_ID)}
            />
            <FileList
              files={filesInFolder(bid.files, GROUND_ATTACH_FOLDER_ID)}
              colors={colors}
              openFileId={openFileId}
              onOpen={setOpenFileId}
              onDelete={(fileId) => commit(deleteBidFile(state, bid.id, fileId))}
              onRename={(fileId, name) => commit(renameBidFile(state, bid.id, fileId, name))}
            />
            {!groundFiles.length ? (
              <Text style={{ color: colors.muted }}>Last inn konkurransegrunnlaget her. Filene vises i dette feltet.</Text>
            ) : null}
          </Section>
          <Section title="Seksjon 2 · AI-tolkning og oppsummering" colors={colors}>
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
        <View style={{ gap: 14 }}>
          <Section title="Seksjon 1 · Innhold og filer" colors={colors} well>
            <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{busy ? 'Henter …' : 'Hent publiserte svar på nytt'}</Text>
            </TouchableOpacity>
            {dossier.qa?.length ? dossier.qa.map((row) => (
              <View key={`${row.question}-${row.answer}`} style={[styles.card, { borderColor: colors.line, backgroundColor: '#fff' }]}>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.question}</Text>
                <Text style={{ color: colors.ink }}>{row.answer || 'Svaret er ikke publisert ennå.'}</Text>
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
              <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: '#fff' }]}>
                <Text style={{ color: colors.ink }}>{row.question}</Text>
                <TextInput
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
          <Section title="Seksjon 2 · AI-tolkning av betydning" colors={colors}>
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
        <View style={{ gap: 14 }}>
          <Section title="Seksjon 1 · Hva som skal leveres" colors={colors} well>
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
                    style={[styles.card, { borderColor: colors.line, backgroundColor: '#fff' }]}
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
            <View style={styles.row}>
              {WORK_ITEM_KINDS.map((kind) => {
                const on = ownKind === kind.id;
                return (
                  <TouchableOpacity
                    key={kind.id}
                    onPress={() => setOwnKind(kind.id)}
                    accessibilityRole="button"
                    style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                  >
                    <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{kind.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
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
          <Section title="Seksjon 2 · Krav og kriterier" colors={colors}>
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
  );
}

function Section({ title, colors, well, children }) {
  return (
    <View style={[styles.section, well ? styles.well : styles.sectionCard, { borderColor: colors.line }]}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{title}</Text>
      {children}
    </View>
  );
}

function NotesSection({ colors, value, onChange, onSave }) {
  return (
    <Section title="Seksjon 3 · Egne notater" colors={colors}>
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
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: '#fff', gap: 8 }]}>
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
          <View style={styles.row}>
            {people.map((person) => {
              const id = person.id || person.uid;
              const on = item.ownerId === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => onCommit(patchWorkItem(state, bid.id, item.id, {
                    ownerId: id,
                    ownerName: person.name || '',
                  }))}
                  accessibilityRole="button"
                  style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                >
                  <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{person.name}</Text>
                </TouchableOpacity>
              );
            })}
            {item.ownerId ? (
              <TouchableOpacity
                onPress={() => onCommit(patchWorkItem(state, bid.id, item.id, { ownerId: '', ownerName: '' }))}
                accessibilityRole="button"
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>Fjern eier</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <TextInput
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

function DropUpload({ colors, dragOver, setDragOver, uploading, onPick, onFiles }) {
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
        {
          borderColor: dragOver ? colors.brand : colors.line,
          backgroundColor: dragOver ? colors.brandSoft : colors.bg,
        },
      ]}
    >
      <Text style={{ color: colors.ink, fontWeight: '600' }}>
        {uploading ? 'Laster opp …' : 'Dra og slipp filer her'}
      </Text>
      <Text style={{ color: colors.muted }}>eller velg fra PC (PDF, Word, Excel, bilder — inntil 25 MB)</Text>
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

function DeadlineBanner({ deadline, colors, compact }) {
  const color = toneColor(deadline.tone, colors);
  const urgent = deadline.tone === 'danger' || deadline.tone === 'warn';
  return (
    <View
      style={[compact ? styles.deadlineCompact : styles.deadlineBanner, {
        borderColor: color,
        backgroundColor: urgent ? colors.brandSoft : colors.card,
      }]}
      accessibilityRole="summary"
      accessibilityLabel={`${deadline.headline}. ${deadline.detail}`}
    >
      <Text style={{ color, fontSize: compact ? 20 : 28, fontWeight: '700', lineHeight: compact ? 24 : 32 }}>{deadline.headline}</Text>
      <Text style={{ color: colors.ink, fontSize: compact ? 13 : 15 }}>{deadline.detail}</Text>
      {deadline.daysLeft != null && deadline.daysLeft >= 0 && deadline.daysLeft <= 7 ? (
        <Text style={{ color, fontWeight: '600', fontSize: compact ? 12 : 14 }}>Fristen nærmer seg</Text>
      ) : null}
    </View>
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
              <View style={styles.row}>
                {people.map((person) => {
                  const on = assignment.personId === (person.id || person.uid);
                  return (
                    <TouchableOpacity
                      key={person.id || person.uid}
                      onPress={() => assignPerson(person)}
                      accessibilityRole="button"
                      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{person.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {unitRows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Avdeling / datterselskap</Text>
              <View style={styles.row}>
                {unitRows.map((unit) => {
                  const on = assignment.unitId === unit.id;
                  const label = unit.kind === 'underenhet' ? `${unit.name} (datter)` : unit.name;
                  return (
                    <TouchableOpacity
                      key={unit.id}
                      onPress={() => assignUnit(unit)}
                      accessibilityRole="button"
                      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}
          {companyRows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Annet selskap</Text>
              <View style={styles.row}>
                {companyRows.map((company) => {
                  const on = assignment.companyId === company.id;
                  return (
                    <TouchableOpacity
                      key={company.id}
                      onPress={() => assignCompany(company)}
                      accessibilityRole="button"
                      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 12 }}>{company.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
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
          <TextInput value={start} onChangeText={setStart} placeholder="Oppstart ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TextInput value={end} onChangeText={setEnd} placeholder="Overlevering ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
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

function Line({ label, value, colors }) {
  if (!value) return null;
  return <Text style={{ color: colors.ink }}>{label}: {value}</Text>;
}

const styles = StyleSheet.create({
  h: { fontSize: 22, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 160 },
  long: { minHeight: 120, textAlignVertical: 'top' },
  deadlineBanner: { borderWidth: 2, borderRadius: 14, padding: 14, gap: 4 },
  deadlineCompact: { borderWidth: 2, borderRadius: 12, padding: 12, gap: 4 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  section: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  well: { backgroundColor: '#ffffff', minHeight: 320 },
  sectionCard: { backgroundColor: '#f8fafc' },
  drop: {
    borderWidth: 1,
    borderStyle: Platform.OS === 'web' ? 'dashed' : 'solid',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    alignItems: 'flex-start',
  },
});
