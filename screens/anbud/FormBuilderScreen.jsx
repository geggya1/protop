import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  applyImportedForm,
  blankForm,
  cloneFields,
  formAttention,
  normalizeDocInfo,
  normalizeSettings,
  starterForm,
} from '../../src/anbud/formBuilder';
import { agreementStarterTemplate } from '../../src/anbud/agreementCase';
import { deleteFormTemplate, saveFormTemplate } from '../../src/anbud/bidLibrary';
import { askCompanyForm, FORM_IMPORT_ACCEPT, readFormImport } from '../../src/anbud/formImport';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import {
  KS_LIBRARY,
  libraryEntry,
  libraryForm,
  libraryGroups,
  libraryTemplateId,
  searchLibrary,
} from '../../src/forms/ksLibrary';
import {
  completeFilledDoc,
  filledLine,
  newFilledDoc,
  reopenFilledDoc,
} from '../../src/forms/filledDocs';
import { deleteFilledDoc, loadFilledDocs, peekFilledDocs, saveFilledDoc } from '../../src/forms/filledStore';
import { formWithTokens } from '../../src/forms/tokens';
import {
  archiveControl,
  controlKey,
  controlStatus,
  docHeader,
  ensureWorkingRevision,
  pendingFor,
  revisionLog,
  submitRevision,
  updateControl,
  workingRevision,
} from '../../src/doccontrol/model';
import { templateFromSnapshot, templateHash, templateSnapshot } from '../../src/doccontrol/content';
import {
  autoControlled,
  draftHeaderForTemplate,
  fillSource,
  isoManaged,
  libraryKeyOf,
  newTemplateControl,
  templateControlKey,
} from '../../src/doccontrol/templates';
import { pickDocument, pickImage } from '../../src/utils/media';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import FormStudio from './FormStudio';
import FormFill, { FilledStatusIcon } from './FormFill';
import { useFormContext } from './useFormContext';
import CreateMenu from '../../components/CreateMenu';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import { useDocControl } from '../doccontrol/useDocControl';
import DocControlPanel from '../doccontrol/DocControlPanel';
import DocComments from '../doccontrol/DocComments';
import DocOverview from '../doccontrol/DocOverview';
import { StatusChip } from '../doccontrol/parts';
import KsLibraryList, { NOT_CONTROLLED } from './KsLibraryList';
import { printHandbook } from '../hr/handbookPrint';
import { printForm } from './formPrint';

const STARTERS = [
  { id: 'blank', title: 'Tomt skjema', icon: 'document-outline', kind: 'blank' },
  { id: 'copy', title: 'Kopier skjemaet ditt', icon: 'copy-outline', kind: 'copy' },
  { id: 'kontakt', title: 'Kontakt', icon: 'person-outline', kind: 'kontakt' },
  { id: 'befaring', title: 'Befaring', icon: 'map-outline', kind: 'befaring' },
];

const TABS = [
  { id: 'bibliotek', label: 'KS-maler' },
  { id: 'maler', label: 'Bedriftens maler' },
  { id: 'utfylt', label: 'Utfylte dokumenter' },
  { id: 'styring', label: 'Dokumentstyring' },
];

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') return null;
  return new Uint8Array(await blob.arrayBuffer());
}

function draftFromTemplate(template, { copy = false } = {}) {
  return {
    id: copy ? '' : template.id,
    libraryKey: copy ? '' : (template.libraryKey || ''),
    title: copy ? `${template.title} kopi`.slice(0, 80) : template.title,
    intro: template.intro || '',
    category: template.category === 'avtale' ? 'avtale' : 'skjema',
    cover: template.cover || '',
    doc: normalizeDocInfo(template.doc),
    settings: normalizeSettings(template.settings),
    responses: copy ? [] : (template.responses || []).map((row) => ({ ...row, answers: { ...(row.answers || {}) } })),
    fields: copy
      ? cloneFields(template.fields)
      : template.fields.map((field) => ({ ...field, options: (field.options || []).map((row) => ({ ...row })) })),
  };
}

function dateLabel(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FormBuilderScreen({
  colors: colorsProp,
  state: externalState,
  commit: externalCommit,
  onPick,
  fill = false,
}) {
  const themeColors = useColors();
  const colors = colorsProp || themeColors;
  const { shellIntent, clearShellIntent, requestShellTab } = useApp();
  const { familyId, actor, company, logo: companyLogo } = useFormContext();
  const dc = useDocControl();
  const logoUrl = companyLogo?.dataUrl || '';
  const [localState, setLocalState] = useState(null);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('bibliotek');
  // Åpne KS-skuffer. Står her, så de er som før når man kommer tilbake fra en utfylling.
  const [libraryDrawers, setLibraryDrawers] = useState({});
  const [draft, setDraft] = useState(null);
  const [filled, setFilled] = useState(null);
  const [filledDocs, setFilledDocs] = useState(() => peekFilledDocs(familyId) || []);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState('');
  const [scanToken, setScanToken] = useState(0);
  const [fromAgreement, setFromAgreement] = useState(false);
  const fillReturnRef = useRef(null);
  const agreementReturnRef = useRef(null);
  const agreementIntentHandled = useRef('');

  useEffect(() => {
    if (externalState) return undefined;
    let live = true;
    loadAnbudState(familyId).then((loaded) => {
      if (live) setLocalState(loaded);
    });
    return () => { live = false; };
  }, [externalState, familyId]);

  // Varsel om dokument til godkjenning eller ny merknad åpner fanen Dokumentstyring.
  useEffect(() => {
    if (shellIntent?.type !== 'docControl') return;
    clearShellIntent?.();
    setDraft(null);
    setFilled(null);
    setTab('styring');
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    let live = true;
    loadFilledDocs(familyId).then((list) => {
      if (live) setFilledDocs(list);
    });
    return () => { live = false; };
  }, [familyId]);

  const state = externalState || localState;
  const templates = state?.formTemplates || [];
  const needle = query.trim().toLocaleLowerCase('nb-NO');
  const visible = templates.filter((row) => row.title.toLocaleLowerCase('nb-NO').includes(needle));
  const libraryHits = new Set(searchLibrary(query).map((row) => row.key));
  const ownFilled = filledDocs.filter((row) => row.scope !== 'hr');
  const visibleFilled = ownFilled.filter((row) => !needle || row.title.toLocaleLowerCase('nb-NO').includes(needle) || String(row.subject?.name || '').toLocaleLowerCase('nb-NO').includes(needle));

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  async function commit(result) {
    if (!result?.ok) {
      say(result?.error || 'Kunne ikke lagre skjemaet.', true);
      return null;
    }
    if (externalCommit) await externalCommit(result);
    else {
      await saveAnbudState(result.state, familyId);
      setLocalState(result.state);
    }
    return result;
  }

  function openFresh(form) {
    setDraft({
      ...blankForm(),
      ...form,
      id: '',
      cover: form.cover || '',
      doc: normalizeDocInfo(form.doc),
      settings: normalizeSettings(form.settings),
      responses: [],
      fields: form.fields,
    });
    say('');
  }

  function openStarter(kind) {
    if (kind === 'copy') {
      const source = visible[0];
      if (!source) {
        say('Ingen skjema å kopiere ennå.', true);
        return;
      }
      setDraft(draftFromTemplate(source, { copy: true }));
      say(`Kopi av ${source.title}. Lagre når den er klar.`);
      return;
    }
    openFresh(kind === 'blank' ? blankForm() : starterForm(kind));
  }

  /** Bedriftens tilpassede versjon av en bibliotekmal, ellers malen fra biblioteket. */
  function libraryTemplate(key) {
    const own = templates.find((row) => row.id === libraryTemplateId(key));
    if (own) return own;
    const form = libraryForm(key);
    return form ? { ...form, id: libraryTemplateId(key) } : null;
  }

  function openLibrary(key) {
    const template = libraryTemplate(key);
    if (!template) return;
    setDraft(draftFromTemplate(template));
    const own = templates.some((row) => row.id === template.id);
    say(own ? '' : 'KS-malen fra biblioteket. Endringer lagres som bedriftens egen versjon.');
  }

  function controlOf(template) {
    const key = templateControlKey(template);
    return key ? dc.controlFor(key) : null;
  }

  function templateOf(control) {
    const own = templates.find((row) => row.id === control.refId);
    if (own) return own;
    const key = libraryKeyOf(control.refId);
    return key ? libraryTemplate(key) : null;
  }

  /** Lagret mal: start neste revisjon når innholdet avviker fra gjeldende versjon. KS-maler tas inn av seg selv. */
  async function syncControl(template) {
    if (!template?.id || template.category === 'avtale' || isoManaged(template)) return;
    const existing = controlOf(template);
    if (!existing && !autoControlled(template)) return;
    let next = existing || newTemplateControl(template, { controls: dc.controls, settings: dc.settings, actor });
    next = ensureWorkingRevision(next, templateHash(template), { actor });
    if (next.title !== template.title) next = updateControl(next, { title: template.title }, { actor });
    if (next !== existing) await dc.storeControl(next);
  }

  /** Vis innsendt versjon som PDF, slik godkjenner skal godkjenne den. */
  function previewSnapshot(snapshot, control) {
    if (!snapshot || !control) return;
    const work = workingRevision(control);
    if (control.kind === 'handbook') {
      printHandbook({
        title: snapshot.title,
        chapters: snapshot.chapters || [],
        header: { ...docHeader(control), version: `Utkast ${work?.revision || 1}`, approvedBy: '', approved: '' },
        log: revisionLog(control),
      }, { company, logo: logoUrl });
      return;
    }
    const base = templateOf(control) || { id: control.refId, doc: { docId: control.code } };
    printForm({ ...templateFromSnapshot(snapshot, base), doc: draftHeaderForTemplate(base, control) }, logoUrl, { company });
  }

  function openControl(control) {
    if (control.kind === 'handbook') {
      requestShellTab?.('hr', 'handbok');
      return;
    }
    const template = templateOf(control);
    if (!template) {
      say('Malen finnes ikke lenger.', true);
      return;
    }
    setDraft(draftFromTemplate(template));
    say('');
  }

  const missingLibrary = KS_LIBRARY.filter((entry) => entry.kind === 'mal' && !dc.controlFor(controlKey('template', libraryTemplateId(entry.key))));

  /** Ta alle KS-malene inn i dokumentstyringen og send rev. 1 til godkjenning. */
  async function addLibraryControls() {
    const list = missingLibrary.map((entry) => {
      const template = libraryTemplate(entry.key);
      const control = newTemplateControl(template, { controls: dc.controls, settings: dc.settings, actor });
      const res = submitRevision(control, templateSnapshot(template), { actor, changeReason: 'Første utgave' });
      return res.ok ? res.control : control;
    }).filter(Boolean);
    if (!list.length) return;
    setSaving(true);
    const results = await Promise.all(list.map((control) => dc.storeControl(control)));
    setSaving(false);
    const ok = results.filter((row) => row.ok).length;
    if (ok) {
      dc.notifySubmitted(list[0], 1, { title: `${ok} KS-maler venter på godkjenning`, body: `Sendt av ${actor.name || 'en kollega'}. Åpne Skjemabygger › Dokumentstyring.` });
    }
    const message = ok === list.length ? `${ok} KS-maler er tatt inn og sendt til godkjenning.` : `${ok} av ${list.length} KS-maler ble tatt inn. ${results.find((row) => !row.ok)?.error || ''}`;
    say(message, ok !== list.length);
    showSaveToast(message);
  }

  function startFill(form, returnTo = null) {
    const entry = form.libraryKey ? libraryEntry(form.libraryKey) : null;
    const control = controlOf(form);
    const controlled = !!control || autoControlled(form);
    const source = controlled ? fillSource(form, control) : { form, approved: true, version: 0 };
    fillReturnRef.current = returnTo;
    setFilled(newFilledDoc(source.form, { actor, scope: entry?.hr ? 'hr' : 'skjema' }));
    const work = workingRevision(control);
    say([
      entry?.hr ? 'Personaldokument. Det lagres i HR med begrenset tilgang.' : '',
      controlled && !source.approved ? 'Malen er ikke godkjent ennå. Dokumentet får «Utkast» i hodet til en versjon er godkjent.' : '',
      source.approved && source.version && work ? `Utfyllingen bruker godkjent versjon ${source.version}. Endringene i rev. ${work.revision} gjelder når de er godkjent.` : '',
    ].filter(Boolean).join(' '));
  }

  function fillLibrary(key) {
    const template = libraryTemplate(key);
    if (template) startFill(template);
  }

  async function storeFilled(next, message) {
    setSaving(true);
    try {
      const res = await saveFilledDoc(familyId, next);
      if (res.list) setFilledDocs(res.list);
      setFilled(res.doc || next);
      if (!res.ok) {
        say(res.error, true);
        return false;
      }
      say(message);
      showSaveToast(message);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function completeFilled() {
    const res = completeFilledDoc(formWithTokens(filled, company), { actor });
    if (!res.ok) {
      say(res.error, true);
      return;
    }
    await storeFilled(res.doc, 'Dokumentet er ferdig og lagret.');
  }

  async function removeFilled() {
    const res = await deleteFilledDoc(familyId, filled.id);
    if (res.list) setFilledDocs(res.list);
    setFilled(null);
    say(res.ok ? 'Dokumentet er slettet.' : res.error, !res.ok);
  }

  function returnToAgreement(templateId) {
    const payload = agreementReturnRef.current;
    if (!payload) return false;
    agreementReturnRef.current = null;
    setFromAgreement(false);
    requestShellTab?.('kontrakt', null, {
      type: 'agreementTemplateReady',
      templateId: templateId || '',
      returnDraft: payload.returnDraft || {},
    });
    return true;
  }

  useEffect(() => {
    if (!state || !shellIntent || shellIntent.type !== 'composeAgreementTemplate') return;
    const key = [
      shellIntent.mode || '',
      shellIntent.templateId || '',
      shellIntent.nonce || '',
    ].join(':');
    if (agreementIntentHandled.current === key) return;
    agreementIntentHandled.current = key;
    agreementReturnRef.current = {
      returnDraft: shellIntent.returnDraft && typeof shellIntent.returnDraft === 'object'
        ? shellIntent.returnDraft
        : {},
    };
    setFromAgreement(true);
    clearShellIntent?.();
    const mode = shellIntent.mode || 'blank';
    if (mode === 'edit' && shellIntent.templateId) {
      const existing = (state.formTemplates || []).find((row) => row.id === shellIntent.templateId);
      if (existing) {
        setDraft(draftFromTemplate({ ...existing, category: 'avtale' }));
        say('Rediger avtalemalen. Lagre for å gå tilbake til avtalebehandlingen.');
        return;
      }
    }
    if (mode === 'starter') {
      openFresh(agreementStarterTemplate());
      say('Standard avtalemal. Juster feltene og lagre for å fortsette.');
      return;
    }
    openFresh({
      ...blankForm(),
      category: 'avtale',
      title: 'Avtalemal',
      intro: 'Tom avtalemal. Legg inn feltene du trenger før du lagrer.',
      fields: [{ id: '', label: 'Avtalen', kind: 'title', editor: 'fast', required: false, help: '', placeholder: '', width: 'full', options: [], value: '' }],
    });
    say('Tom avtalemal. Bygg malen og lagre for å gå tilbake til avtalebehandlingen.');
  }, [state, shellIntent, clearShellIntent]);

  async function save({ quiet = false } = {}) {
    const known = new Set((state.formTemplates || []).map((row) => row.id));
    const toSave = agreementReturnRef.current
      ? { ...draft, category: 'avtale' }
      : draft;
    const result = await commit(saveFormTemplate(state, toSave));
    if (!result) return null;
    const saved = draft.id
      ? result.state.formTemplates.find((row) => row.id === draft.id)
      : result.state.formTemplates.find((row) => row.title === toSave.title && !known.has(row.id))
        || result.state.formTemplates.find((row) => row.category === 'avtale' && !known.has(row.id));
    if (saved && returnToAgreement(saved.id)) {
      showSaveToast('Avtalemalen er lagret.');
      return saved;
    }
    if (saved) await syncControl(saved);
    if (!quiet) {
      say('Skjemaet er lagret.');
      showSaveToast('Skjemaet er lagret.');
    }
    if (saved) setDraft(draftFromTemplate(saved));
    return saved || null;
  }

  function adoptForm(form, text) {
    setDraft((current) => applyImportedForm(current, form));
    setScanToken((value) => value + 1);
    say(text);
  }

  async function removeTemplate(template) {
    setPendingDelete('');
    const result = await commit(deleteFormTemplate(state, template.id));
    const control = controlOf(template);
    if (result?.ok && control && !template.libraryKey) await dc.storeControl(archiveControl(control, { actor }));
    if (result?.ok) {
      say(template.libraryKey ? 'Bedriftens versjon er slettet. KS-malen fra biblioteket står igjen.' : 'Skjemaet er slettet.');
      showSaveToast('Skjemaet er slettet.');
    }
  }

  async function readDocument(mode) {
    setBusy(true);
    say('');
    try {
      const picked = mode === 'scan'
        ? await pickImage({ camera: true, edit: false })
        : await pickDocument({ accept: FORM_IMPORT_ACCEPT });
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) {
        setBusy(false);
        return;
      }
      setReading(true);
      const bytes = await bytesFromFile(file);
      if (!bytes?.length) {
        say('Kunne ikke lese filen.', true);
        return;
      }
      const name = file.name || (mode === 'scan' ? 'skann.jpg' : 'dokument');
      const interpreted = await readFormImport(bytes, name, {
        ask: (payload) => askCompanyForm(payload.bytes, payload.filename, file.mimeType || ''),
      });
      const attention = formAttention(interpreted.form);
      const understood = interpreted.engine === 'text'
        ? ' fra teksten i filen'
        : interpreted.engine?.includes('ocr')
          ? ' fra bildet, med OCR'
          : ' fra dokumentet';
      const review = attention.issues.length
        ? ` ${attention.issues.length} punkt bør ses over.`
        : '';
      const kept = draft?.id ? ' Lagre oppdaterer dette skjemaet.' : '';
      const design = interpreted.summary ? ` ${interpreted.summary}` : '';
      adoptForm(interpreted.form, `Skjemaet er lest${understood}.${design} Ingenting er lagret før du trykker Lagre.${review}${kept}`);
    } catch (err) {
      const denied = err?.message === 'camera-denied';
      say(denied ? 'Gi tilgang til kamera, eller bruk Importer.' : (err?.message || 'Kunne ikke lese dokumentet.'), true);
    } finally {
      setReading(false);
      setBusy(false);
    }
  }

  const busyOverlay = (
    <BrandBusyOverlay
      visible={reading}
      label="Leser dokumentet…"
      detail="Bygger skjemaet fra filen. Dette kan ta litt tid."
    />
  );

  if (!state) return <Text style={{ color: colors.muted }}>Henter skjemaene …</Text>;

  if (filled) {
    return (
      <FormFill
        doc={filled}
        colors={colors}
        company={company}
        logo={logoUrl}
        actor={actor}
        busy={saving}
        note={note}
        noteBad={noteBad}
        fill={fill}
        onChange={setFilled}
        onSave={() => storeFilled(filled, 'Dokumentet er lagret.')}
        onComplete={completeFilled}
        onReopen={() => storeFilled(reopenFilledDoc(filled, { actor }), 'Dokumentet er åpnet for endring.')}
        onDelete={filledDocs.some((row) => row.id === filled.id) ? removeFilled : null}
        onBack={() => {
          const back = fillReturnRef.current;
          fillReturnRef.current = null;
          setFilled(null);
          say('');
          if (back) setDraft(back);
        }}
        backLabel={fillReturnRef.current ? 'Tilbake til malen' : 'Alle skjema'}
      />
    );
  }

  if (draft) {
    const draftControl = controlOf(draft);
    const governed = !fromAgreement && draft.category !== 'avtale' && (!!draftControl || autoControlled(draft));
    const docPanel = !fromAgreement && draft.category !== 'avtale' ? (
      <View style={{ gap: 12 }}>
        {isoManaged(draft) ? (
          <TouchableOpacity onPress={() => requestShellTab?.('iso', 'skjema')} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Versjon og godkjenning for dette ISO-skjemaet styres i ISO › Skjemaer.</Text>
          </TouchableOpacity>
        ) : draft.id || governed ? (
          <DocControlPanel
            colors={colors}
            dc={dc}
            control={draftControl}
            title="Versjon og godkjenning"
            create={() => newTemplateControl(draft, { controls: dc.controls, settings: dc.settings, actor })}
            snapshot={templateSnapshot(draft)}
            beforeSubmit={async () => {
              const saved = await save({ quiet: true });
              return saved ? templateSnapshot(saved) : null;
            }}
            filled={filledDocs}
            onPreview={previewSnapshot}
          />
        ) : (
          <Text style={{ color: colors.muted }}>Lagre malen for å ta den inn i dokumentstyringen med versjon og godkjenning.</Text>
        )}
        <DocComments
          colors={colors}
          dc={dc}
          control={draftControl}
          anchors={(draft.fields || []).filter((field) => field.kind === 'title' && field.label).map((field) => ({ id: field.id, label: field.label }))}
        />
      </View>
    ) : null;
    return (
      <>
        <FormStudio
          docHead={governed ? draftHeaderForTemplate(draft, draftControl) : null}
          docStatus={governed ? (draftControl ? controlStatus(draftControl) : NOT_CONTROLLED) : null}
          docPanel={docPanel}
          key={scanToken}
          draft={draft}
          colors={colors}
          busy={busy || reading}
          note={note}
          noteBad={noteBad}
          fill={fill}
          onDraft={setDraft}
          onBack={() => {
            if (agreementReturnRef.current) {
              returnToAgreement(draft.id || agreementReturnRef.current.returnDraft?.templateId || '');
              return;
            }
            setDraft(null);
            say('');
          }}
          onSave={save}
          onScan={() => readDocument('scan')}
          onImport={() => readDocument('import')}
          onFill={fromAgreement ? null : () => {
            const current = draft;
            setDraft(null);
            startFill(current, current);
          }}
          companyLogo={companyLogo}
          company={company}
          backLabel={fromAgreement ? 'Tilbake til avtale' : 'Alle skjema'}
        />
        {busyOverlay}
      </>
    );
  }

  const myApprovals = pendingFor(dc.controls, actor, dc.settings, { isAdmin: dc.isAdmin }).approvals.length;
  const groups = libraryGroups()
    .map((group) => ({ ...group, entries: group.entries.filter((row) => libraryHits.has(row.key)) }))
    .filter((group) => group.entries.length);

  return (
    <>
      <ScrollView style={fill ? { flex: 1 } : undefined} contentContainerStyle={styles.list}>
        <CreateMenu
          label="Nytt skjema"
          title="Les inn en mal"
          info="Ta bilde når malen ligger på papir. Last opp fil når du har PDF, Word, bilde eller tekst. Begge leses med AI og blir et dokument du retter før du lagrer."
          actions={[
            { id: 'scan', label: reading ? 'Leser …' : 'Ta bilde av papir', hint: 'Åpner kameraet. Brukes når avtalen ligger foran deg.', primary: true, onPress: () => readDocument('scan'), disabled: busy || reading },
            { id: 'import', label: reading ? 'Leser …' : 'Last opp fil', hint: 'PDF, Word, bilde eller tekst fra maskinen. Samme lesing, uten kamera.', onPress: () => readDocument('import'), disabled: busy || reading },
          ]}
        />
        <View style={styles.tabs}>
          {TABS.map((item) => (
            <TouchableOpacity
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === item.id }}
              style={[styles.tab, { backgroundColor: tab === item.id ? colors.brand : colors.sunken }]}
            >
              <Text style={{ color: tab === item.id ? '#fff' : colors.ink, fontWeight: '600' }}>
                {item.label}
                {item.id === 'utfylt' && ownFilled.length ? ` (${ownFilled.length})` : ''}
                {item.id === 'maler' && templates.length ? ` (${templates.length})` : ''}
                {item.id === 'styring' && myApprovals ? ` (${myApprovals})` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {tab !== 'styring' ? (
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={tab === 'bibliotek' ? 'Søk i KS-malene, for eksempel SJA eller C1-B-03' : tab === 'utfylt' ? 'Søk i utfylte dokumenter' : 'Søk i skjemaer'}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        ) : null}
        {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}

        {tab === 'bibliotek' ? (
          <KsLibraryList
            colors={colors}
            groups={groups}
            query={query}
            drawers={libraryDrawers}
            onDrawers={setLibraryDrawers}
            templates={templates}
            filledDocs={filledDocs}
            dc={dc}
            onFill={fillLibrary}
            onEdit={openLibrary}
            onModule={(target) => requestShellTab?.(target.tab, target.subView || null)}
          />
        ) : null}

        {tab === 'maler' ? (
          <>
            <View style={styles.grid}>
              {STARTERS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => openStarter(item.kind)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                  style={[styles.starter, { borderColor: colors.line, backgroundColor: colors.card }]}
                >
                  <View style={[styles.icon, { backgroundColor: colors.sunken }]}>
                    <Ionicons name={item.icon} size={22} color={colors.brand} />
                  </View>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{item.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.kicker, { color: colors.muted }]}>Bedriftens skjemaer</Text>
            {visible.map((template) => (
              <View key={template.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <TouchableOpacity onPress={() => { setDraft(draftFromTemplate(template)); say(''); }} accessibilityRole="button">
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{template.title}</Text>
                  <Text style={{ color: colors.muted }}>
                    {template.category === 'avtale' ? 'Avtalemal · ' : 'Utfylling · '}
                    {template.libraryKey ? 'KS-mal · ' : ''}
                    {template.fields.length} felt
                    {template.responses?.length ? ` · ${template.responses.length} svar` : ''}
                    {template.intro ? ` · ${template.intro}` : ''}
                  </Text>
                  {controlOf(template) ? <StatusChip status={controlStatus(controlOf(template))} colors={colors} /> : null}
                </TouchableOpacity>
                <View style={styles.row}>
                  {onPick ? (
                    <TouchableOpacity onPress={() => onPick(template.id)} accessibilityRole="button">
                      <Text style={{ color: colors.brand }}>Hent inn</Text>
                    </TouchableOpacity>
                  ) : null}
                  {template.category !== 'avtale' ? (
                    <TouchableOpacity onPress={() => startFill(template)} accessibilityRole="button" accessibilityLabel={`Fyll ut ${template.title}`}>
                      <Text style={{ color: colors.brand, fontWeight: '600' }}>Fyll ut</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => { setDraft(draftFromTemplate(template)); say(''); }} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>Åpne</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const nextCategory = template.category === 'avtale' ? 'skjema' : 'avtale';
                      const result = await commit(saveFormTemplate(state, { ...template, category: nextCategory }));
                      if (result?.ok) {
                        say(nextCategory === 'avtale' ? 'Merket som avtalemal.' : 'Merket som utfyllingsskjema.');
                        showSaveToast(nextCategory === 'avtale' ? 'Merket som avtalemal.' : 'Merket som utfyllingsskjema.');
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>
                      {template.category === 'avtale' ? 'Fjern avtalemerking' : 'Merk som avtalemal'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setDraft(draftFromTemplate(template, { copy: true })); say(`Kopi av ${template.title}.`); }} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>Kopier</Text>
                  </TouchableOpacity>
                  {pendingDelete === template.id ? (
                    <View style={styles.confirm}>
                      <Text style={{ color: colors.ink }}>Slette «{template.title}»? Svarene i skjemaet følger med.</Text>
                      <TouchableOpacity onPress={() => removeTemplate(template)} accessibilityRole="button" accessibilityLabel={`Slett ${template.title} nå`}>
                        <Text style={{ color: colors.danger, fontWeight: '700' }}>Slett nå</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setPendingDelete('')} accessibilityRole="button">
                        <Text style={{ color: colors.muted }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setPendingDelete(template.id)} accessibilityRole="button" accessibilityLabel={`Slett ${template.title}`}>
                      <Text style={{ color: colors.danger }}>Slett</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
            {!visible.length ? <Text style={{ color: colors.muted }}>{templates.length ? 'Ingen skjema treffer søket.' : 'Bedriften har ingen egne skjema ennå. Start fra en KS-mal eller et tomt skjema.'}</Text> : null}
          </>
        ) : null}

        {tab === 'styring' ? (
          <DocOverview
            colors={colors}
            dc={dc}
            filled={filledDocs}
            onOpen={openControl}
            onPreview={previewSnapshot}
            snapshotFor={(control) => {
              if (control.kind !== 'template') return null;
              const template = templateOf(control);
              return template ? templateSnapshot(template) : null;
            }}
            libraryMissing={missingLibrary.length}
            onAddLibrary={saving ? null : addLibraryControls}
          />
        ) : null}

        {tab === 'utfylt' ? (
          <>
            {visibleFilled.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => { setFilled(row); say(''); }}
                accessibilityRole="button"
                style={[styles.card, styles.filledRow, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <FilledStatusIcon status={row.status} colors={colors} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {filledLine(row)} · {dateLabel(row.updatedAt)}{row.updatedBy?.name ? ` · ${row.updatedBy.name}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            ))}
            {!visibleFilled.length ? (
              <Text style={{ color: colors.muted }}>
                {ownFilled.length ? 'Ingen dokumenter treffer søket.' : 'Ingen utfylte dokumenter ennå. Velg «Fyll ut» på en KS-mal.'}
              </Text>
            ) : null}
            <Text style={{ color: colors.muted, fontSize: 12 }}>Personaldokumenter som taushetserklæring og pårørendeskjema ligger i HR.</Text>
          </>
        ) : null}
      </ScrollView>
      {busyOverlay}
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, padding: 12, paddingBottom: 32 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  filledRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  starter: { width: 168, flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  confirm: { gap: 8, paddingTop: 4 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
