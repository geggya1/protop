import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  choiceLabel,
  compareReviews,
  followUpTaskFromCase,
  formatNbDate,
  latestReviewsFor,
  localIsoDate,
  normalizeCase,
  normalizeHrFile,
  normalizeMemo,
  normalizeReview,
  normalizeTask,
  planFollowUpCases,
  REVIEW_STATUSES,
  TASK_STATUSES,
} from '../../src/hr/model';
import { printReview } from '../../src/hr/reviewPdf';
import { loadFilledDocs, peekFilledDocs } from '../../src/forms/filledStore';
import {
  REVIEW_FORM_KEY, casesFromReviewDoc, previousActionPlan, reviewActionPlan, reviewEntries, syncReviewRows,
} from '../../src/hr/reviewForms';
import HrFilledForm from './HrFilledForm';
import { DEFAULT_DOCUMENT_ACCEPT, pickDocument, uploadFile } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink,
} from './HrShared';

const TABS = [
  { id: 'cases', label: 'Saker' },
  { id: 'reviews', label: 'Samtaler' },
  { id: 'memos', label: 'Memo & filer' },
  { id: 'tasks', label: 'Oppgaver' },
];

const EMPTY_CASE = { title: '', description: '', priority: 'normal', dueDate: '', employeeVisible: false };
const EMPTY_MEMO = { title: '', body: '', author: '', employeeVisible: false, fileName: '', fileUrl: '' };
const EMPTY_TASK = { title: '', description: '', dueDate: '', status: 'open' };
const EMPTY_FILE = { name: '', url: '', employeeVisible: false };


export default function HrFollowUp({
  colors, employees, hr, canWrite, onPatch, lockedEmployeeId, familyId,
  focusCaseId, assigneeUid, assigneeName, onOpenTask, onCreateFollowUpTask, formKit = null,
}) {
  const [tab, setTab] = useState('cases');
  const [selectedCaseId, setSelectedCaseId] = useState(focusCaseId || '');
  const [linkingTask, setLinkingTask] = useState(false);
  const employeeId = String(lockedEmployeeId || '');
  const employeeIdRef = useRef(employeeId);
  employeeIdRef.current = employeeId;
  const [selectedReviewId, setSelectedReviewId] = useState('');
  const [uploading, setUploading] = useState(false);
  const people = useMemo(
    () => (employees || []).filter((e) => e?.company?.status !== 'deleted'),
    [employees],
  );

  const [caseDraft, setCaseDraft] = useState(EMPTY_CASE);
  // Medarbeidersamtalen: samme skjema og visning som under Skjemaer (HrFilledForm).
  // formKit fra HR-skjermen: { start (useHrFormStart), actor, company, logo }.
  const forms = formKit || {};
  const [formDocs, setFormDocs] = useState(() => (peekFilledDocs(familyId) || []).filter((row) => row.scope === 'hr'));
  const [openDoc, setOpenDoc] = useState(null);
  const [openNote, setOpenNote] = useState('');
  useEffect(() => {
    let live = true;
    if (familyId) loadFilledDocs(familyId).then((list) => { if (live) setFormDocs((list || []).filter((row) => row.scope === 'hr')); });
    return () => { live = false; };
  }, [familyId]);
  const [memoDraft, setMemoDraft] = useState(EMPTY_MEMO);
  const [taskDraft, setTaskDraft] = useState(EMPTY_TASK);
  const [fileDraft, setFileDraft] = useState(EMPTY_FILE);

  useEffect(() => {
    setSelectedReviewId('');
    setSelectedCaseId('');
    setCaseDraft(EMPTY_CASE);
    setOpenDoc(null);
    setMemoDraft(EMPTY_MEMO);
    setTaskDraft(EMPTY_TASK);
    setFileDraft(EMPTY_FILE);
  }, [employeeId]);

  useEffect(() => {
    if (!focusCaseId || !employeeId) return;
    setSelectedCaseId(focusCaseId);
    setTab('cases');
  }, [focusCaseId, employeeId]);

  function nameOf(id) {
    const hit = people.find((row) => row.id === id);
    return hit ? displayName(hit) : 'Uten person';
  }

  const personCases = useMemo(
    () => (hr.cases || []).filter((row) => !employeeId || row.employeeId === employeeId),
    [hr.cases, employeeId],
  );
  const selectedCase = personCases.find((row) => row.id === selectedCaseId) || null;

  async function linkTask(caseRow) {
    if (!canWrite || !caseRow || caseRow.taskId || linkingTask || !onCreateFollowUpTask) return;
    const draft = followUpTaskFromCase(caseRow, { assigneeUid, assigneeName });
    if (!draft) return;
    setLinkingTask(true);
    try {
      const taskId = await onCreateFollowUpTask(draft);
      if (!taskId) {
        showSaveToast?.('Kunne ikke opprette oppgave');
        return;
      }
      onPatch?.((state) => ({
        cases: planFollowUpCases(state.cases, caseRow, {
          taskId,
          assigneeUid,
          assigneeName,
        }).cases,
      }));
      showSaveToast?.('Oppgave opprettet');
    } catch {
      showSaveToast?.('Kunne ikke opprette oppgave');
    } finally {
      setLinkingTask(false);
    }
  }

  // Samtalene: utfylte samtaleskjema og eldre samtaler (registrert før skjemaet ble felles).
  const entries = useMemo(() => reviewEntries(hr.reviews, formDocs, employeeId), [hr.reviews, formDocs, employeeId]);
  const personReviews = useMemo(
    () => entries.filter((e) => e.kind === 'legacy').map((e) => e.review),
    [entries],
  );
  const selectedReview = personReviews.find((r) => r.id === selectedReviewId) || null;
  const lastPlan = useMemo(() => previousActionPlan(entries, openDoc?.id || ''), [entries, openDoc?.id]);
  const previousForSelected = useMemo(() => {
    if (!selectedReview) return null;
    const done = latestReviewsFor(selectedReview.employeeId, hr.reviews, 5)
      .filter((r) => r.id !== selectedReview.id && r.date < selectedReview.date);
    return done[0] || null;
  }, [selectedReview, hr.reviews]);
  const comparison = useMemo(
    () => (selectedReview ? compareReviews(selectedReview, previousForSelected) : null),
    [selectedReview, previousForSelected],
  );
  const personFiles = useMemo(
    () => (hr.files || []).filter((f) => f.employeeId === employeeId),
    [hr.files, employeeId],
  );
  const personMemos = useMemo(
    () => (hr.memos || []).filter((m) => !employeeId || m.employeeId === employeeId),
    [hr.memos, employeeId],
  );

  function newReview() {
    const employee = people.find((row) => row.id === employeeId) || null;
    const res = forms.start?.(REVIEW_FORM_KEY, employee, forms.actor);
    if (!res) return;
    setOpenDoc(res.doc);
    setOpenNote(res.approved ? '' : 'Malen er ikke godkjent ennå. Dokumentet får «Utkast» i hodet til en versjon er godkjent.');
  }

  // Samme speiling og samme sak fra handlingsplanen som under Skjemaer.
  function syncReview(doc, { removed = false } = {}) {
    onPatch?.((state) => ({
      reviews: syncReviewRows(state.reviews, doc, normalizeReview, { removed }),
      cases: removed ? state.cases : casesFromReviewDoc(state.cases, doc, normalizeCase, { formatDate: formatNbDate }),
    }));
  }

  async function uploadMemoFile() {
    if (!canWrite || !employeeId || !familyId || uploading) return;
    const forEmployeeId = employeeId;
    setUploading(true);
    try {
      const picked = await pickDocument({ accept: DEFAULT_DOCUMENT_ACCEPT });
      if (!picked) return;
      const path = `families/${familyId}/hr/${forEmployeeId}/${Date.now()}_${picked.name || 'fil'}`;
      const url = await uploadFile(path, picked, picked.mimeType || 'application/octet-stream');
      if (employeeIdRef.current !== forEmployeeId) {
        showSaveToast?.('Opplasting avbrutt — person byttet');
        return;
      }
      setMemoDraft((prev) => ({
        ...prev,
        fileName: picked.name || 'Dokument',
        fileUrl: url,
      }));
      showSaveToast?.('Fil lastet opp');
    } catch {
      showSaveToast?.('Kunne ikke laste opp fil');
    } finally {
      setUploading(false);
    }
  }

  async function uploadStandaloneFile() {
    if (!canWrite || !employeeId || !familyId || uploading) return;
    const forEmployeeId = employeeId;
    const visible = !!fileDraft.employeeVisible;
    setUploading(true);
    try {
      const picked = await pickDocument({ accept: DEFAULT_DOCUMENT_ACCEPT });
      if (!picked) return;
      const path = `families/${familyId}/hr/${forEmployeeId}/${Date.now()}_${picked.name || 'fil'}`;
      const url = await uploadFile(path, picked, picked.mimeType || 'application/octet-stream');
      if (employeeIdRef.current !== forEmployeeId) {
        showSaveToast?.('Opplasting avbrutt — person byttet');
        return;
      }
      const file = normalizeHrFile({
        employeeId: forEmployeeId,
        name: picked.name || 'Dokument',
        url,
        mime: picked.mimeType,
        size: picked.size,
        kind: 'document',
        employeeVisible: visible,
      });
      onPatch?.((state) => ({ files: [file, ...(state.files || [])] }));
      showSaveToast?.('Fil lagret på ansatt');
    } catch {
      showSaveToast?.('Kunne ikke lagre fil');
    } finally {
      setUploading(false);
    }
  }

  function saveManualFile() {
    if (!canWrite || !employeeId) return;
    if (!fileDraft.name.trim() && !fileDraft.url.trim()) return;
    const file = normalizeHrFile({
      employeeId,
      name: fileDraft.name || 'Dokument',
      url: fileDraft.url,
      kind: 'document',
      employeeVisible: !!fileDraft.employeeVisible,
    });
    onPatch?.((state) => ({ files: [file, ...(state.files || [])] }));
    setFileDraft(EMPTY_FILE);
  }

  return (
    <View style={styles.page} nativeID="hr-followup">
      <View style={styles.chips}>
        {TABS.map((item) => (
          <HrChip key={item.id} nativeID={`hr-follow-tab-${item.id}`} colors={colors} label={item.label} active={tab === item.id} onPress={() => setTab(item.id)} />
        ))}
      </View>

      {!employeeId ? (
        <HrCard colors={colors}>
          <EmptyHint colors={colors} text="Velg en ansatt i personellisten for å følge opp." />
        </HrCard>
      ) : null}

      {employeeId && tab === 'cases' ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Saker til oppfølging" />
          {personCases.map((row) => (
            <RowLink
              key={row.id}
              nativeID={`hr-follow-case-${row.id}`}
              colors={colors}
              title={row.title}
              subtitle={[
                nameOf(row.employeeId),
                choiceLabel(CASE_PRIORITIES, row.priority),
                row.assigneeName ? `oppgave til ${row.assigneeName}` : (row.taskId ? 'oppgave opprettet' : ''),
                row.sourceReviewId ? 'fra samtale' : '',
              ].filter(Boolean).join(' · ')}
              meta={choiceLabel(CASE_STATUSES, row.status)}
              onPress={() => setSelectedCaseId(row.id)}
            />
          ))}
          {selectedCase ? (
            <View nativeID="hr-case-detail" style={[styles.detail, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={[styles.compareTitle, { color: colors.ink }]}>{selectedCase.title}</Text>
              {selectedCase.description ? (
                <Text style={[styles.body, { color: colors.ink }]}>{selectedCase.description}</Text>
              ) : null}
              <Text style={[styles.hint, { color: colors.muted }]}>
                {[
                  selectedCase.dueDate ? `Frist ${formatNbDate(selectedCase.dueDate)}` : '',
                  selectedCase.assigneeName ? `Ansvar ${selectedCase.assigneeName}` : '',
                  choiceLabel(CASE_STATUSES, selectedCase.status),
                ].filter(Boolean).join(' · ')}
              </Text>
              <View style={styles.chips}>
                {selectedCase.taskId ? (
                  <HrButton
                    colors={colors}
                    nativeID="hr-open-task"
                    label="Åpne oppgave"
                    primary
                    icon="checkbox-outline"
                    onPress={() => onOpenTask?.(selectedCase.taskId)}
                  />
                ) : null}
                {canWrite && !selectedCase.taskId ? (
                  <HrButton
                    colors={colors}
                    nativeID="hr-create-task"
                    label={linkingTask ? 'Oppretter oppgave…' : 'Opprett oppgave'}
                    primary
                    icon="checkbox-outline"
                    disabled={linkingTask || !onCreateFollowUpTask}
                    onPress={() => linkTask(selectedCase)}
                  />
                ) : null}
                {canWrite ? (
                  <HrButton
                    colors={colors}
                    label={selectedCase.status === 'closed' ? 'Gjenåpne sak' : 'Lukk sak'}
                    onPress={() => {
                      const status = selectedCase.status === 'closed' ? 'open' : 'closed';
                      onPatch?.((state) => ({
                        cases: (state.cases || []).map((item) => (
                          item.id === selectedCase.id ? { ...item, status } : item
                        )),
                      }));
                    }}
                  />
                ) : null}
              </View>
            </View>
          ) : null}
          {personCases.length === 0
            ? <EmptyHint colors={colors} text="Ingen saker ennå." />
            : null}
          {canWrite && employeeId ? (
            <View style={styles.form}>
              <HrField colors={colors} label="Tittel" value={caseDraft.title} onChangeText={(title) => setCaseDraft((p) => ({ ...p, title }))} />
              <HrField colors={colors} label="Beskrivelse" value={caseDraft.description} onChangeText={(description) => setCaseDraft((p) => ({ ...p, description }))} multiline />
              <HrField colors={colors} label="Frist" date="iso" clearable value={caseDraft.dueDate} onChangeText={(dueDate) => setCaseDraft((p) => ({ ...p, dueDate }))} />
              <View style={styles.chips}>
                {CASE_PRIORITIES.map((p) => (
                  <HrChip key={p.id} colors={colors} label={p.label} active={caseDraft.priority === p.id} onPress={() => setCaseDraft((prev) => ({ ...prev, priority: p.id }))} />
                ))}
              </View>
              <HrButton
                colors={colors}
                label="Opprett sak"
                primary
                icon="add-outline"
                onPress={() => {
                  if (!caseDraft.title.trim()) return;
                  const row = normalizeCase({ ...caseDraft, employeeId });
                  onPatch?.((state) => ({ cases: [row, ...(state.cases || [])] }));
                  setCaseDraft(EMPTY_CASE);
                }}
              />
            </View>
          ) : null}
        </HrCard>
      ) : null}

      {employeeId && tab === 'reviews' && openDoc ? (
        <View nativeID="hr-review-form" style={styles.reviewForm}>
          {lastPlan?.plan?.length ? (
            <HrCard colors={colors}>
              <HrSectionTitle
                colors={colors}
                title="Handlingsplan fra forrige samtale"
                subtitle={`${formatNbDate(lastPlan.date)} · gå gjennom den under tema 1`}
              />
              {lastPlan.plan.map((row, i) => (
                <Text key={`${i}-${row.tiltak.slice(0, 12)}`} style={[styles.body, { color: colors.ink }]}>
                  {[`${i + 1}. ${row.tiltak}`, row.ansvar && `ansvar: ${row.ansvar}`, row.frist && `frist: ${formatNbDate(row.frist)}`].filter(Boolean).join(' · ')}
                </Text>
              ))}
            </HrCard>
          ) : null}
          <HrFilledForm
            key={openDoc.id}
            colors={colors}
            familyId={familyId}
            doc={openDoc}
            onDoc={setOpenDoc}
            canWrite={canWrite}
            actor={forms.actor}
            company={forms.company}
            logo={forms.logo?.dataUrl || ''}
            initialNote={openNote}
            canDelete={formDocs.some((row) => row.id === openDoc.id)}
            onStored={(doc, list) => {
              if (list) setFormDocs(list.filter((row) => row.scope === 'hr'));
              else setFormDocs((rows) => [doc, ...rows.filter((row) => row.id !== doc.id)]);
              syncReview(doc);
            }}
            onDeleted={(doc, list) => {
              if (list) setFormDocs(list.filter((row) => row.scope === 'hr'));
              syncReview(doc, { removed: true });
              setOpenDoc(null);
            }}
            onBack={() => { setOpenDoc(null); setOpenNote(''); }}
            backLabel="Alle samtaler"
          />
        </View>
      ) : null}

      {employeeId && tab === 'reviews' && !openDoc ? (
        <>
          <HrCard colors={colors}>
            <HrSectionTitle
              colors={colors}
              title="Medarbeidersamtaler"
              subtitle="KS-skjemaet «Medarbeidersamtale», samme skjema som under Skjemaer. Handlingsplanen blir sak når samtalen er ferdig."
              right={canWrite && forms.start ? (
                <HrButton colors={colors} primary icon="add" label="Ny samtale" onPress={newReview} nativeID="hr-review-new" />
              ) : null}
            />
            {entries.map((entry) => (entry.kind === 'form' ? (
              <RowLink
                key={entry.id}
                colors={colors}
                title={`Medarbeidersamtale ${formatNbDate(entry.date)}`}
                subtitle={(() => {
                  const plan = reviewActionPlan(entry.doc);
                  return plan.length ? `Handlingsplan: ${plan.map((r) => r.tiltak).join(' · ')}` : 'Ingen tiltak i handlingsplanen';
                })()}
                meta={entry.status === 'done' ? 'Ferdig' : 'Utkast'}
                onPress={() => { setOpenDoc(entry.doc); setOpenNote(''); }}
                nativeID={`hr-review-${entry.id}`}
              />
            ) : (
              <RowLink
                key={entry.id}
                colors={colors}
                title={`Samtale ${formatNbDate(entry.date)} (eldre format)`}
                subtitle={entry.review.summary || entry.review.goals || 'Uten sammendrag'}
                meta={choiceLabel(REVIEW_STATUSES, entry.review.status)}
                onPress={() => setSelectedReviewId(entry.id)}
              />
            )))}
            {entries.length === 0 ? <EmptyHint colors={colors} text="Ingen samtaler registrert." /> : null}
          </HrCard>

          {selectedReview ? (
            <HrCard colors={colors}>
              <HrSectionTitle
                colors={colors}
                title={`Samtale ${formatNbDate(selectedReview.date)}`}
                subtitle={`${nameOf(selectedReview.employeeId)} · registrert før samtalene ble ført i KS-skjemaet`}
              />
              <Text style={[styles.body, { color: colors.ink }]}>
                {[
                  selectedReview.interviewer && `Partner: ${selectedReview.interviewer}`,
                  selectedReview.wellbeing && `Trivsel: ${selectedReview.wellbeing}`,
                  selectedReview.summary,
                  selectedReview.goals && `Mål: ${selectedReview.goals}`,
                  selectedReview.followUps && `Oppfølging: ${selectedReview.followUps}`,
                ].filter(Boolean).join('\n\n')}
              </Text>
              <View style={styles.chips}>
                <HrButton
                  colors={colors}
                  label="Skriv ut / PDF"
                  icon="print-outline"
                  onPress={() => printReview(selectedReview, {
                    employeeName: nameOf(selectedReview.employeeId),
                  })}
                />
              </View>
              {comparison?.hasChanges ? (
                <View style={styles.compare}>
                  <Text style={[styles.compareTitle, { color: colors.ink }]}>
                    {`Avvik mot forrige (${formatNbDate(comparison.previousDate)})`}
                  </Text>
                  {comparison.deltas.filter((d) => d.changed).map((d) => (
                    <View key={d.key} style={[styles.delta, { borderColor: colors.line }]}>
                      <Text style={[styles.deltaLabel, { color: colors.muted }]}>{d.label}</Text>
                      {d.previous ? (
                        <Text style={[styles.deltaPrev, { color: colors.muted }]}>{`Før: ${d.previous}`}</Text>
                      ) : null}
                      <Text style={[styles.deltaCur, { color: colors.ink }]}>{`Nå: ${d.current || '—'}`}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </HrCard>
          ) : null}
        </>
      ) : null}

      {employeeId && tab === 'memos' ? (
        <>
          <HrCard colors={colors}>
            <HrSectionTitle colors={colors} title="Memo og notater" subtitle="HR-notater kan holdes private eller deles med den ansatte" />
            {personMemos.map((row) => (
              <RowLink
                key={row.id}
                colors={colors}
                title={row.title}
                subtitle={`${nameOf(row.employeeId)} · ${row.body}${(row.attachments || []).length ? ` · ${(row.attachments || []).length} fil(er)` : ''}`}
                meta={row.employeeVisible ? 'Synlig' : 'Kun HR'}
                onPress={() => {}}
              />
            ))}
            {personMemos.length === 0 ? <EmptyHint colors={colors} text="Ingen memo ennå." /> : null}
            {canWrite && employeeId ? (
              <View style={styles.form}>
                <HrField colors={colors} label="Tittel" value={memoDraft.title} onChangeText={(title) => setMemoDraft((p) => ({ ...p, title }))} />
                <HrField colors={colors} label="Forfatter" value={memoDraft.author} onChangeText={(author) => setMemoDraft((p) => ({ ...p, author }))} />
                <HrField colors={colors} label="Notat" value={memoDraft.body} onChangeText={(body) => setMemoDraft((p) => ({ ...p, body }))} multiline />
                <HrChip
                  colors={colors}
                  label={memoDraft.employeeVisible ? 'Synlig for ansatt' : 'Kun HR'}
                  active={!!memoDraft.employeeVisible}
                  onPress={() => setMemoDraft((p) => ({ ...p, employeeVisible: !p.employeeVisible }))}
                />
                <View style={styles.chips}>
                  <HrButton
                    colors={colors}
                    label={uploading ? 'Laster…' : 'Last opp fil til memo'}
                    icon="attach-outline"
                    disabled={uploading}
                    onPress={uploadMemoFile}
                  />
                </View>
                {memoDraft.fileUrl ? (
                  <Text style={[styles.hint, { color: colors.muted }]}>{`Vedlegg: ${memoDraft.fileName}`}</Text>
                ) : null}
                <HrButton
                  colors={colors}
                  label="Lagre memo"
                  primary
                  onPress={() => {
                    if (!memoDraft.title.trim() && !memoDraft.body.trim()) return;
                    const attachments = memoDraft.fileUrl
                      ? [{ name: memoDraft.fileName || 'Dokument', url: memoDraft.fileUrl }]
                      : [];
                    const row = normalizeMemo({ ...memoDraft, employeeId, attachments });
                    onPatch?.((state) => {
                      const files = attachments.length
                        ? [
                          normalizeHrFile({
                            employeeId,
                            name: attachments[0].name,
                            url: attachments[0].url,
                            memoId: row.id,
                            kind: 'memo',
                          }),
                          ...(state.files || []),
                        ]
                        : state.files;
                      return { memos: [row, ...(state.memos || [])], files };
                    });
                    setMemoDraft(EMPTY_MEMO);
                  }}
                />
              </View>
            ) : null}
          </HrCard>

          <HrCard colors={colors}>
            <HrSectionTitle colors={colors} title="Filer på ansatt" subtitle="Dokumenter lagret på personnivå" />
            {personFiles.map((file) => (
              <RowLink
                key={file.id}
                colors={colors}
                title={file.name}
                subtitle={file.kind || 'Dokument'}
                meta={file.url ? 'Lagret' : ''}
                icon="document-attach-outline"
                onPress={() => {}}
              />
            ))}
            {personFiles.length === 0 ? <EmptyHint colors={colors} text="Ingen filer på denne personen." /> : null}
            {canWrite && employeeId ? (
              <View style={styles.form}>
                <HrButton
                  colors={colors}
                  label={uploading ? 'Laster…' : 'Last opp fil'}
                  primary
                  icon="cloud-upload-outline"
                  disabled={uploading}
                  onPress={uploadStandaloneFile}
                />
                <HrChip
                  colors={colors}
                  label={fileDraft.employeeVisible ? 'Synlig på Min side' : 'Kun HR'}
                  active={!!fileDraft.employeeVisible}
                  onPress={() => setFileDraft((p) => ({ ...p, employeeVisible: !p.employeeVisible }))}
                />
                <HrField colors={colors} label="Eller filnavn" value={fileDraft.name} onChangeText={(name) => setFileDraft((p) => ({ ...p, name }))} />
                <HrField colors={colors} label="Dokument-URL" value={fileDraft.url} onChangeText={(url) => setFileDraft((p) => ({ ...p, url }))} />
                <HrButton colors={colors} label="Lagre filreferanse" onPress={saveManualFile} />
              </View>
            ) : null}
          </HrCard>
        </>
      ) : null}

      {employeeId && tab === 'tasks' ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Oppgaver og gjøremål" subtitle="Tildeles den enkelte ansatte og synlig på Min side" />
          {(hr.tasks || []).filter((row) => !employeeId || row.employeeId === employeeId).map((row) => (
            <RowLink
              key={row.id}
              colors={colors}
              title={row.title}
              subtitle={`${nameOf(row.employeeId)}${row.dueDate ? ` · frist ${formatNbDate(row.dueDate)}` : ''}`}
              meta={choiceLabel(TASK_STATUSES, row.status)}
              onPress={() => {
                if (!canWrite) return;
                const status = row.status === 'done' ? 'open' : 'done';
                onPatch?.((state) => ({
                  tasks: (state.tasks || []).map((item) => (item.id === row.id ? { ...item, status } : item)),
                }));
              }}
            />
          ))}
          {(hr.tasks || []).filter((row) => !employeeId || row.employeeId === employeeId).length === 0
            ? <EmptyHint colors={colors} text="Ingen oppgaver tildelt." />
            : null}
          {canWrite && employeeId ? (
            <View style={styles.form}>
              <HrField colors={colors} label="Oppgave" value={taskDraft.title} onChangeText={(title) => setTaskDraft((p) => ({ ...p, title }))} />
              <HrField colors={colors} label="Beskrivelse" value={taskDraft.description} onChangeText={(description) => setTaskDraft((p) => ({ ...p, description }))} multiline />
              <HrField colors={colors} label="Frist" date="iso" clearable value={taskDraft.dueDate} onChangeText={(dueDate) => setTaskDraft((p) => ({ ...p, dueDate }))} />
              <HrButton
                colors={colors}
                label="Tildel oppgave"
                primary
                icon="checkbox-outline"
                onPress={() => {
                  if (!taskDraft.title.trim()) return;
                  const row = normalizeTask({ ...taskDraft, employeeId, employeeVisible: true });
                  onPatch?.((state) => ({ tasks: [row, ...(state.tasks || [])] }));
                  setTaskDraft(EMPTY_TASK);
                }}
              />
            </View>
          ) : null}
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 10, marginTop: 8 },
  body: { fontSize: 14, lineHeight: 21 },
  hint: { fontSize: 12, lineHeight: 17 },
  detail: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  reviewForm: { gap: 12 },
  compare: { gap: 8, marginTop: 4 },
  compareTitle: { fontSize: 14, fontWeight: '600' },
  delta: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  deltaLabel: { fontSize: 12, fontWeight: '600' },
  deltaPrev: { fontSize: 13, lineHeight: 18 },
  deltaCur: { fontSize: 13, lineHeight: 18 },
});
