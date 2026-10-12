import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import {
  AGREEMENT_CASE_KINDS,
  acceptProposals,
  acceptRemarks,
  addAgreementNote,
  agreementMovements,
  agreementNoticeText,
  agreementStarterTemplate,
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
import { saveFormTemplate } from '../../src/anbud/bidLibrary';
import { agreementResponsiblePeople } from '../../src/anbud/customers';
import { mergeAnbudStates } from '../../src/anbud/model';
import { flushAnbudState, loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { watchEmployees } from '../../src/employees/storage';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import { createProject } from '../../src/project/engine';

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
}) {
  const { user, requestShellTab } = useApp();
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
    customerId: '',
    bidId: '',
    projectId: '',
    parentId: '',
    ownerUid: '',
    email: '',
    createProject: false,
  });
  const [composer, setComposer] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [signerName, setSignerName] = useState('');
  const [fieldDrafts, setFieldDrafts] = useState({});
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

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

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
        return;
      }
      onShared?.(result.row);
      say(result.mailed === false && result.error ? `Lagret. ${result.error}` : 'Sendt.');
    } catch (error) {
      say(error?.message || 'Kunne ikke sende.', true);
    } finally {
      setBusy(false);
    }
  }

  async function createCase(partial = {}) {
    const template = templates.find((row) => row.id === (partial.templateId || draft.templateId));
    const customer = (state?.customers || []).find((row) => row.id === (partial.customerId || draft.customerId));
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
      title: partial.title || bid?.title || project?.name || '',
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

  async function ensureStarter() {
    const starter = agreementStarterTemplate();
    const result = saveFormTemplate(state, starter);
    if (!result.ok) {
      say(result.error, true);
      return;
    }
    await commitLocal(result);
    say('Standard avtalemal er lagret. Velg den for å opprette utkastet.');
  }

  function run(op) {
    if (party === 'motpart') return commitRemote(op.name, op.extra);
    return commitLocal(op.local(), op.movement);
  }

  const fields = showingCurrent ? (view?.fields || []) : (version?.fields || []);

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>Avtalebehandling</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Når et tilbud blir et oppdrag, låses avtalen som utkast. Motparten ser bare feltene den kan endre, og merknadene blir synlige for avsender når de sendes i retur. Er alt i orden, kan avtalen signeres uten merknader.
      </Text>
      {party === 'avsender' && onRegisterExisting ? (
        <TouchableOpacity onPress={onRegisterExisting} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Avtalen er allerede inngått — registrer den med dokument og AI</Text>
        </TouchableOpacity>
      ) : null}
      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}

      {party === 'avsender' && !selected ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Nytt utkast</Text>
          <View style={styles.row}>
            {AGREEMENT_CASE_KINDS.map((item) => (
              <Chip key={item.id} colors={colors} label={item.label} on={draft.kind === item.id} onPress={() => setDraft({ ...draft, kind: item.id })} />
            ))}
          </View>
          {!templates.length ? (
            <TouchableOpacity onPress={ensureStarter} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Lag standard avtalemal i skjemabyggeren</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.row}>
              {templates.map((item) => (
                <Chip key={item.id} colors={colors} label={item.title} on={draft.templateId === item.id} onPress={() => setDraft({ ...draft, templateId: item.id })} />
              ))}
            </View>
          )}
          <Text style={{ color: colors.muted }}>Kunde</Text>
          <View style={styles.row}>
            {(state?.customers || []).slice(0, 12).map((item) => (
              <Chip key={item.id} colors={colors} label={item.name} on={draft.customerId === item.id} onPress={() => setDraft({ ...draft, customerId: item.id, email: item.email || '' })} />
            ))}
          </View>
          <Text style={{ color: colors.muted }}>Ansvarlig</Text>
          <View style={styles.row}>
            {people.slice(0, 12).map((item) => (
              <Chip key={item.uid} colors={colors} label={item.name} on={draft.ownerUid === item.uid} onPress={() => setDraft({ ...draft, ownerUid: item.uid })} />
            ))}
          </View>
          {draft.kind === 'avrop' ? (
            <View style={styles.row}>
              {[...cases, ...(state?.contracts || [])].filter((row) => row.kind === 'rammeavtale' && !row.deletedAt).map((item) => (
                <Chip key={item.id} colors={colors} label={item.title} on={draft.parentId === item.id} onPress={() => setDraft({ ...draft, parentId: item.id })} />
              ))}
            </View>
          ) : null}
          <TextInput
            value={draft.email}
            onChangeText={(email) => setDraft({ ...draft, email })}
            placeholder="E-post til motpart"
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
          />
          <TouchableOpacity onPress={() => setDraft({ ...draft, createProject: !draft.createProject })} accessibilityRole="button">
            <Text style={{ color: colors.ink }}>{draft.createProject ? 'Prosjekt opprettes sammen med avtalen' : 'Opprett også prosjekt'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => createCase()} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Lås utkast 1</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => requestShellTab?.('skjema')} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Åpne skjemabyggeren</Text>
          </TouchableOpacity>
          {waitingBids.length ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted }}>Vunne tilbud uten avtale</Text>
              {waitingBids.map((bid) => (
                <TouchableOpacity key={bid.id} onPress={() => createCase({ bidId: bid.id, title: bid.title, customerId: draft.customerId })} accessibilityRole="button">
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
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{view.title}</Text>
          <Text style={{ color: colors.muted }}>
            {kindCaseLabel(view.kind)} · {statusLabel(view.status)} · {view.sender?.name} og {view.counterparty?.name}
          </Text>
          <View style={styles.row}>
            {(view.versions || []).map((item) => (
              <Chip key={item.number} colors={colors} label={`Versjon ${item.number}`} on={item.number === version.number} onPress={() => setVersionNo(item.number)} />
            ))}
          </View>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>
            Låst versjon {version.number}{version.digest ? ` · ${version.digest}` : ''}
          </Text>
          <View style={[styles.paper, { borderColor: colors.line, backgroundColor: colors.bg }]}>
            {(version.fields || []).map((field) => (
              <View key={field.id} style={{ gap: 2 }}>
                {field.kind === 'title' || field.kind === 'note' ? (
                  <Text style={{ color: colors.ink, fontWeight: field.kind === 'title' ? '700' : '400' }}>{field.label}</Text>
                ) : (
                  <Text style={{ color: colors.ink }}>{field.label}: {showValue(field) || '—'}</Text>
                )}
              </View>
            ))}
          </View>
          <View style={styles.row}>
            <TouchableOpacity onPress={() => download(`${agreementFileBase(view, version.number)}.pdf`, 'application/pdf', agreementToPdf(view, version.number))} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Last ned PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => download(`${agreementFileBase(view, version.number)}.doc`, 'application/msword', agreementToWordHtml(view, version.number))} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Last ned Word</Text>
            </TouchableOpacity>
          </View>

          {showingCurrent && (view.status === 'utkast' || view.status === 'merknader' || (party === 'motpart' && view.status === 'hos-motpart')) ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{party === 'motpart' ? 'Felt du kan endre' : 'Arbeidskopi'}</Text>
              {fields.filter((field) => field.kind !== 'title' && field.kind !== 'note').map((field) => {
                const editable = field.editor === 'begge' || field.editor === party || (party === 'avsender' && field.editor === 'avsender') || (party === 'motpart' && field.editor === 'motpart');
                if (!editable) return null;
                return (
                  <TextInput
                    key={field.id}
                    value={fieldDrafts[field.id] ?? showValue(field)}
                    onChangeText={(value) => setFieldDrafts((current) => ({ ...current, [field.id]: value }))}
                    onEndEditing={(event) => {
                      const value = event?.nativeEvent?.text ?? fieldDrafts[field.id] ?? '';
                      if (party === 'motpart') {
                        commitRemote('setField', { fieldId: field.id, value });
                        return;
                      }
                      const result = setAgreementField(state, view.id, { party, fieldId: field.id, value, actorName, actorUid });
                      if (result.ok) commitLocal(result);
                    }}
                    placeholder={field.label}
                    placeholderTextColor={colors.placeholder}
                    style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                  />
                );
              })}
            </View>
          ) : null}

          {proposals.length ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Foreslåtte feltendringer</Text>
              {proposals.map((item) => (
                <Text key={item.id} style={{ color: colors.ink }}>{item.label}: {item.before || '—'} → {item.after || '—'}</Text>
              ))}
              {party === 'avsender' && view.status === 'merknader' ? (
                <TouchableOpacity onPress={() => run({ local: () => acceptProposals(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Ta inn forslagene i arbeidskopien</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={{ color: colors.ink, fontWeight: '600' }}>Merknader og meldinger</Text>
          {notes.map((item) => (
            <View key={item.id} style={{ gap: 2 }}>
              <Text style={{ color: colors.muted }}>{item.authorName || (item.authorParty === 'motpart' ? 'Motpart' : 'Avsender')} · {item.createdAt?.replace('T', ' ').slice(0, 16)} · v{item.version}{item.sentAt ? '' : ' · ikke sendt'}</Text>
              {editingNote === item.id ? (
                <TextInput
                  value={composer}
                  onChangeText={setComposer}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                />
              ) : (
                <Text style={{ color: colors.ink }}>{item.body}</Text>
              )}
              {!item.sentAt && item.authorParty === party ? (
                <View style={styles.row}>
                  <TouchableOpacity onPress={() => { setEditingNote(item.id); setComposer(item.body); }} accessibilityRole="button"><Text style={{ color: colors.brand }}>Endre</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => run({
                    name: 'editNote',
                    extra: { noteId: item.id, body: composer },
                    local: () => editAgreementNote(state, view.id, { party, noteId: item.id, body: composer, actorName, actorUid }),
                  })} accessibilityRole="button"><Text style={{ color: colors.brand }}>Lagre</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => run({
                    name: 'deleteNote',
                    extra: { noteId: item.id },
                    local: () => deleteAgreementNote(state, view.id, { party, noteId: item.id, actorName, actorUid }),
                  })} accessibilityRole="button"><Text style={{ color: colors.danger }}>Slett</Text></TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))}
          {view.status !== 'signert' ? (
            <View style={{ gap: 6 }}>
              <TextInput
                value={editingNote ? '' : composer}
                onChangeText={setComposer}
                placeholder="Merknad eller melding. Tom liste er i orden hvis avtalen kan signeres."
                placeholderTextColor={colors.placeholder}
                multiline
                style={[styles.input, { color: colors.ink, borderColor: colors.line, minHeight: 64 }]}
              />
              <View style={styles.row}>
                <TouchableOpacity disabled={busy} onPress={() => run({
                  name: 'addNote',
                  extra: { body: composer, kind: 'merknad' },
                  local: () => addAgreementNote(state, view.id, { party, body: composer, kind: 'merknad', actorName, actorUid }),
                })} accessibilityRole="button"><Text style={{ color: colors.brand }}>Legg inn merknad</Text></TouchableOpacity>
                <TouchableOpacity disabled={busy} onPress={() => run({
                  name: 'addNote',
                  extra: { body: composer, kind: 'melding' },
                  local: () => addAgreementNote(state, view.id, { party, body: composer, kind: 'melding', actorName, actorUid }),
                })} accessibilityRole="button"><Text style={{ color: colors.brand }}>Legg inn melding</Text></TouchableOpacity>
              </View>
            </View>
          ) : null}

          <Text style={{ color: colors.ink, fontWeight: '600' }}>Tidslinje</Text>
          {movements.map((event) => (
            <Text key={event.id} style={{ color: colors.ink }}>
              {event.at?.replace('T', ' ').slice(0, 16)} · {event.actorName || event.actorParty} · {event.detail || event.action}
            </Text>
          ))}

          {party === 'motpart' ? (
            <TextInput value={signerName} onChangeText={setSignerName} placeholder="Navn som skal stå på signaturen" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} />
          ) : null}
          <View style={styles.row}>
            {party === 'avsender' && view.status === 'utkast' ? (
              <TouchableOpacity disabled={busy} onPress={() => run({ movement: 'sendt', local: () => sendAgreement(state, view.id, { party, actorName, actorUid, email: view.counterparty?.email }) })} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>Send til motpart</Text>
              </TouchableOpacity>
            ) : null}
            {party === 'motpart' && (view.status === 'hos-motpart' || view.status === 'merknader') ? (
              <TouchableOpacity disabled={busy} onPress={() => commitRemote('return')} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
                <Text style={{ color: '#fff' }}>Send merknader i retur</Text>
              </TouchableOpacity>
            ) : null}
            {party === 'avsender' && view.status === 'merknader' ? (
              <TouchableOpacity onPress={() => run({ local: () => acceptRemarks(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Godta uten ny versjon</Text>
              </TouchableOpacity>
            ) : null}
            {party === 'avsender' && view.status === 'merknader' ? (
              <TouchableOpacity onPress={() => run({ local: () => publishAgreementVersion(state, view.id, { party, actorName, actorUid }) })} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Lås ny versjon</Text>
              </TouchableOpacity>
            ) : null}
            {view.status !== 'utkast' && view.status !== 'signert' ? (
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
                })} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Signer med BankID</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
          <Text style={{ color: colors.muted, lineHeight: 18 }}>
            BankID-leverandør er ikke tilkoblet. Valget legger et forpliktende segl på den låste versjonen, med navn, tidspunkt og versjonslås. Forpliktende segl gjør det samme uten BankID-merket.
          </Text>
          {(view.signatures || []).map((sign) => (
            <Text key={`${sign.party}-${sign.at}`} style={{ color: colors.ink }}>
              {sign.party === 'motpart' ? 'Motpart' : 'Avsender'} {sign.name} signerte versjon {sign.version} {sign.at?.replace('T', ' ').slice(0, 16)} · {sign.method === 'bankid' ? 'BankID-valg' : 'forpliktende segl'}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  paper: { borderWidth: 1, borderRadius: 8, padding: 12, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  primary: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
});
