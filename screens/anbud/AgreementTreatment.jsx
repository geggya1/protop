import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLayout } from '../../src/theme';
import { showSaveToast } from '../../src/ui/saveToast';
import InfoButton from '../../components/InfoButton';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import {
  acceptProposals,
  acceptRemarks,
  addAgreementNote,
  agreementMovements,
  agreementNoticeText,
  agreementTemplates,
  bidsAwaitingAgreement,
  createAgreementCase,
  deleteAgreementNote,
  editAgreementNote,
  kindCaseLabel,
  publicAgreementView,
  publishAgreementVersion,
  returnAgreement,
  sendAgreement,
  setAgreementField,
  signAgreement,
  statusLabel,
  visibleNotes,
  visibleProposals,
} from '../../src/anbud/agreementCase';
import { agreementFileBase, agreementToPdf, agreementToWordHtml } from '../../src/anbud/agreementExport';
import { actOnAgreementShare, notifyAgreementParty, publishAgreementShare } from '../../src/anbud/agreementClient';
import { agreementResponsiblePeople } from '../../src/anbud/customers';
import { mergeAnbudStates } from '../../src/anbud/model';
import { processStepsForAgreement } from '../../src/anbud/processTrail';
import { flushAnbudState, loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { watchEmployees } from '../../src/employees/storage';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { createProject } from '../../src/project/engine';
import AgreementCustomerField from './AgreementCustomerField';
import AgreementPersonField from './AgreementPersonField';
import ProcessTrail from './ProcessTrail';

function statusTone(status, colors) {
  if (status === 'signert') return { bg: colors.successSoft, ink: colors.success };
  if (status === 'merknader') return { bg: colors.starSoft, ink: colors.warn };
  if (status === 'hos-motpart') return { bg: colors.brandSoft, ink: colors.brand };
  return { bg: colors.sunken, ink: colors.muted };
}

function showValue(field) {
  const value = field?.value;
  if (value == null || value === '') return '';
  if (field.kind === 'check') return value ? 'Ja' : 'Nei';
  if (Array.isArray(value)) {
    return value.map((id) => (field.options || []).find((row) => row.id === id)?.label || id).join(', ');
  }
  if (typeof value === 'object') return value.name || '';
  return String(value);
}

function download(filename, mime, content) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  return true;
}

function Chip({ colors, on, label, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}>
      <Text style={{ color: colors.ink, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AgreementTreatment({
  companyId,
  company,
  members = [],
  colors,
  party = 'avsender',
  shareToken = '',
  sharedRow = null,
  onShared,
  onRegisterExisting,
  shellIntent = null,
  onClearIntent,
  seedDraft = null,
  onSeedDraftConsumed,
  onRequestCreate,
}) {
  const { user } = useApp();
  const { isPhone } = useLayout();
  const [state, setState] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [versionNo, setVersionNo] = useState(0);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    kind: 'oppdrag',
    templateId: '',
    templateTitle: '',
    customerId: '',
    customerName: '',
    bidId: '',
    projectId: '',
    parentId: '',
    ownerUid: '',
    email: '',
    createProject: false,
  });
  const [composer, setComposer] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [editBody, setEditBody] = useState('');
  const [signerName, setSignerName] = useState('');
  const [fieldDrafts, setFieldDrafts] = useState({});
  const [showDocument, setShowDocument] = useState(false);
  const fieldDraftRef = useRef({});
  const returnIntentHandled = useRef('');
  const actorName = party === 'motpart'
    ? (signerName || sharedRow?.counterparty?.personName || 'Motpart')
    : (user?.displayName || user?.email || 'Avsender');
  const actorUid = user?.uid || '';

  useEffect(() => {
    if (party !== 'avsender' || !companyId) return undefined;
    let live = true;
    loadAnbudState(companyId).then((loaded) => { if (live) setState(loaded); });
    const ref = doc(db, 'families', companyId, 'anbud', 'state');
    const stop = onSnapshot(ref, (snap) => {
      const remote = snap.data()?.state;
      if (!remote) return;
      setState((current) => (current ? mergeAnbudStates(current, remote) : remote));
    }, () => {});
    return () => { live = false; stop(); };
  }, [companyId, party]);

  useEffect(() => {
    if (!companyId || party !== 'avsender') return undefined;
    return watchEmployees(companyId, setEmployees);
  }, [companyId, party]);

  useEffect(() => {
    if (!companyId || party !== 'avsender') return undefined;
    loadProjectState(companyId).then((loaded) => {
      setProjects((loaded?.projects || []).filter((row) => row.status !== 'arkivert'));
    });
    return undefined;
  }, [companyId, party]);

  const people = useMemo(() => agreementResponsiblePeople(members, employees), [members, employees]);
  const templates = agreementTemplates(state);
  const cases = state?.agreementCases || [];
  const selected = party === 'motpart'
    ? sharedRow
    : cases.find((row) => row.id === selectedId) || null;
  const view = selected ? publicAgreementView(selected, party) : null;
  const version = (view?.versions || []).find((item) => item.number === (versionNo || view?.version)) || view?.versions?.at(-1);
  const showingCurrent = !version || version.number === view?.version;
  const notes = (view ? visibleNotes(view, party) : []).filter((item) => !version || item.version === version.number);
  const proposals = (view ? visibleProposals(view, party) : []).filter((item) => item.sentAt && (!version || item.version === version.number));
  const movements = view ? agreementMovements(view, party) : [];
  const waitingBids = bidsAwaitingAgreement(state);
  const selectedTemplate = templates.find((row) => row.id === draft.templateId) || null;
  const trailDraft = {
    ...draft,
    templateTitle: selectedTemplate?.title || draft.templateTitle || '',
    customerName: draft.customerName
      || (state?.customers || []).find((row) => row.id === draft.customerId)?.name
      || '',
  };
  const processSteps = processStepsForAgreement(view || selected, party === 'avsender' && !selected ? trailDraft : null);
  const canLockDraft = !!(draft.customerId && draft.templateId && String(draft.email || '').trim());

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
    if (!bad && text) showSaveToast(text);
  }

  useEffect(() => {
    if (party !== 'avsender' || !shellIntent || shellIntent.type !== 'agreementTemplateReady') return;
    const key = `${shellIntent.templateId || ''}:${shellIntent.nonce || ''}`;
    if (returnIntentHandled.current === key) return;
    returnIntentHandled.current = key;
    const returned = shellIntent.returnDraft && typeof shellIntent.returnDraft === 'object'
      ? shellIntent.returnDraft
      : {};
    const template = templates.find((row) => row.id === shellIntent.templateId)
      || (state?.formTemplates || []).find((row) => row.id === shellIntent.templateId);
    setSelectedId('');
    setDraft((current) => ({
      ...current,
      kind: returned.kind || current.kind,
      customerId: returned.customerId || current.customerId,
      customerName: returned.customerName || current.customerName,
      email: returned.email || current.email,
      createProject: typeof returned.createProject === 'boolean' ? returned.createProject : current.createProject,
      parentId: returned.parentId || current.parentId,
      bidId: returned.bidId || current.bidId,
      projectId: returned.projectId || current.projectId,
      templateId: shellIntent.templateId || returned.templateId || current.templateId,
      templateTitle: template?.title || returned.templateTitle || current.templateTitle || '',
    }));
    setNote(template
      ? `Avtalemalen «${template.title}» er klar. Lås utkastet for å fortsette.`
      : 'Avtalemalen er lagret. Velg den og lås utkastet.');
    setNoteBad(false);
    if (template) showSaveToast(`Avtalemalen «${template.title}» er klar.`);
    onClearIntent?.();
  }, [shellIntent, party, state, templates, onClearIntent]);

  useEffect(() => {
    if (!draft.templateId || draft.templateTitle || !templates.length) return;
    const match = templates.find((row) => row.id === draft.templateId);
    if (match) setDraft((current) => (current.templateId === match.id ? { ...current, templateTitle: match.title } : current));
  }, [draft.templateId, draft.templateTitle, templates]);

  useEffect(() => {
    if (!seedDraft || typeof seedDraft !== 'object') return;
    setSelectedId('');
    setDraft((current) => ({
      ...current,
      kind: seedDraft.kind || current.kind,
      customerId: seedDraft.customerId || '',
      customerName: seedDraft.customerName || '',
      email: seedDraft.email || '',
      parentId: seedDraft.parentId || '',
      createProject: !!seedDraft.createProject,
      templateId: seedDraft.templateId || '',
      templateTitle: seedDraft.templateTitle || '',
      bidId: seedDraft.bidId || '',
      projectId: seedDraft.projectId || '',
    }));
    setNote('Utkastet er klart. Lås for å starte behandlingen med motparten.');
    setNoteBad(false);
    onSeedDraftConsumed?.();
  }, [seedDraft, onSeedDraftConsumed]);

  async function commitLocal(result, movement) {
    if (!result?.ok) {
      say(result?.error || 'Kunne ikke lagre avtalen.', true);
      return null;
    }
    const saved = await saveAnbudState(result.state, companyId);
    setState(saved);
    setSelectedId(result.row?.id || selectedId);
    if (result.row?.version) setVersionNo(result.row.version);
    try {
      await flushAnbudState(companyId);
    } catch (error) {
      say(`Lagret på enheten. Synk feilet: ${error?.message || 'ukjent feil'}`, true);
      return result.row;
    }
    if (movement && result.row) {
      const action = result.row.status === 'signert' ? 'forseglet' : movement;
      const detail = agreementNoticeText(result.row, action);
      try {
        const shared = await publishAgreementShare({ companyId, caseId: result.row.id });
        await notifyAgreementParty({
          companyId,
          email: result.row.counterparty?.email,
          name: result.row.counterparty?.name,
          title: result.row.title,
          detail,
          actorName,
          token: shared?.token || result.row.shareToken,
          companyName: company?.name || result.row.sender?.name,
          notifyUids: result.row.notifyUids || [],
        });
        say(shared?.ok === false ? `Lagret. ${shared.error || 'E-postvarselet kunne ikke sendes.'}` : detail);
      } catch (error) {
        say(`Lagret. Varsel feilet: ${error?.message || 'ukjent feil'}`, true);
      }
    } else {
      say('Lagret.');
    }
    return result.row;
  }

  async function commitRemote(op, extra = {}) {
    setBusy(true);
    try {
      const result = await actOnAgreementShare({
        token: shareToken,
        op,
        caseId: sharedRow?.id,
        actorName,
        ...extra,
      });
      if (!result?.ok) {
        say(result?.error || 'Motparten fikk ikke oppdatert avtalen.', true);
        return false;
      }
      onShared?.(result.row);
      say(result.mailed === false && result.error ? `Lagret. ${result.error}` : 'Sendt.');
      return true;
    } catch (error) {
      say(error?.message || 'Kunne ikke sende.', true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function commitField(field, raw) {
    const value = raw ?? fieldDraftRef.current[field.id] ?? fieldDrafts[field.id];
    if (value == null || String(value) === showValue(field)) return;
    if (party === 'motpart') {
      commitRemote('setField', { fieldId: field.id, value });
      return;
    }
    const result = setAgreementField(state, view.id, { party, fieldId: field.id, value, actorName, actorUid });
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    commitLocal(result);
  }

  async function submitNote(kind) {
    const body = composer.trim();
    if (!body) {
      say('Skriv en merknad eller en melding.', true);
      return;
    }
    if (party === 'motpart') {
      const ok = await commitRemote('addNote', { body, kind });
      if (ok) setComposer('');
      return;
    }
    const saved = await commitLocal(addAgreementNote(state, view.id, { party, body, kind, actorName, actorUid }));
    if (saved) setComposer('');
  }

  async function saveEdit(item) {
    const body = editBody.trim();
    if (!body) {
      say('Merknaden kan ikke være tom. Slett den om den skal bort.', true);
      return;
    }
    if (party === 'motpart') {
      const ok = await commitRemote('editNote', { noteId: item.id, body });
      if (ok) { setEditingNote(''); setEditBody(''); }
      return;
    }
    const saved = await commitLocal(editAgreementNote(state, view.id, { party, noteId: item.id, body, actorName, actorUid }));
    if (saved) { setEditingNote(''); setEditBody(''); }
  }

  async function createCase(partial = {}) {
    const templateId = partial.templateId || draft.templateId;
    const template = templates.find((row) => row.id === templateId)
      || (state?.formTemplates || []).find((row) => row.id === templateId && row.category === 'avtale');
    if (!template) {
      say('Velg en avtalemal, eller lag en i skjemabyggeren før du låser utkastet.', true);
      return;
    }
    const customer = (state?.customers || []).find((row) => row.id === (partial.customerId || draft.customerId));
    if (!customer) {
      say('Velg en kunde før du låser utkastet.', true);
      return;
    }
    const bid = (state?.bids || []).find((row) => row.id === (partial.bidId || draft.bidId));
    const project = projects.find((row) => row.id === (partial.projectId || draft.projectId));
    const owner = people.find((row) => row.uid === (partial.ownerUid || draft.ownerUid));
    const parent = [...cases, ...(state?.contracts || [])].find((row) => row.id === (partial.parentId || draft.parentId));
    const result = createAgreementCase(state, {
      template,
      kind: partial.kind || draft.kind,
      customer,
      bidId: bid?.id || '',
      bidTitle: bid?.title || '',
      projectId: project?.id || '',
      projectName: project?.name || '',
      parentId: parent?.id || '',
      parentTitle: parent?.title || '',
      title: partial.title || bid?.title || project?.name || customer?.name || template.title,
      ownerName: owner?.name || '',
      ownerUid: owner?.uid || '',
      counterpartyEmail: partial.email || draft.email || customer?.email,
      company: {
        name: company?.name || '',
        orgnr: company?.orgnr || '',
        email: company?.email || '',
      },
      actorName,
      actorUid,
      notifyUids: [actorUid, owner?.uid].filter(Boolean),
    });
    const row = await commitLocal(result);
    if (row && (partial.createProject || draft.createProject) && !row.projectId) {
      const loaded = await loadProjectState(companyId);
      const made = createProject(loaded, {
        name: row.title,
        number: `A-${String(row.id).replace(/\W/g, '').slice(-8)}`,
        client: row.counterparty?.name || '',
        customerId: row.customerId || '',
        phase: 'planlegging',
      });
      if (made.ok) {
        await saveProjectState(made.state, companyId);
        const linked = {
          ...result,
          state: {
            ...result.state,
            agreementCases: result.state.agreementCases.map((item) => (
              item.id === row.id ? { ...item, projectId: made.state.activeProjectId } : item
            )),
          },
          row: { ...row, projectId: made.state.activeProjectId },
        };
        await commitLocal(linked);
      }
    }
  }

  function run(op) {
    if (party === 'motpart') return commitRemote(op.name, op.extra);
    return commitLocal(op.local(), op.movement);
  }

  const fields = showingCurrent ? (view?.fields || []) : (version?.fields || []);

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18, flex: 1 }}>Avtalebehandling</Text>
        {isPhone ? (
          <InfoButton title="Avtalebehandling">
            Når et tilbud blir et oppdrag, låses avtalen som utkast. Motparten ser bare feltene den kan endre, og merknadene blir synlige for avsender når de sendes i retur. Er alt i orden, kan avtalen signeres uten merknader.
          </InfoButton>
        ) : null}
      </View>
      {isPhone ? null : (
        <Text style={{ color: colors.muted, lineHeight: 20 }}>
          Når et tilbud blir et oppdrag, låses avtalen som utkast. Motparten ser bare feltene den kan endre, og merknadene blir synlige for avsender når de sendes i retur. Er alt i orden, kan avtalen signeres uten merknader.
        </Text>
      )}
      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}

      {party === 'avsender' ? (
        <ProcessTrail colors={colors} steps={processSteps} />
      ) : null}

      {party === 'avsender' && !selected ? (
        <View style={[styles.card, styles.draftCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {canLockDraft ? (
            <>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Klar til å låse utkast</Text>
              <Text style={{ color: colors.muted, lineHeight: 20 }}>
                {[kindCaseLabel(draft.kind), draft.customerName || 'Kunde', draft.templateTitle || selectedTemplate?.title || 'Avtalemal']
                  .filter(Boolean)
                  .join(' · ')}
                {draft.email ? ` · ${draft.email}` : ''}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                Kunde, oppdragstaker og øvrige kjente felt fylles inn automatisk når utkastet låses.
              </Text>
              <TouchableOpacity onPress={() => setDraft({ ...draft, createProject: !draft.createProject })} accessibilityRole="button">
                <Text style={{ color: colors.ink }}>{draft.createProject ? 'Prosjekt opprettes sammen med avtalen' : 'Opprett også prosjekt'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => createCase()}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Lås utkast 1</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onRequestCreate?.()} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Endre valg i veiviseren</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Nytt utkast</Text>
              <Text style={{ color: colors.muted, lineHeight: 20 }}>
                Start med Ny avtale for å velge type, kunde og avtalemal i en ryddig stegvis popup.
              </Text>
              <TouchableOpacity
                onPress={() => onRequestCreate?.()}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand }]}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Start ny avtale</Text>
              </TouchableOpacity>
            </>
          )}
          {waitingBids.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted }}>Vunne tilbud uten avtale</Text>
              {waitingBids.map((bid) => (
                <TouchableOpacity
                  key={bid.id}
                  onPress={() => onRequestCreate?.()}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.ink }}>{bid.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {party === 'avsender' ? (
        <View style={styles.row}>
          {cases.map((item) => (
            <Chip key={item.id} colors={colors} label={`${item.title} · ${statusLabel(item.status)}`} on={item.id === selected?.id} onPress={() => { setSelectedId(item.id); setVersionNo(item.version); }} />
          ))}
          {selected ? <Chip colors={colors} label="Ny" on={false} onPress={() => setSelectedId('')} /> : null}
        </View>
      ) : null}

      {view && version ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={styles.row}>
            <Text style={{ color: colors.ink, fontSize: 18, flexShrink: 1 }}>{view.title}</Text>
            <View style={[styles.badge, { backgroundColor: statusTone(view.status, colors).bg }]}>
              <Text style={{ color: statusTone(view.status, colors).ink, fontSize: 12 }}>{statusLabel(view.status)}</Text>
            </View>
          </View>
          <Text style={{ color: colors.muted }}>
            {kindCaseLabel(view.kind)} · {view.sender?.name || 'Avsender'} og {view.counterparty?.name || 'Motpart'}
          </Text>
          {party === 'avsender' && view.status === 'utkast' ? (
            <View style={[styles.nextBox, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
              <Text style={{ color: colors.ink, lineHeight: 20 }}>
                Utkastet er låst. Neste steg er å sende det til motparten
                {view.counterparty?.email ? ` (${view.counterparty.email})` : ''}.
              </Text>
              <TouchableOpacity
                disabled={busy}
                onPress={() => run({ movement: 'sendt', local: () => sendAgreement(state, view.id, { party, actorName, actorUid, email: view.counterparty?.email }) })}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}
              >
                <Text style={{ color: '#fff' }}>Send til motpart</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {party === 'avsender' && view.status === 'merknader' ? (
            <View style={[styles.nextBox, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={{ color: colors.ink, lineHeight: 20 }}>
                Merknader er kommet i retur. Godta dem, eller lås en ny versjon før du sender på nytt.
              </Text>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => run({ local: () => acceptRemarks(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink }}>Godta uten ny versjon</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => run({ local: () => publishAgreementVersion(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.brand }]}>
                  <Text style={{ color: colors.brand }}>Lås ny versjon</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
          {party === 'avsender' && view.status === 'hos-motpart' ? (
            <Text style={{ color: colors.muted, lineHeight: 20 }}>
              Avtalen ligger hos motparten. Du kan fortsette når merknader kommer i retur, eller når den signeres.
            </Text>
          ) : null}
          {party === 'avsender' && (view.status === 'utkast' || view.status === 'merknader') ? (
            <>
              <AgreementCustomerField
                colors={colors}
                customers={state?.customers || []}
                customerId={view.customerId || draft.customerId}
                companyId={companyId}
                people={people}
                onSelect={(customer) => setDraft((current) => ({
                  ...current,
                  customerId: customer?.id || '',
                  customerName: customer?.name || '',
                }))}
              />
              <AgreementPersonField
                colors={colors}
                people={people}
                ownerUid={view.ownerUid || draft.ownerUid}
                onSelect={(person) => setDraft((current) => ({ ...current, ownerUid: person?.uid || '' }))}
              />
              {!(view.ownerUid || draft.ownerUid) ? (
                <Text style={{ color: colors.muted }}>Ansvarlig tildeles senere</Text>
              ) : null}
            </>
          ) : null}
          {party === 'avsender' && view.status === 'utkast' ? (
            <TouchableOpacity onPress={() => setShowDocument((open) => !open)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>{showDocument ? 'Skjul avtaleteksten' : 'Vis avtaleteksten'}</Text>
            </TouchableOpacity>
          ) : null}
          {(showDocument || party !== 'avsender' || view.status !== 'utkast') ? (
          <>
          <View style={styles.row}>
            {(view.versions || []).map((item) => (
              <Chip key={item.number} colors={colors} label={`Versjon ${item.number}`} on={item.number === version.number} onPress={() => setVersionNo(item.number)} />
            ))}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Låst versjon {version.number}. PDF og Word er denne teksten.</Text>
          <View style={[styles.paper, { borderColor: colors.line, backgroundColor: colors.bg }]}>
            {(version.fields || []).map((field) => (
              field.kind === 'title' || field.kind === 'note' ? (
                <Text key={field.id} style={{ color: colors.ink, marginTop: 6 }}>{field.label}</Text>
              ) : (
                <View key={field.id} style={[styles.fieldRow, { borderBottomColor: colors.line }]}>
                  <Text style={[styles.fieldLabel, { color: colors.muted }]}>{field.label}</Text>
                  <Text style={{ color: colors.ink, flex: 1 }}>{showValue(field) || '—'}</Text>
                </View>
              )
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => download(`${agreementFileBase(view, version.number)}.pdf`, 'application/pdf', agreementToPdf(view, version.number))} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Last ned PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => download(`${agreementFileBase(view, version.number)}.doc`, 'application/msword', agreementToWordHtml(view, version.number))} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Last ned Word</Text>
            </TouchableOpacity>
          </View>

          {showingCurrent && (view.status === 'utkast' || view.status === 'merknader' || (party === 'motpart' && view.status === 'hos-motpart')) ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.ink }}>{party === 'motpart' ? 'Felt du kan endre' : 'Arbeidskopi'}</Text>
              {fields.filter((field) => field.kind !== 'title' && field.kind !== 'note').map((field) => {
                const editable = field.editor === 'begge' || field.editor === party || (party === 'avsender' && field.editor === 'avsender') || (party === 'motpart' && field.editor === 'motpart');
                if (!editable) return null;
                return (
                  <TextInput
                    key={field.id}
                    value={fieldDrafts[field.id] ?? showValue(field)}
                    onChangeText={(value) => {
                      fieldDraftRef.current[field.id] = value;
                      setFieldDrafts((current) => ({ ...current, [field.id]: value }));
                    }}
                    onBlur={() => commitField(field)}
                    placeholder={field.label}
                    placeholderTextColor={colors.placeholder}
                    style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                  />
                );
              })}
            </View>
          ) : null}

          {proposals.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.ink }}>Foreslåtte feltendringer</Text>
              {proposals.map((item) => (
                <Text key={item.id} style={{ color: colors.ink }}>{item.label}: {item.before || '—'} → {item.after || '—'}</Text>
              ))}
              {party === 'avsender' && view.status === 'merknader' ? (
                <TouchableOpacity onPress={() => run({ local: () => acceptProposals(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.brand }]}>
                  <Text style={{ color: colors.brand }}>Ta inn forslagene i arbeidskopien</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={{ color: colors.ink }}>Merknader og meldinger</Text>
          {notes.length ? notes.map((item) => (
            <View key={item.id} style={[styles.note, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {item.authorName || (item.authorParty === 'motpart' ? 'Motpart' : 'Avsender')} · {item.createdAt?.replace('T', ' ').slice(0, 16)} · v{item.version}{item.sentAt ? '' : ' · ikke sendt'}
              </Text>
              {editingNote === item.id ? (
                <TextInput
                  value={editBody}
                  onChangeText={setEditBody}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
                />
              ) : (
                <Text style={{ color: colors.ink }}>{item.body}</Text>
              )}
              {!item.sentAt && item.authorParty === party ? (
                <View style={styles.row}>
                  {editingNote === item.id ? (
                    <>
                      <TouchableOpacity onPress={() => saveEdit(item)} accessibilityRole="button"><Text style={{ color: colors.brand }}>Lagre</Text></TouchableOpacity>
                      <TouchableOpacity onPress={() => { setEditingNote(''); setEditBody(''); }} accessibilityRole="button"><Text style={{ color: colors.muted }}>Avbryt</Text></TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => { setEditingNote(item.id); setEditBody(item.body); }} accessibilityRole="button"><Text style={{ color: colors.brand }}>Endre</Text></TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={() => run({
                    name: 'deleteNote',
                    extra: { noteId: item.id },
                    local: () => deleteAgreementNote(state, view.id, { party, noteId: item.id, actorName, actorUid }),
                  })} accessibilityRole="button"><Text style={{ color: colors.danger }}>Slett</Text></TouchableOpacity>
                </View>
              ) : null}
            </View>
          )) : (
            <Text style={{ color: colors.muted }}>Ingen merknader på denne versjonen.</Text>
          )}
          {view.status !== 'signert' ? (
            <View style={{ gap: 6 }}>
              <TextInput
                value={composer}
                onChangeText={setComposer}
                placeholder="Merknad eller melding. Tom liste er i orden hvis avtalen kan signeres."
                placeholderTextColor={colors.placeholder}
                multiline
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg, minHeight: 64 }]}
              />
              <View style={styles.row}>
                <TouchableOpacity disabled={busy} onPress={() => submitNote('merknad')} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink }}>Legg inn merknad</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => submitNote('melding')} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink }}>Legg inn melding</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <Text style={{ color: colors.ink }}>Tidslinje</Text>
          <View style={[styles.timeline, { borderLeftColor: colors.line }]}>
            {movements.map((event) => (
              <Text key={event.id} style={{ color: colors.ink }}>
                {event.at?.replace('T', ' ').slice(0, 16)} · {event.actorName || event.actorParty} · {event.detail || event.action}
              </Text>
            ))}
          </View>

          {party === 'motpart' ? (
            <TextInput value={signerName} onChangeText={setSignerName} placeholder="Navn som skal stå på signaturen" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
          ) : null}
          <View style={styles.row}>
            {party === 'avsender' && view.status === 'utkast' ? (
              <TouchableOpacity disabled={busy} onPress={() => run({ movement: 'sendt', local: () => sendAgreement(state, view.id, { party, actorName, actorUid, email: view.counterparty?.email }) })} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>Send til motpart</Text>
              </TouchableOpacity>
            ) : null}
            {party === 'motpart' && (view.status === 'hos-motpart' || view.status === 'merknader') && (notes.some((item) => !item.sentAt) || (view.proposals || []).some((item) => !item.sentAt)) ? (
              <TouchableOpacity disabled={busy} onPress={() => commitRemote('return')} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>Send merknader i retur</Text>
              </TouchableOpacity>
            ) : null}
            {party === 'motpart' && (view.status === 'hos-motpart' || view.status === 'merknader') && !notes.some((item) => !item.sentAt) && !(view.proposals || []).some((item) => !item.sentAt) ? (
              <Text style={{ color: colors.muted }}>Ingen merknader. Signer hvis avtalen er i orden.</Text>
            ) : null}
            {party === 'avsender' && view.status === 'merknader' ? (
              <TouchableOpacity onPress={() => run({ local: () => acceptRemarks(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Godta uten ny versjon</Text>
              </TouchableOpacity>
            ) : null}
            {party === 'avsender' && view.status === 'merknader' ? (
              <TouchableOpacity onPress={() => run({ local: () => publishAgreementVersion(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Lås ny versjon</Text>
              </TouchableOpacity>
            ) : null}
            {view.status !== 'utkast' && view.status !== 'signert' && !(party === 'avsender' && (notes.some((item) => item.sentAt && !item.resolvedAt) || proposals.some((item) => !item.handledAt))) ? (
              <>
                <TouchableOpacity disabled={busy} onPress={() => run({
                  name: 'sign',
                  movement: 'signert',
                  extra: { method: 'forpliktende' },
                  local: () => signAgreement(state, view.id, { party, actorName, actorUid, method: 'forpliktende' }),
                })} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
                  <Text style={{ color: '#fff' }}>Signer med forpliktende segl</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => run({
                  name: 'sign',
                  movement: 'signert',
                  extra: { method: 'bankid' },
                  local: () => signAgreement(state, view.id, { party, actorName, actorUid, method: 'bankid' }),
                })} accessibilityRole="button" style={[styles.quiet, { borderColor: colors.brand }]}>
                  <Text style={{ color: colors.brand }}>Signer med BankID-valg</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
          {party === 'avsender' && (notes.some((item) => item.sentAt && !item.resolvedAt) || proposals.some((item) => !item.handledAt)) ? (
            <Text style={{ color: colors.muted, lineHeight: 18 }}>Godta merknadene eller lås en ny versjon før du signerer.</Text>
          ) : null}
          <Text style={{ color: colors.muted, lineHeight: 18 }}>
            BankID-leverandør er ikke tilkoblet. Begge valgene legger et forpliktende segl med navn, tidspunkt og versjonslås.
          </Text>
          {(view.signatures || []).map((sign) => (
            <Text key={`${sign.party}-${sign.at}`} style={{ color: colors.ink }}>
              {sign.party === 'motpart' ? 'Motpart' : 'Avsender'} {sign.name} signerte versjon {sign.version} {sign.at?.replace('T', ' ').slice(0, 16)} · {sign.method === 'bankid' ? 'BankID-valg' : 'forpliktende segl'}
            </Text>
          ))}
          </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 },
  draftCard: { maxWidth: 640, width: '100%', alignSelf: 'flex-start' },
  paper: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  fieldRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, alignItems: 'flex-start' },
  fieldLabel: { width: 148, fontSize: 13 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  primary: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  quiet: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  nextBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  note: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 4 },
  timeline: { borderLeftWidth: 2, paddingLeft: 10, gap: 6, marginLeft: 2 },
});
